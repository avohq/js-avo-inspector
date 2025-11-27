import AvoGuid from "./AvoGuid";
import { AvoInspector } from "./AvoInspector";
import { AvoAnonymousId } from "./AvoAnonymousId";
import type { EventSpecMetadata } from "./eventSpec/AvoEventSpecFetchTypes";

/**
 * Property schema with optional validation results.
 */
export interface EventProperty {
  propertyName: string;
  propertyType: string;
  encryptedPropertyValue?: string;
  children?: any;
  /** Event/variant IDs that FAILED validation (present if smaller or equal to passed) */
  failedEventIds?: string[];
  /** Event/variant IDs that PASSED validation (present if smaller than failed) */
  passedEventIds?: string[];
}

export interface BaseBody {
  apiKey: string;
  appName: string;
  appVersion: string;
  libVersion: string;
  env: string;
  libPlatform: "web";
  messageId: string;
  trackingId: string;
  createdAt: string;
  sessionId: string;
  anonymousId: string;
  samplingRate: number;
  /** Event spec metadata from EventSpecResponse (moved from EventSchemaBody) */
  eventSpecMetadata?: EventSpecMetadata;
}

export interface SessionStartedBody extends BaseBody {
  type: "sessionStarted";
}

export interface EventSchemaBody extends BaseBody {
  type: "event";

  // Identification
  /** ID of the base event from spec (null if no spec available) */
  eventId: string | null;
  /** Name seen in code */
  eventName?: string;

  // Runtime Properties with validation results
  eventProperties: EventProperty[];

  // Legacy fields
  avoFunction: boolean;
  eventHash: string | null;
}

export class AvoNetworkCallsHandler {
  private readonly apiKey: string;
  private readonly envName: string;
  private readonly appName: string;
  private readonly appVersion: string;
  private readonly libVersion: string;
  private samplingRate: number = 1.0;
  private sending: boolean = false;

  private static readonly trackingEndpoint =
    "https://api.avo.app/inspector/v1/track";

  constructor(
    apiKey: string,
    envName: string,
    appName: string,
    appVersion: string,
    libVersion: string
  ) {
    this.apiKey = apiKey;
    this.envName = envName;
    this.appName = appName;
    this.appVersion = appVersion;
    this.libVersion = libVersion;
  }

  callInspectorWithBatchBody(
    inEvents: Array<SessionStartedBody | EventSchemaBody>,
    onCompleted: (error: Error | null) => any
  ): void {
    if (this.sending) {
      onCompleted(
        new Error(
          "Batch sending cancelled because another batch sending is in progress. Your events will be sent with next batch."
        )
      );
      return;
    }

    const events = inEvents.filter((x) => x != null);
    this.fixAnonymousIds(events);

    if (events.length === 0) {
      return;
    }

    if (this.shouldDropBySampling()) {
      if (AvoInspector.shouldLog) {
        console.log(
          "Avo Inspector: last event schema dropped due to sampling rate."
        );
      }
      return;
    }

    if (AvoInspector.shouldLog) {
      console.log("Avo Inspector: events", events);
      events.forEach((event) => {
        if (event.type === "sessionStarted") {
          console.log("Avo Inspector: sending session started event.");
        } else if (event.type === "event") {
          console.log(
            "Avo Inspector: sending event " +
              event.eventName +
              " with schema " +
              JSON.stringify(event.eventProperties)
          );
        }
      });
    }

    this.sending = true;
    this.callInspectorApi(events, (error) => {
      this.sending = false;
      onCompleted(error);
    });
  }

  private fixAnonymousIds(
    events: Array<SessionStartedBody | EventSchemaBody>
  ): void {
    let knownAnonymousId: string | null = null;
    events.forEach(function (event) {
      if (
        event.anonymousId !== null &&
        event.anonymousId !== undefined &&
        event.anonymousId !== "unknown"
      ) {
        knownAnonymousId = event.anonymousId;
      }
    });
    events.forEach(function (event) {
      if (event.anonymousId === "unknown") {
        if (knownAnonymousId != null) {
          event.anonymousId = knownAnonymousId;
        } else {
          event.anonymousId = AvoAnonymousId.anonymousId;
        }
      }
    });
  }

