import { AvoInspectorEnv, AvoInspectorEnvValueType } from "./AvoInspectorEnv";
import { AvoSchemaParser } from "./AvoSchemaParser";
import { AvoBatcher } from "./AvoBatcher";
import { AvoNetworkCallsHandler } from "./AvoNetworkCallsHandler";
import { AvoStorage } from "./AvoStorage";
import { AvoDeduplicator } from "./AvoDeduplicator";
import { AvoStreamId } from "./AvoStreamId";
import { EventSpecCache } from "./eventSpec/AvoEventSpecCache";
import { AvoEventSpecFetcher } from "./eventSpec/AvoEventSpecFetcher";
import { validateEvent } from "./eventSpec/EventValidator";

import { isValueEmpty } from "./utils";
import type { ValidationResult, PropertyValidationResult, EventSpecResponse } from "./eventSpec/AvoEventSpecFetchTypes";

const libVersion = require("../package.json").version;

export class AvoInspector {
  environment: AvoInspectorEnvValueType;
  avoBatcher: AvoBatcher;
  avoDeduplicator: AvoDeduplicator;
  apiKey: string;
  version: string;
  publicEncryptionKey?: string;

  // Event spec fetching and validation fields
  private streamId?: string;
  private eventSpecCache?: EventSpecCache;
  private eventSpecFetcher?: AvoEventSpecFetcher;
  private currentBranchId: string | null = null;

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

