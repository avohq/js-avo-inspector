import AvoGuid from "./AvoGuid";
import { AvoInspector } from "./AvoInspector";
import { AvoStreamId } from "./AvoStreamId";
import { shouldEncrypt, encryptEventProperties } from "./AvoEncryption";
import type { EventSpecMetadata } from "./eventSpec/AvoEventSpecFetchTypes";

export interface BaseBody {
  apiKey: string;
  appName: string;
  appVersion: string;
  libVersion: string;
  env: string;
  libPlatform: "react-native";
  messageId: string;
  trackingId: string;
  sessionId: string;
  anonymousId: string;
  createdAt: string;
  samplingRate: number;
  publicEncryptionKey?: string;
}

export interface EventSchemaBody extends BaseBody {
  type: "event";
  eventName: string;
  eventProperties: Array<{
    propertyName: string;
    propertyType: string;
    encryptedPropertyValue?: string;
    children?: any;
    failedEventIds?: string[];
    passedEventIds?: string[];
  }>;
  avoFunction: boolean;
  eventId: string | null;
  eventHash: string | null;
  streamId?: string;
  eventSpecMetadata?: {
    schemaId?: string;
    branchId?: string;
    latestActionId?: string;
    sourceId?: string;
  };
}

export class AvoNetworkCallsHandler {
  private apiKey: string;
  private envName: string;
  private appName: string;
  private appVersion: string;
  private libVersion: string;
  private publicEncryptionKey?: string;
  private samplingRate: number = 1.0;
  private sending: boolean = false;

  private static trackingEndpoint = "https://api.avo.app/inspector/v1/track";

  constructor(
    apiKey: string,
    envName: string,
    appName: string,
    appVersion: string,
    libVersion: string,
    publicEncryptionKey?: string,
  ) {
    this.apiKey = apiKey;
    this.envName = envName;
    this.appName = appName;
    this.appVersion = appVersion;
    this.libVersion = libVersion;
    this.publicEncryptionKey = publicEncryptionKey;
  }

  callInspectorWithBatchBody(inEvents: Array<EventSchemaBody>, onCompleted: (error: string | null) => any): void {
    if (this.sending) {
      onCompleted("Batch sending cancelled because another batch sending is in progress. Your events will be sent with next batch.");
      return;
    }

    const events = inEvents.filter(x => x != null);

    if (events.length === 0) {
      return;
    }

    if (Math.random() > this.samplingRate) {
      if (AvoInspector.shouldLog) {
        console.log("Avo Inspector: last event schema dropped due to sampling rate.");
      }
      return;
    }

    if (AvoInspector.shouldLog) {
      console.log("Avo Inspector: events", events);

      events.forEach(
        function (event) {
          if (event.type === "event") {
            let schemaEvent: EventSchemaBody = event;
            console.log("Avo Inspector: sending event " + schemaEvent.eventName + " with schema " + JSON.stringify(schemaEvent.eventProperties));
          }
        }
      )
    }

    this.sending = true;
    let xmlhttp = new XMLHttpRequest();
    xmlhttp.open("POST", AvoNetworkCallsHandler.trackingEndpoint, true);
    xmlhttp.setRequestHeader("Content-Type", "application/json");
    xmlhttp.setRequestHeader("Accept", "application/json");
    xmlhttp.timeout = 10000;
    xmlhttp.onload = () => {
      this.sending = false;
      if (xmlhttp.status != 200) {
        onCompleted(`Error ${xmlhttp.status}: ${xmlhttp.statusText}`);
      } else {
        try {
          const samplingRate = JSON.parse(xmlhttp.response).samplingRate;
          if (samplingRate !== undefined) {
            this.samplingRate = samplingRate;
          }
        } catch (_) {
          // Ignore malformed response — sampling rate stays unchanged
        }

        onCompleted(null);
      }
    };
    xmlhttp.onerror = () => {
      this.sending = false;
      onCompleted("Request failed");
    };
    xmlhttp.ontimeout = () => {
      this.sending = false;
      onCompleted("Request timed out");
    }
    xmlhttp.send(JSON.stringify(events));
  }

