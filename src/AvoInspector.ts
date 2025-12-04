import { AvoInspectorEnv, type AvoInspectorEnvValueType } from "./AvoInspectorEnv";
import { AvoSchemaParser } from "./AvoSchemaParser";
import { AvoBatcher } from "./AvoBatcher";
import { AvoNetworkCallsHandler, type EventProperty } from "./AvoNetworkCallsHandler";
import { AvoStorage } from "./AvoStorage";
import { AvoDeduplicator } from "./AvoDeduplicator";
import { EventSpecCache } from "./eventSpec/AvoEventSpecCache";
import { AvoEventSpecFetcher } from "./eventSpec/AvoEventSpecFetcher";
import { AvoStreamId } from "./AvoStreamId";
import { validateEvent } from "./eventSpec/EventValidator";

import { isValueEmpty } from "./utils";
import type { EventSpecResponse, ValidationResult, PropertyValidationResult } from "./eventSpec/AvoEventSpecFetchTypes";

const libVersion = require("../package.json").version;

export class AvoInspector {
  environment: AvoInspectorEnvValueType;
  avoBatcher: AvoBatcher;
  avoDeduplicator: AvoDeduplicator;
  apiKey: string;
  version: string;

  // Network handler for immediate sends (when validation is available)
  private avoNetworkCallsHandler: AvoNetworkCallsHandler;

  // Event spec fetching and validation fields
  // publicEncryptionKey: RSA public key for encrypting property values - client keeps private key for decryption
  private publicEncryptionKey?: string;
  private streamId?: string;
  private eventSpecCache?: EventSpecCache;
  private eventSpecFetcher?: AvoEventSpecFetcher;

  static avoStorage: AvoStorage;

  private static _batchSize = 30;
  static get batchSize() {
    return this._batchSize;
  }

  static set batchSize(newSize: number) {
    if (newSize < 1) {
      this._batchSize = 1;
    } else {
      this._batchSize = newSize;
    }
  }

  private static _batchFlushSeconds = 30;
  static get batchFlushSeconds() {
    return this._batchFlushSeconds;
  }

  private static _shouldLog = false;
  static get shouldLog() {
    return this._shouldLog;
  }

  static set shouldLog(enable) {
    this._shouldLog = enable;
  }

  private static _networkTimeout = 2000;
  static get networkTimeout() {
    return this._networkTimeout;
  }

  static set networkTimeout(timeout) {
    this._networkTimeout = timeout;
  }

  constructor(options: {
    apiKey: string;
    env: AvoInspectorEnvValueType;
    version: string;
    appName?: string;
    suffix?: string;
    publicEncryptionKey?: string;
  }) {
    // the constructor does aggressive null/undefined checking because same code paths will be accessible from JS
    if (isValueEmpty(options.env)) {
      this.environment = AvoInspectorEnv.Dev;
      console.warn(
        "[Avo Inspector] No environment provided. Defaulting to dev."
      );
    } else if (!Object.values(AvoInspectorEnv).includes(options.env)) {
      this.environment = AvoInspectorEnv.Dev;
      console.warn(
        "[Avo Inspector] Unsupported environment provided. Defaulting to dev. Supported environments - Dev, Staging, Prod."
      );
    } else {
      this.environment = options.env;
    }

    if (isValueEmpty(options.apiKey)) {
      throw new Error(
        "[Avo Inspector] No API key provided. Inspector can't operate without API key."
      );
    } else {
      this.apiKey = options.apiKey;
    }

    if (isValueEmpty(options.version)) {
      throw new Error(
        "[Avo Inspector] No version provided. Many features of Inspector rely on versioning. Please provide comparable string version, i.e. integer or semantic."
      );
    } else {
      this.version = options.version;
    }

    if (this.environment === AvoInspectorEnv.Dev) {
      AvoInspector._batchSize = 1;
      AvoInspector._shouldLog = true;
    } else {
      AvoInspector._batchSize = 30;
      AvoInspector._batchFlushSeconds = 30;
      AvoInspector._shouldLog = false;
    }

    AvoInspector.avoStorage = new AvoStorage(
      AvoInspector._shouldLog,
      options.suffix != null ? options.suffix : ""
    );

    this.avoNetworkCallsHandler = new AvoNetworkCallsHandler(
      this.apiKey,
      this.environment.toString(),
      options.appName || "",
      this.version,
      libVersion
    );
    this.avoBatcher = new AvoBatcher(this.avoNetworkCallsHandler);
    this.avoDeduplicator = new AvoDeduplicator();

    this.publicEncryptionKey = options.publicEncryptionKey;
    this.streamId = AvoStreamId.streamId;

    // Enable event spec fetching if streamId is present (and not "unknown")
    if (this.streamId) {
      this.eventSpecCache = new EventSpecCache(AvoInspector._shouldLog);
      this.eventSpecFetcher = new AvoEventSpecFetcher(
        AvoInspector._networkTimeout,
        AvoInspector._shouldLog,
        this.environment
      );

      if (AvoInspector._shouldLog) {
        console.log(
          "[Avo Inspector] Event spec fetching and validation enabled"
        );
        if (this.publicEncryptionKey) {
          console.log("[Avo Inspector] Property value encryption enabled");
        }
      }
    }
  }