  constructor(options: {
    apiKey: string;
    env: AvoInspectorEnvValueType;
    version: string;
    appName?: string;
    publicEncryptionKey?: string;
  }) {
    // the constructor does aggressive null/undefined checking because same code paths will be accessible from JS
    if (isValueEmpty(options.env)) {
      this.environment = AvoInspectorEnv.Dev;
      console.warn(
        "[Avo Inspector] No environment provided. Defaulting to dev."
      );
    } else if (Object.values(AvoInspectorEnv).indexOf(options.env) === -1) {
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

    if (options.publicEncryptionKey) {
      this.publicEncryptionKey = options.publicEncryptionKey;
    }

    if (this.environment === AvoInspectorEnv.Dev) {
      AvoInspector._batchSize = 1;
      AvoInspector._shouldLog = true;
    } else {
      AvoInspector._batchSize = 30;
      AvoInspector._batchFlushSeconds = 30;
      AvoInspector._shouldLog = false;
    }

    AvoInspector.avoStorage = new AvoStorage(AvoInspector._shouldLog);

    let avoNetworkCallsHandler = new AvoNetworkCallsHandler(
      this.apiKey,
      this.environment.toString(),
      options.appName || "",
      this.version,
      libVersion,
      this.publicEncryptionKey
    );
    this.avoBatcher = new AvoBatcher(avoNetworkCallsHandler);
    this.avoDeduplicator = new AvoDeduplicator();

    // Initialize event spec validation infrastructure for dev/staging
    if (this.environment !== AvoInspectorEnv.Prod) {
      this.eventSpecCache = new EventSpecCache(AvoInspector._shouldLog);
      this.eventSpecFetcher = new AvoEventSpecFetcher(
        5000,
        AvoInspector._shouldLog,
        this.environment
      );

      if (AvoInspector._shouldLog) {
        console.log(
          "[Avo Inspector] Event spec fetching and validation enabled"
        );
      }
    }

    // Fire-and-forget: eagerly initialize the anonymous ID and capture streamId
    AvoStreamId.initialize().then((id) => {
      this.streamId = id;
    }).catch((e) => {
      console.error(
        "Avo Inspector: failed to initialize anonymous ID.",
        e
      );
    });
  }

  async trackSchemaFromEvent(
    eventName: string,
    eventProperties: { [propName: string]: any }
  ): Promise<Array<{
    propertyName: string;
    propertyType: string;
    children?: any;
  }>> {
    try {
      if (
        this.avoDeduplicator.shouldRegisterEvent(
          eventName,
          eventProperties,
          false
        )
      ) {
        if (AvoInspector.shouldLog) {
          console.log(
            "Avo Inspector: supplied event " +
              eventName +
              " with params " +
              JSON.stringify(eventProperties)
          );
        }
        let eventSchema = this.extractSchema(eventProperties, false);

        // Fetch and validate event spec (async)
        const validationResult = await this.fetchAndValidateEvent(
          eventName,
          eventProperties
        );

        if (validationResult) {
          // Merge validation results into schema
          const schemaWithValidation = this.mergeValidationResults(
            eventSchema,
            validationResult
          );
          // Send validated events immediately, bypassing the batcher
          this.sendEventWithValidation(
            eventName, schemaWithValidation, null, null,
            validationResult, eventProperties
          );
        } else {
          this.trackSchemaInternal(eventName, eventSchema, null, null, eventProperties);
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
    eventProperties: { [propName: string]: any },
    eventId: string,
    eventHash: string
  ): Promise<Array<{
    propertyName: string;
    propertyType: string;
    children?: any;
  }>> {
    try {
      if (
        this.avoDeduplicator.shouldRegisterEvent(
          eventName,
          eventProperties,
          true
        )
      ) {
        if (AvoInspector.shouldLog) {
          console.log(
            "Avo Inspector: supplied event " +
              eventName +
              " with params " +
              JSON.stringify(eventProperties)
          );
        }
        let eventSchema = this.extractSchema(eventProperties, false);

        // Fetch and validate event spec (async)
        const validationResult = await this.fetchAndValidateEvent(
          eventName,
          eventProperties
        );

        if (validationResult) {
          const schemaWithValidation = this.mergeValidationResults(
            eventSchema,
            validationResult
          );
          // Send validated events immediately, bypassing the batcher
          this.sendEventWithValidation(
            eventName, schemaWithValidation, eventId, eventHash,
            validationResult, eventProperties
          );
        } else {
          this.trackSchemaInternal(eventName, eventSchema, eventId, eventHash, eventProperties);
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

  trackSchema(
    eventName: string,
    eventSchema: Array<{
      propertyName: string;
      propertyType: string;
      children?: any;
    }>
  ): void {
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
      children?: any;
    }>,
    eventId: string | null,
    eventHash: string | null,
    eventProperties?: Record<string, any>
  ): void {
    try {
      this.avoBatcher.handleTrackSchema(
        eventName,
        eventSchema,
        eventId,
        eventHash,
        eventProperties
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
    eventProperties: {
      [propName: string]: any;
    },
    shouldLogIfEnabled = true
  ): Array<{
    propertyName: string;
    propertyType: string;
    children?: any;
  }> {
    try {
      if (this.avoDeduplicator.hasSeenEventParams(eventProperties, true)) {
        if (shouldLogIfEnabled && AvoInspector.shouldLog) {
          console.warn(
            "Avo Inspector: WARNING! You are trying to extract schema shape that was just reported by your Avo functions. " +
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

      return AvoSchemaParser.extractSchema(eventProperties);
    } catch (e) {
      console.error(
        "Avo Inspector: something went wrong. Please report to support@avo.app.",
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
   * Handles branch change detection and cache storage for a fetched event spec.
   */
  private handleBranchChangeAndCache(
    specResponse: EventSpecResponse,
    eventName: string
  ): void {
    const newBranchId = specResponse.metadata.branchId;
    if (this.currentBranchId !== null && this.currentBranchId !== newBranchId) {
      if (AvoInspector.shouldLog) {
        console.log(
          `[Avo Inspector] Branch changed from ${this.currentBranchId} to ${newBranchId}. Flushing cache.`
        );
      }
      this.eventSpecCache?.clear();
    }
    this.currentBranchId = newBranchId;

    if (this.eventSpecCache && this.streamId) {
      this.eventSpecCache.set(
        this.apiKey,
        this.streamId,
        eventName,
        specResponse
      );
    }
  }

  /**
   * Fetches event spec and validates the event against it.
   * Returns ValidationResult if spec is available, null otherwise.
   * Only runs in dev/staging environments.
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
      let specResponse: EventSpecResponse | null | undefined = undefined;
      if (this.eventSpecCache) {
        specResponse = this.eventSpecCache.get(
          this.apiKey,
          this.streamId,
          eventName
        );
      }

      // Cache miss - fetch from API
      if (specResponse === undefined) {
        const fetched = await this.eventSpecFetcher.fetch({
          apiKey: this.apiKey,
          streamId: this.streamId,
          eventName
        });

        if (fetched) {
          this.handleBranchChangeAndCache(fetched, eventName);
          specResponse = fetched;
        } else {
          // Cache null response to prevent re-fetching
          if (this.eventSpecCache && this.streamId) {
            this.eventSpecCache.set(
              this.apiKey,
              this.streamId,
              eventName,
              null
            );
          }
          specResponse = null;
        }
      }

      // If we have a spec (not null), validate the event
      if (specResponse) {
        const validationResult = await validateEvent(eventProperties, specResponse);
        return validationResult;
      }

      return null;
    } catch (error) {
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
   */
  private mergeValidationResults(
    eventSchema: Array<{
      propertyName: string;
      propertyType: string;
      children?: any;
    }>,
    validationResult: ValidationResult
  ): Array<{
    propertyName: string;
    propertyType: string;
    children?: any;
    failedEventIds?: string[];
    passedEventIds?: string[];
  }> {
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
      children?: any;
    },
    propValidation?: PropertyValidationResult
  ): {
    propertyName: string;
    propertyType: string;
    children?: any;
    failedEventIds?: string[];
    passedEventIds?: string[];
  } {
    const result: any = {
      propertyName: prop.propertyName,
      propertyType: prop.propertyType
    };

    // Recursively merge validation results into children
    if (prop.children && Array.isArray(prop.children)) {
      result.children = prop.children.map((child: any) => {
        if (typeof child === 'string') {
          return child;
        }
        if (child && typeof child === 'object' && child.propertyName) {
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
   * Sends a validated event immediately, bypassing the batcher.
   * Matches Android SDK's sendEventWithValidation behavior.
   */
  private sendEventWithValidation(
    eventName: string,
    eventSchema: Array<{
      propertyName: string;
      propertyType: string;
      children?: any;
      failedEventIds?: string[];
      passedEventIds?: string[];
    }>,
    eventId: string | null,
    eventHash: string | null,
    validationResult: ValidationResult,
    eventProperties?: Record<string, any>
  ): void {
    const networkHandler = this.avoBatcher.networkCallsHandler;
    networkHandler.bodyForEventSchemaCall(
      eventName,
      eventSchema,
      eventId,
      eventHash,
      eventProperties,
      validationResult.metadata
    ).then((eventBody) => {
      networkHandler.reportValidatedEvent(eventBody);
    }).catch((e) => {
      console.error(
        "Avo Inspector: failed to send validated event.",
        e
      );
    });
  }
}
