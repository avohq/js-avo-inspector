import { AvoInspectorEnv, type AvoInspectorEnvValueType } from "../AvoInspectorEnv";
import { AvoSchemaParserLite as AvoSchemaParser } from "./AvoSchemaParserLite";
import { AvoBatcher } from "./AvoBatcherLite";
import { AvoNetworkCallsHandlerLite as AvoNetworkCallsHandler, type EventProperty } from "./AvoNetworkCallsHandlerLite";
import { AvoStorage } from "../AvoStorage";
import { AvoDeduplicator } from "./AvoDeduplicatorLite";
import { AvoStreamId } from "./AvoStreamIdLite";
import { isValueEmpty } from "../utils";

const libVersion = require("../../package.json").version;

export class AvoInspectorLite {
  environment: AvoInspectorEnvValueType;
  avoBatcher: AvoBatcher;
  avoDeduplicator: AvoDeduplicator;
  apiKey: string;
  version: string;

  private avoNetworkCallsHandler: AvoNetworkCallsHandler;

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
      AvoInspectorLite._batchSize = 1;
      AvoInspectorLite._shouldLog = true;
    } else {
      AvoInspectorLite._batchSize = 30;
      AvoInspectorLite._batchFlushSeconds = 30;
      AvoInspectorLite._shouldLog = false;
    }

    AvoInspectorLite.avoStorage = new AvoStorage(
      AvoInspectorLite._shouldLog,
      options.suffix != null ? options.suffix : ""
    );

    this.avoNetworkCallsHandler = new AvoNetworkCallsHandler(
      this.apiKey,
      this.environment.toString(),
      options.appName || "",
      this.version,
      libVersion,
      undefined
    );
    this.avoBatcher = new AvoBatcher(this.avoNetworkCallsHandler);
    this.avoDeduplicator = new AvoDeduplicator();
  }

  async trackSchemaFromEvent(
    eventName: string,
    eventProperties: Record<string, any>
  ): Promise<EventProperty[]> {
    try {
      if (
        this.avoDeduplicator.shouldRegisterEvent(eventName, eventProperties, false)
      ) {
        if (AvoInspectorLite.shouldLog) {
          console.log(
            "Avo Inspector: supplied event " +
              eventName +
              " with params " +
              JSON.stringify(eventProperties)
          );
        }

        const eventSchema = await this.extractSchema(eventProperties, false);
        this.trackSchemaInternal(eventName, eventSchema, null, null);
        return eventSchema;
      } else {
        if (AvoInspectorLite.shouldLog) {
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
        if (AvoInspectorLite.shouldLog) {
          console.log(
            "Avo Inspector: supplied event " +
              eventName +
              " with params " +
              JSON.stringify(eventProperties)
          );
        }

        const eventSchema = await this.extractSchema(eventProperties, false);
        this.trackSchemaInternal(eventName, eventSchema, eventId, eventHash);
        return eventSchema;
      } else {
        if (AvoInspectorLite.shouldLog) {
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
        await this.avoDeduplicator.shouldRegisterSchemaFromManually(
          eventName,
          eventSchema
        )
      ) {
        if (AvoInspectorLite.shouldLog) {
          console.log(
            "Avo Inspector: supplied event " +
              eventName +
              " with schema " +
              JSON.stringify(eventSchema)
          );
        }

        this.trackSchemaInternal(eventName, eventSchema, null, null);
      } else {
        if (AvoInspectorLite.shouldLog) {
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
    AvoInspectorLite._shouldLog = enable;
  }

  async extractSchema(
    eventProperties: Record<string, any>,
    shouldLogIfEnabled = true
  ): Promise<Array<{
    propertyName: string;
    propertyType: string;
    encryptedPropertyValue?: string;
    children?: any;
  }>> {
    try {
      if (this.avoDeduplicator.hasSeenEventParams(eventProperties, true)) {
        if (shouldLogIfEnabled && AvoInspectorLite.shouldLog) {
          console.warn(
            "Avo Inspector: WARNING! You are trying to extract schema shape that was just reported by your Avo Codegen. " +
              "This is an indicator of duplicate inspector reporting. " +
              "Please reach out to support@avo.app for advice if you are not sure how to handle this."
          );
        }
      }

      if (AvoInspectorLite.shouldLog) {
        console.log(
          "Avo Inspector: extracting schema from " +
            JSON.stringify(eventProperties)
        );
      }

      return await AvoSchemaParser.extractSchema(eventProperties);
    } catch (e) {
      console.error(
        "Avo Inspector: something went wrong in extractSchema. Please report to support@avo.app.",
        e
      );
      return [];
    }
  }

  setBatchSize(newBatchSize: number): void {
    AvoInspectorLite.batchSize = newBatchSize;
  }

  setBatchFlushSeconds(newBatchFlushSeconds: number): void {
    AvoInspectorLite._batchFlushSeconds = newBatchFlushSeconds;
  }
}

// Alias export so sibling lite modules can import { AvoInspector } from "./AvoInspectorLite"
export { AvoInspectorLite as AvoInspector };
