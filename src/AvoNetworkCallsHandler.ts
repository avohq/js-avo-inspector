import AvoGuid from "./AvoGuid";
import { AvoSessionTracker } from "./AvoSessionTracker";
import { AvoInspector } from "./AvoInspector";
import { AvoInstallationId } from "./AvoInstallationId";

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
  samplingRate: number
}

export interface SessionStartedBody extends BaseBody {
  type: "sessionStarted"
}

export interface EventSchemaBody extends BaseBody {
  type: "event"
  eventName: string
  eventProperties: Array<{
    propertyName: string
    propertyType: string
    children?: any
  }>
  avoFunction: boolean
  eventId: string | null
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

  callInspectorWithBatchBody (inEvents: Array<SessionStartedBody | EventSchemaBody>, onCompleted: (error: string | null) => any): void {
    if (this.sending) {
      onCompleted("Batch sending cancelled because another batch sending is in progress. Your events will be sent with next batch.");
      return;
    }

    const events = inEvents.filter(x => x != null);

    this.fixSessionAndTrackingIds(events);

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
    xmlhttp.send(JSON.stringify(events));
    xmlhttp.onload = () => {
      if (xmlhttp.status !== 200) {
        onCompleted(`Error ${xmlhttp.status}: ${xmlhttp.statusText}`);
      } else {
        const samplingRate = JSON.parse(xmlhttp.response).samplingRate;
        if (samplingRate !== undefined) {
          this.samplingRate = samplingRate;
        }

        onCompleted(null);
      }
    };
    xmlhttp.onerror = () => {
      onCompleted("Request failed");
    };
    xmlhttp.ontimeout = () => {
      onCompleted("Request timed out");
    };
    this.sending = false;
  }

  private fixSessionAndTrackingIds (events: Array<SessionStartedBody | EventSchemaBody>): void {
    let knownSessionId: string | null = null;
    let knownTrackingId: string | null = null;
    events.forEach(
      function (event) {
        if (event.sessionId !== null && event.sessionId !== undefined && event.sessionId !== "unknown") {
          knownSessionId = event.sessionId;
        }

        if (event.trackingId !== null && event.trackingId !== undefined && event.trackingId !== "unknown") {
          knownTrackingId = event.trackingId;
        }
      }
    );
    events.forEach(
      function (event) {
        if (event.sessionId === "unknown") {
          if (knownSessionId != null) {
            event.sessionId = knownSessionId;
          } else {
            event.sessionId = AvoSessionTracker.sessionId;
          }
        }
        if (event.trackingId === "unknown") {
          if (knownTrackingId != null) {
            event.trackingId = knownTrackingId;
          } else {
            event.trackingId = AvoInstallationId.getInstallationId();
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
    eventHash: string | null
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
      trackingId: AvoInstallationId.getInstallationId(),
      createdAt: new Date().toISOString(),
      sessionId: AvoSessionTracker.sessionId,
      samplingRate: this.samplingRate
    };
  }
}
