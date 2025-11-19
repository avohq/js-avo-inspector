import { AvoInspectorEnv, type AvoInspectorEnvValueType } from "./AvoInspectorEnv";
import { AvoSchemaParser } from "./AvoSchemaParser";
import { AvoBatcher } from "./AvoBatcher";
import { AvoNetworkCallsHandler } from "./AvoNetworkCallsHandler";
import { AvoStorage } from "./AvoStorage";
import { AvoDeduplicator } from "./AvoDeduplicator";
import { EventSpecCache } from "./eventSpec/cache";
import { EventSpecFetcher } from "./eventSpec/fetcher";

import { isValueEmpty } from "./utils";

const libVersion = require("../package.json").version;

export class AvoInspector {
  environment: AvoInspectorEnvValueType;
  avoBatcher: AvoBatcher;
  avoDeduplicator: AvoDeduplicator;
  apiKey: string;
  version: string;

  // Event spec fetching fields (Phase 1: Fetch & Cache Only)
  // Phase 1 (Current): Fetch event specs from API and cache them for future use
  // Phase 2 (Future): Validate event properties against fetched specs and optionally encrypt/send values
  //
  // encryptionKey: Reserved for Phase 2 - will control whether property values are encrypted and sent
  // schemaId/sourceId: Required for spec fetching to work
  // branchId: Branch to fetch specs from (defaults to "main")
  private encryptionKey?: string;
  private schemaId?: string;
  private sourceId?: string;
  private branchId: string;
  private eventSpecCache?: EventSpecCache;
  private eventSpecFetcher?: EventSpecFetcher;

  static avoStorage: AvoStorage;

  private static _batchSize = 30;
  static get batchSize () {
    return this._batchSize;
  }

  static set batchSize (newSize: number) {
    if (newSize < 1) {
      this._batchSize = 1;
    } else {
      this._batchSize = newSize;
    }
  }

  private static _batchFlushSeconds = 30;
  static get batchFlushSeconds () {
    return this._batchFlushSeconds;
  }

  private static _shouldLog = false;
  static get shouldLog () {
    return this._shouldLog;
  }

  static set shouldLog (enable) {
    this._shouldLog = enable;
  }

  private static _networkTimeout = 2000;
  static get networkTimeout () {
    return this._networkTimeout;
  }

  static set networkTimeout (timeout) {
    this._networkTimeout = timeout;
  }