  async trackSchemaFromEvent(
    eventName: string,
    eventProperties: Record<string, any>
  ): Promise<EventProperty[]> {
    try {
      if (
        this.avoDeduplicator.shouldRegisterEvent(eventName, eventProperties, false)
      ) {
        if (AvoInspector.shouldLog) {
          console.log(
            "Avo Inspector: supplied event " +
              eventName +
              " with params " +
              JSON.stringify(eventProperties)
          );
        }

        const eventSchema = this.extractSchema(eventProperties, false);

        // Fetch and validate event spec (sync blocking)
        const validationResult = await this.fetchAndValidateEvent(
          eventName,
          eventProperties
        );

        if (validationResult) {
          // Spec available: merge validation results into schema and send immediately
          const schemaWithValidation = this.mergeValidationResults(
            eventSchema,
            validationResult
          );

          this.sendEventWithValidation(
            eventName,
            schemaWithValidation,
            null,
            null,
            validationResult
          );
        } else {
          // No spec: fall back to batched flow
          this.trackSchemaInternal(eventName, eventSchema, null, null);
        }

        return eventSchema;
      } else {
        if (AvoInspector.shouldLog) {
          console.log("Avo Inspector: Deduplicated event: " + eventName);
        }
        return [];
      }
    } catch (e) {
      console.error(
        "Avo Inspector: something went wrong. Please report to support@avo.app.",
        e
      );
      return [];
    }
  }

  private async _avoFunctionTrackSchemaFromEvent(
    eventName: string,
    eventProperties: Record<string, any>,
    eventId: string,
    eventHash: string
  ): Promise<EventProperty[]> {
    try {
      if (
        this.avoDeduplicator.shouldRegisterEvent(eventName, eventProperties, true)
      ) {
        if (AvoInspector.shouldLog) {
          console.log(
            "Avo Inspector: supplied event " +
              eventName +
              " with params " +
              JSON.stringify(eventProperties)
          );
        }

        const eventSchema = this.extractSchema(eventProperties, false);

        // Fetch and validate event spec (sync blocking)
        const validationResult = await this.fetchAndValidateEvent(
          eventName,
          eventProperties
        );

        if (validationResult) {
          // Spec available: merge validation results into schema and send immediately
          const schemaWithValidation = this.mergeValidationResults(
            eventSchema,
            validationResult
          );
          this.sendEventWithValidation(
            eventName,
            schemaWithValidation,
            eventId,
            eventHash,
            validationResult
          );
        } else {
          // No spec: fall back to batched flow
          this.trackSchemaInternal(eventName, eventSchema, eventId, eventHash);
        }

        return eventSchema;
      } else {
        if (AvoInspector.shouldLog) {
          console.log("Avo Inspector: Deduplicated event: " + eventName);
        }
        return [];
      }
    } catch (e) {
      console.error(
        "Avo Inspector: something went wrong. Please report to support@avo.app.",
        e
      );
      return [];
    }
  }

  async trackSchema(
    eventName: string,
    eventSchema: Array<{
      propertyName: string;
      propertyType: string;
      encryptedPropertyValue?: string;
      children?: any;
    }>
  ): Promise<void> {
    try {
      if (
        this.avoDeduplicator.shouldRegisterSchemaFromManually(
          eventName,
          eventSchema
        )
      ) {
        if (AvoInspector.shouldLog) {
          console.log(
            "Avo Inspector: supplied event " +
              eventName +
              " with schema " +
              JSON.stringify(eventSchema)
          );
        }

        // For trackSchema we don't have raw properties, so we can't validate
        // Just fetch/cache spec for future use and use batched flow
        await this.fetchEventSpecIfNeeded(eventName);
        this.trackSchemaInternal(eventName, eventSchema, null, null);
      } else {
        if (AvoInspector.shouldLog) {
          console.log("Avo Inspector: Deduplicated event: " + eventName);
        }
      }
    } catch (e) {
      console.error(
        "Avo Inspector: something went wrong. Please report to support@avo.app.",
        e
      );
    }
  }

