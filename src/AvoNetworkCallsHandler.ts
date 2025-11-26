import AvoGuid from "./AvoGuid";
import { AvoInspector } from "./AvoInspector";
import { AvoAnonymousId } from "./AvoAnonymousId";
import type { EventSpecMetadata } from "./eventSpec/AvoEventSpecFetchTypes";

export interface BaseBody {
  apiKey: string
  appName: string
  appVersion: string
  libVersion: string
  env: string
  libPlatform: "web"
  messageId: string
  trackingId: string
  createdAt: string
  sessionId: string
  anonymousId: string
  samplingRate: number
}

export interface SessionStartedBody extends BaseBody {
  type: "sessionStarted"
}

/**
 * Validation issue codes for client-side validation.
 */
export type ValidationIssueCode =
  | "RequiredMissing"
  | "ValueBelowMin"
  | "ValueAboveMax"
  | "RegexMismatch"
  | "NotInAllowedValues"
  | "UnexpectedProperty"
  | "UnexpectedEvent"
  | "TypeMismatch";

/**
 * Represents a validation issue found during event validation.
 */
export interface ValidationIssue {
  /** The type of validation issue */
  code: ValidationIssueCode;
  /** Property ID (preferred over name) */
  propertyId?: string;
  /** Property name (fallback when ID is not available) */
  propertyName?: string;
  /** Expected value for the validation rule */
  expected?: string | number | boolean;
  /** Received value that caused the validation failure */
  received?: string | number | boolean;
}

export interface EventSchemaBody extends BaseBody {
  type: "event"

  // Identification
  /** ID of the matched base event */
  eventId: string | null
  /** ID of the matched variant (if any) */
  variantId?: string | null
  /** Name seen in code */
  eventName?: string

  // Context
  /** Event spec metadata from EventSpecResponse */
  eventSpecMetadata?: EventSpecMetadata

  // Validation Results
  /** Array of validation issues found during validation */
  validationErrors?: ValidationIssue[]

  // Existing Runtime Properties
  eventProperties: Array<{
    propertyName: string
    propertyType: string
    encryptedPropertyValue?: string
    children?: any
  }>

  // Legacy fields
  avoFunction: boolean
  eventHash: string | null
}

export class AvoNetworkCallsHandler {
  private readonly apiKey: string;
  private readonly envName: string;
  private readonly appName: string;
  private readonly appVersion: string;
  private readonly libVersion: string;
  private samplingRate: number = 1.0;
  private sending: boolean = false;

  private static readonly trackingEndpoint = "https://api.avo.app/inspector/v1/track";

  constructor (
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

  callInspectorWithBatchBody (inEvents: Array<SessionStartedBody | EventSchemaBody>, onCompleted: (error: Error | null) => any): void {
    if (this.sending) {
      onCompleted(new Error("Batch sending cancelled because another batch sending is in progress. Your events will be sent with next batch."));
      return;
    }

    const events = inEvents.filter(x => x != null);

    this.fixAnonymousIds(events);

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
          if (event.type === "sessionStarted") {
            console.log("Avo Inspector: sending session started event.");
          } else if (event.type === "event") {
            const schemaEvent: EventSchemaBody = event;
            console.log("Avo Inspector: sending event " + schemaEvent.eventName + " with schema " + JSON.stringify(schemaEvent.eventProperties));
          }
        }
      );
    }

    this.sending = true;
    const xmlhttp = new XMLHttpRequest();
    xmlhttp.open("POST", AvoNetworkCallsHandler.trackingEndpoint, true);
    xmlhttp.setRequestHeader("Content-Type", "text/plain");
    xmlhttp.timeout = AvoInspector.networkTimeout;
    xmlhttp.send(JSON.stringify(events));
    xmlhttp.onload = () => {
      if (xmlhttp.status !== 200) {
        onCompleted(new Error(`Error ${xmlhttp.status}: ${xmlhttp.statusText}`));
      } else {
        const samplingRate = JSON.parse(xmlhttp.response).samplingRate;
        if (samplingRate !== undefined) {
          this.samplingRate = samplingRate;
        }

        onCompleted(null);
      }
      this.sending = false;
    };
    xmlhttp.onerror = () => {
      onCompleted(new Error("Request failed"));
      this.sending = false;
    };
    xmlhttp.ontimeout = () => {
      onCompleted(new Error("Request timed out"));
      this.sending = false;
    };
  }

  private fixAnonymousIds (events: Array<SessionStartedBody | EventSchemaBody>): void {
    let knownAnonymousId: string | null = null;
    events.forEach(
      function (event) {
        if (event.anonymousId !== null && event.anonymousId !== undefined && event.anonymousId !== "unknown") {
          knownAnonymousId = event.anonymousId;
        }
      }
    );
    events.forEach(
      function (event) {
        if (event.anonymousId === "unknown") {
          if (knownAnonymousId != null) {
            event.anonymousId = knownAnonymousId;
          } else {
            event.anonymousId = AvoAnonymousId.anonymousId;
          }
        }
      }
    );
  }

  bodyForSessionStartedCall (): SessionStartedBody {
    const sessionBody = this.createBaseCallBody() as SessionStartedBody;
    sessionBody.type = "sessionStarted";
    return sessionBody;
  }

  bodyForEventSchemaCall (
    eventName: string,
    eventProperties: Array<{
      propertyName: string
      propertyType: string
      children?: any
    }>,
    eventId: string | null,
    eventHash: string | null,
    variantId?: string | null,
    eventSpecMetadata?: EventSpecMetadata,
    validationErrors?: ValidationIssue[]
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

    // Set new fields if provided
    if (variantId !== undefined) {
      eventSchemaBody.variantId = variantId;
    }

    if (eventSpecMetadata) {
      eventSchemaBody.eventSpecMetadata = eventSpecMetadata;
    }

    if (validationErrors && validationErrors.length > 0) {
      eventSchemaBody.validationErrors = validationErrors;
    }

    return eventSchemaBody;
  }

  private createBaseCallBody (): BaseBody {
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
}