  async bodyForEventSchemaCall(
    eventName: string,
    eventProperties: Array<{
      propertyName: string;
      propertyType: string;
      children?: any;
      failedEventIds?: string[];
      passedEventIds?: string[];
    }>,
    eventId: string | null,
    eventHash: string | null,
    eventProps?: Record<string, any>,
    metadata?: EventSpecMetadata | null
  ): Promise<EventSchemaBody> {
    const anonymousId = await AvoStreamId.initialize();
    let eventSchemaBody = this.createBaseCallBody(anonymousId) as EventSchemaBody;
    eventSchemaBody.type = "event";
    eventSchemaBody.eventName = eventName;

    // Encrypt property values when encryption is enabled
    if (
      shouldEncrypt(this.envName, this.publicEncryptionKey) &&
      eventProps
    ) {
      eventSchemaBody.eventProperties = encryptEventProperties(
        eventProperties,
        eventProps,
        this.publicEncryptionKey!
      );
    } else {
      eventSchemaBody.eventProperties = eventProperties;
    }

    if (eventId != null) {
      eventSchemaBody.avoFunction = true;
      eventSchemaBody.eventId = eventId;
      eventSchemaBody.eventHash = eventHash;
    } else {
      eventSchemaBody.avoFunction = false;
      eventSchemaBody.eventId = null;
      eventSchemaBody.eventHash = null;
    }

    // Add streamId and event spec metadata for validated events
    if (metadata) {
      eventSchemaBody.streamId = anonymousId;
      eventSchemaBody.eventSpecMetadata = {};
      if (metadata.schemaId) {
        eventSchemaBody.eventSpecMetadata.schemaId = metadata.schemaId;
      }
      if (metadata.branchId) {
        eventSchemaBody.eventSpecMetadata.branchId = metadata.branchId;
      }
      if (metadata.latestActionId) {
        eventSchemaBody.eventSpecMetadata.latestActionId = metadata.latestActionId;
      }
      if (metadata.sourceId) {
        eventSchemaBody.eventSpecMetadata.sourceId = metadata.sourceId;
      }
    }

    return eventSchemaBody;
  }

  /**
   * Sends a validated event immediately, bypassing the batcher.
   * Matches Android SDK's reportValidatedEvent behavior.
   */
  reportValidatedEvent(eventBody: EventSchemaBody): void {
    if (Math.random() > this.samplingRate) {
      if (AvoInspector.shouldLog) {
        console.log("Avo Inspector: validated event dropped due to sampling rate.");
      }
      return;
    }

    if (AvoInspector.shouldLog) {
      console.log(
        "Avo Inspector: sending validated event " +
          eventBody.eventName +
          " with schema " +
          JSON.stringify(eventBody.eventProperties)
      );
    }

    let xmlhttp = new XMLHttpRequest();
    xmlhttp.open("POST", AvoNetworkCallsHandler.trackingEndpoint, true);
    xmlhttp.setRequestHeader("Content-Type", "application/json");
    xmlhttp.setRequestHeader("Accept", "application/json");
    xmlhttp.timeout = 10000;
    xmlhttp.onload = () => {
      if (xmlhttp.status !== 200 && AvoInspector.shouldLog) {
        console.warn(
          `Avo Inspector: validated event response status ${xmlhttp.status}`
        );
      }
    };
    xmlhttp.onerror = () => {
      if (AvoInspector.shouldLog) {
        console.warn("Avo Inspector: failed to send validated event");
      }
    };
    xmlhttp.ontimeout = () => {
      if (AvoInspector.shouldLog) {
        console.warn("Avo Inspector: validated event report timed out");
      }
    };
    xmlhttp.send(JSON.stringify([eventBody]));
  }

  private createBaseCallBody(anonymousId: string): BaseBody {
    const body: BaseBody = {
      apiKey: this.apiKey,
      appName: this.appName,
      appVersion: this.appVersion,
      libVersion: this.libVersion,
      env: this.envName,
      libPlatform: "react-native",
      messageId: AvoGuid.newGuid(),
      trackingId: "",
      sessionId: "",
      anonymousId,
      createdAt: new Date().toISOString(),
      samplingRate: this.samplingRate,
    };
    if (
      this.publicEncryptionKey !== null &&
      this.publicEncryptionKey !== undefined &&
      this.publicEncryptionKey.trim().length > 0
    ) {
      body.publicEncryptionKey = this.publicEncryptionKey;
    }
    return body;
  }
}