  private trackSchemaInternal(
    eventName: string,
    eventSchema: Array<{
      propertyName: string;
      propertyType: string;
      encryptedPropertyValue?: string;
      children?: any;
    }>,
    eventId: string | null,
    eventHash: string | null
  ): void {
    try {
      this.avoBatcher.handleTrackSchema(
        eventName,
        eventSchema,
        eventId,
        eventHash
      );
    } catch (e) {
      console.error(
        "Avo Inspector: something went wrong. Please report to support@avo.app.",
        e
      );
    }
  }

  enableLogging(enable: boolean) {
    AvoInspector._shouldLog = enable;
  }

  extractSchema(
    eventProperties: Record<string, any>,
    shouldLogIfEnabled = true
  ): Array<{
    propertyName: string;
    propertyType: string;
    encryptedPropertyValue?: string;
    children?: any;
  }> {
    try {
      if (this.avoDeduplicator.hasSeenEventParams(eventProperties, true)) {
        if (shouldLogIfEnabled && AvoInspector.shouldLog) {
          console.warn(
            "Avo Inspector: WARNING! You are trying to extract schema shape that was just reported by your Avo Codegen. " +
              "This is an indicator of duplicate inspector reporting. " +
              "Please reach out to support@avo.app for advice if you are not sure how to handle this."
          );
        }
      }

      if (AvoInspector.shouldLog) {
        console.log(
          "Avo Inspector: extracting schema from " +
            JSON.stringify(eventProperties)
        );
      }

      return AvoSchemaParser.extractSchema(
        eventProperties,
        this.publicEncryptionKey,
        this.environment
      );
    } catch (e) {
      console.error(
        "Avo Inspector: something went wrong in extractSchema. Please report to support@avo.app.",
        e
      );
      return [];
    }
  }

  setBatchSize(newBatchSize: number): void {
    AvoInspector._batchSize = newBatchSize;
  }

  setBatchFlushSeconds(newBatchFlushSeconds: number): void {
    AvoInspector._batchFlushSeconds = newBatchFlushSeconds;
  }

  /**
   * Fetches the event spec if spec fetching is enabled.
   * Used by trackSchema when we don't have raw properties to validate.
   *
   * Note: EventSpec fetching only happens in dev/staging environments.
   */
  private async fetchEventSpecIfNeeded(eventName: string): Promise<void> {
    // Only fetch specs in dev/staging environments (NOT in production)
    if (this.environment === AvoInspectorEnv.Prod) {
      return;
    }

    // Only fetch if we have the required infrastructure
    if (!this.eventSpecCache || !this.eventSpecFetcher || !this.streamId) {
      return;
    }

    try {
      // Check cache first
      const cachedSpec = this.eventSpecCache.get(
        this.apiKey,
        this.streamId,
        eventName
      );

      if (cachedSpec) {
        // Cache hit - no need to fetch
        return;
      }

      // Cache miss - fetch from API (blocking)
      const response = await this.eventSpecFetcher.fetch({
        apiKey: this.apiKey,
        streamId: this.streamId,
        eventName
      });

      if (response && this.eventSpecCache && this.streamId) {
        // Store in cache
        this.eventSpecCache.set(
          this.apiKey,
          this.streamId,
          eventName,
          response
        );
      }
    } catch (error) {
      // Graceful degradation - log but don't fail
      if (AvoInspector.shouldLog) {
        console.error(
          `[Avo Inspector] Error fetching event spec for ${eventName}:`,
          error
        );
      }
    }
  }

  /**
   * Fetches event spec and validates the event against it.
   * Returns ValidationResult if spec is available, null otherwise.
   *
   * Note: EventSpec fetching and validation only happens in dev/staging environments.
   */
  private async fetchAndValidateEvent(
    eventName: string,
    eventProperties: Record<string, any>
  ): Promise<ValidationResult | null> {
    // Only fetch specs in dev/staging environments (NOT in production)
    if (this.environment === AvoInspectorEnv.Prod) {
      return null;
    }

    // Only fetch if we have the required infrastructure
    if (!this.eventSpecCache || !this.eventSpecFetcher || !this.streamId) {
      return null;
    }

    try {
      // Check cache first
      let specResponse = this.eventSpecCache.get(
        this.apiKey,
        this.streamId,
        eventName
      );

      // Cache miss - fetch from API (blocking)
      if (!specResponse) {
        specResponse = await this.eventSpecFetcher.fetch({
          apiKey: this.apiKey,
          streamId: this.streamId,
          eventName
        });

        // Store in cache if fetched successfully
        if (specResponse && this.eventSpecCache && this.streamId) {
          this.eventSpecCache.set(
            this.apiKey,
            this.streamId,
            eventName,
            specResponse
          );
        }
      }

      // If we have a spec, validate the event
      if (specResponse) {
        const validationResult = validateEvent(eventProperties, specResponse);
        return validationResult;
      }

      return null;
    } catch (error) {
      // Graceful degradation - log but don't fail
      if (AvoInspector.shouldLog) {
        console.error(
          `[Avo Inspector] Error validating event ${eventName}:`,
          error
        );
      }
      return null;
    }
  }