  // constructor(apiKey: string, env: AvoInspectorEnv, version: string) {
  constructor (options: {
    apiKey: string
    env: AvoInspectorEnvValueType
    version: string
    appName?: string
    suffix?: string
    encryptionKey?: string
    schemaId?: string
    sourceId?: string
    branchId?: string
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

    AvoInspector.avoStorage = new AvoStorage(AvoInspector._shouldLog, options.suffix != null ? options.suffix : "");

    const avoNetworkCallsHandler = new AvoNetworkCallsHandler(
      this.apiKey,
      this.environment.toString(),
      options.appName || "",
      this.version,
      libVersion
    );
    this.avoBatcher = new AvoBatcher(avoNetworkCallsHandler);
    this.avoDeduplicator = new AvoDeduplicator();

    // Initialize event spec fetching (Phase 1: Fetch & Cache Only)
    // Phase 1: Fetch event specs from API and cache them - no validation yet
    // Phase 2: Will add validation of event properties against specs
    this.encryptionKey = options.encryptionKey;
    this.schemaId = options.schemaId;
    this.sourceId = options.sourceId;
    this.branchId = options.branchId || "main";

    if (this.schemaId && this.sourceId) {
      this.eventSpecCache = new EventSpecCache(AvoInspector._shouldLog);
      this.eventSpecFetcher = new EventSpecFetcher(
        AvoInspector._networkTimeout,
        AvoInspector._shouldLog
      );

      if (AvoInspector._shouldLog) {
        if (this.encryptionKey) {
          console.log(
            "[Avo Inspector] Event spec fetching enabled with encryption key (Phase 1: fetch/cache only, validation in Phase 2)"
          );
        } else {
          console.log(
            "[Avo Inspector] Event spec fetching enabled (Phase 1: fetch/cache only, validation in Phase 2)"
          );
        }
      }
    }
  }

  trackSchemaFromEvent (
    eventName: string,
    eventProperties: Record<string, any>
  ): Array<{
      propertyName: string
      propertyType: string
      children?: any
    }> {
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

        // Fetch event spec if spec fetching is enabled (async, non-blocking)
        this.fetchEventSpecIfNeeded(eventName);

        const eventSchema = this.extractSchema(eventProperties, false);
        this.trackSchemaInternal(eventName, eventSchema, null, null);
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

  private _avoFunctionTrackSchemaFromEvent (
    eventName: string,
    eventProperties: Record<string, any>,
    eventId: string,
    eventHash: string
  ): Array<{
      propertyName: string
      propertyType: string
      children?: any
    }> {
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

        // Fetch event spec if spec fetching is enabled (async, non-blocking)
        this.fetchEventSpecIfNeeded(eventName);

        const eventSchema = this.extractSchema(eventProperties, false);
        this.trackSchemaInternal(eventName, eventSchema, eventId, eventHash);
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

  trackSchema (
    eventName: string,
    eventSchema: Array<{
      propertyName: string
      propertyType: string
      children?: any
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

        // Fetch event spec if spec fetching is enabled (async, non-blocking)
        this.fetchEventSpecIfNeeded(eventName);

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

  private trackSchemaInternal (
    eventName: string,
    eventSchema: Array<{
      propertyName: string
      propertyType: string
      children?: any
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

  enableLogging (enable: boolean) {
    AvoInspector._shouldLog = enable;
  }

  extractSchema (
    eventProperties: Record<string, any>,
    shouldLogIfEnabled = true
  ): Array<{
      propertyName: string
      propertyType: string
      children?: any
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

      return AvoSchemaParser.extractSchema(eventProperties);
    } catch (e) {
      console.error(
        "Avo Inspector: something went wrong. Please report to support@avo.app.",
        e
      );
      return [];
    }
  }

  setBatchSize (newBatchSize: number): void {
    AvoInspector._batchSize = newBatchSize;
  }

  setBatchFlushSeconds (newBatchFlushSeconds: number): void {
    AvoInspector._batchFlushSeconds = newBatchFlushSeconds;
  }

  /**
   * Fetches the event spec if spec fetching is enabled (schemaId/sourceId provided).
   * This is async and non-blocking - failures are logged but don't prevent tracking.
   *
   * Phase 1 (Current): Fetches and caches event specs from API
   * Phase 2 (Future): Will use cached specs to validate event properties
   *
   * Note: Spec fetching happens regardless of encryption key presence.
   * The encryption key is reserved for Phase 2 (validation + optional encryption).
   */
  private fetchEventSpecIfNeeded(eventName: string): void {
    // Only fetch if we have the required infrastructure
    if (
      !this.eventSpecCache ||
      !this.eventSpecFetcher ||
      !this.schemaId ||
      !this.sourceId
    ) {
      return;
    }

    try {
      // Check cache first
      const cachedSpec = this.eventSpecCache.get(
        this.schemaId,
        this.sourceId,
        eventName,
        this.branchId
      );

      if (cachedSpec) {
        // Cache hit - no need to fetch
        return;
      }

      // Cache miss - fetch from API (async, non-blocking)
      this.eventSpecFetcher
        .fetch({
          schemaId: this.schemaId,
          sourceId: this.sourceId,
          eventName,
          branchId: this.branchId
        })
        .then((spec) => {
          if (spec && this.eventSpecCache && this.schemaId && this.sourceId) {
            // Store in cache
            this.eventSpecCache.set(
              this.schemaId,
              this.sourceId,
              eventName,
              this.branchId,
              spec
            );
          }
        })
        .catch((error) => {
          // Graceful degradation - log but don't fail
          if (AvoInspector.shouldLog) {
            console.error(
              `[Avo Inspector] Failed to fetch event spec for ${eventName}:`,
              error
            );
          }
        });
    } catch (error) {
      // Graceful degradation - log but don't fail
      if (AvoInspector.shouldLog) {
        console.error(
          `[Avo Inspector] Error in fetchEventSpecIfNeeded for ${eventName}:`,
          error
        );
      }
    }
  }

}