  bodyForSessionStartedCall(): SessionStartedBody {
    const sessionBody = this.createBaseCallBody() as SessionStartedBody;
    sessionBody.type = "sessionStarted";
    return sessionBody;
  }

  bodyForEventSchemaCall(
    eventName: string,
    eventProperties: EventProperty[],
    eventId: string | null,
    eventHash: string | null,
    eventSpecMetadata?: EventSpecMetadata
  ): EventSchemaBody {
    const eventSchemaBody = this.createBaseCallBody() as EventSchemaBody;
    eventSchemaBody.type = "event";
    eventSchemaBody.eventName = eventName;
    eventSchemaBody.eventProperties = eventProperties;

    if (eventId != null) {
      eventSchemaBody.avoFunction = true;
      eventSchemaBody.eventId = eventId;
      eventSchemaBody.eventHash = eventHash;
    } else {
      eventSchemaBody.avoFunction = false;
      eventSchemaBody.eventId = null;
      eventSchemaBody.eventHash = null;
    }

    // Set metadata on base body if provided
    if (eventSpecMetadata) {
      eventSchemaBody.eventSpecMetadata = eventSpecMetadata;
    }

    return eventSchemaBody;
  }

  private createBaseCallBody(): BaseBody {
    return {
      apiKey: this.apiKey,
      appName: this.appName,
      appVersion: this.appVersion,
      libVersion: this.libVersion,
      env: this.envName,
      libPlatform: "web",
      messageId: AvoGuid.newGuid(),
      trackingId: "",
      createdAt: new Date().toISOString(),
      sessionId: "",
      anonymousId: AvoAnonymousId.anonymousId,
      samplingRate: this.samplingRate
    };
  }

  /**
   * Calls Inspector API immediately with a single event (bypasses batching).
   * Used when event spec validation is available.
   * Note: Does not drop due to sampling - validated events are always sent.
   */
  callInspectorImmediately(
    eventBody: EventSchemaBody,
    onCompleted: (error: Error | null) => any
  ): void {
    // Fix anonymous ID if needed
    if (eventBody.anonymousId === "unknown") {
      eventBody.anonymousId = AvoAnonymousId.anonymousId;
    }

    if (AvoInspector.shouldLog) {
      console.log(
        "Avo Inspector: calling inspector immediately (with validation)",
        eventBody.eventName
      );
      console.log("Avo Inspector: event body", eventBody);
    }

    this.callInspectorApi([eventBody], onCompleted);
  }

  /**
   * Check if event should be dropped based on sampling rate.
   */
  private shouldDropBySampling(): boolean {
    return Math.random() > this.samplingRate;
  }

  /**
   * Core Inspector API call logic shared by batch and immediate calls.
   */
  private callInspectorApi(
    events: Array<SessionStartedBody | EventSchemaBody>,
    onCompleted: (error: Error | null) => any
  ): void {
    const xmlhttp = new XMLHttpRequest();
    xmlhttp.open("POST", AvoNetworkCallsHandler.trackingEndpoint, true);
    xmlhttp.setRequestHeader("Content-Type", "text/plain");
    xmlhttp.timeout = AvoInspector.networkTimeout;
    xmlhttp.send(JSON.stringify(events));

    xmlhttp.onload = () => {
      if (xmlhttp.status !== 200) {
        onCompleted(new Error(`Error ${xmlhttp.status}: ${xmlhttp.statusText}`));
      } else {
        const response = JSON.parse(xmlhttp.response);
        if (response.samplingRate !== undefined) {
          this.samplingRate = response.samplingRate;
        }
        onCompleted(null);
      }
    };

    xmlhttp.onerror = () => {
      onCompleted(new Error("Request failed"));
    };

    xmlhttp.ontimeout = () => {
      onCompleted(new Error("Request timed out"));
    };
  }
}