  /**
   * Merges validation results into the event schema.
   * Adds failedEventIds or passedEventIds to each property based on validation.
   * Recursively merges validation results for nested children.
   */
  private mergeValidationResults(
    eventSchema: Array<{
      propertyName: string;
      propertyType: string;
      encryptedPropertyValue?: string;
      children?: any;
    }>,
    validationResult: ValidationResult
  ): EventProperty[] {
    return eventSchema.map((prop) => {
      const propValidation = validationResult.propertyResults[prop.propertyName];
      return this.mergePropertyValidation(prop, propValidation);
    });
  }

  /**
   * Merges validation result into a single property, recursively handling children.
   */
  private mergePropertyValidation(
    prop: {
      propertyName: string;
      propertyType: string;
      encryptedPropertyValue?: string;
      children?: any;
    },
    propValidation?: PropertyValidationResult
  ): EventProperty {
    const result: EventProperty = {
      propertyName: prop.propertyName,
      propertyType: prop.propertyType
    };

    if (prop.encryptedPropertyValue) {
      result.encryptedPropertyValue = prop.encryptedPropertyValue;
    }

    // Recursively merge validation results into children
    if (prop.children && Array.isArray(prop.children)) {
      result.children = prop.children.map((child: any) => {
        // Children can be strings (for array types) or objects (for nested properties)
        if (typeof child === 'string') {
          return child;
        }
        if (child && typeof child === 'object' && child.propertyName) {
          // Get nested validation result for this child
          const childValidation = propValidation?.children?.[child.propertyName];
          return this.mergePropertyValidation(child, childValidation);
        }
        return child;
      });
    }

    // Add validation result for this property
    if (propValidation) {
      if (propValidation.failedEventIds) {
        result.failedEventIds = propValidation.failedEventIds;
      }
      if (propValidation.passedEventIds) {
        result.passedEventIds = propValidation.passedEventIds;
      }
    }

    return result;
  }

  /**
   * Sends an event immediately with validation data (bypasses batching).
   * Logs validation info if shouldLog is true.
   */
  private sendEventWithValidation(
    eventName: string,
    eventSchema: EventProperty[],
    eventId: string | null,
    eventHash: string | null,
    validationResult: ValidationResult
  ): void {
    // Log validation info if shouldLog is enabled
    if (AvoInspector.shouldLog) {
      const hasFailures = eventSchema.some(
        (p) => p.failedEventIds && p.failedEventIds.length > 0
      );
      if (hasFailures) {
        console.log(
          `[Avo Inspector] Validation failures for event "${eventName}":`,
          eventSchema
            .filter((p) => p.failedEventIds && p.failedEventIds.length > 0)
            .map((p) => ({
              property: p.propertyName,
              failedEventIds: p.failedEventIds
            }))
        );
      }
    }

    // Create the event body with validation data
    const eventBody = this.avoNetworkCallsHandler.bodyForEventSchemaCall(
      eventName,
      eventSchema,
      eventId,
      eventHash,
      validationResult.metadata ?? undefined,
      validationResult.metadata?.branchId
    );

    // Send immediately (bypass batching)
    this.avoNetworkCallsHandler.callInspectorImmediately(eventBody, (error) => {
      if (error) {
        if (AvoInspector.shouldLog) {
          console.error(
            `[Avo Inspector] Failed to send event "${eventName}" with validation:`,
            error
          );
        }
        // Fallback: add to batch on failure (without validation data)
        this.avoBatcher.handleTrackSchema(
          eventName,
          eventSchema,
          eventId,
          eventHash
        );
      } else {
        if (AvoInspector.shouldLog) {
          console.log(
            `[Avo Inspector] Event "${eventName}" sent successfully with validation`
          );
        }
      }
    });
  }
}
