import AvoGuid from "./AvoGuid";
import { AvoInspector } from "./AvoInspector";
import { AvoStreamId } from "./AvoStreamId";

export interface BaseBody {
  apiKey: string;
  appName: string;
  appVersion: string;
  libVersion: string;
  env: string;
  libPlatform: "react-native";
  messageId: string;
  anonymousId: string;
  createdAt: string;
  samplingRate: number;
}

export interface EventSchemaBody extends BaseBody {
  type: "event";
  eventName: string;
  eventProperties: Array<{
    propertyName: string;
    propertyType: string;
    children?: any;
  }>;
  avoFunction: boolean;
  eventId: string | null;
  eventHash: string | null;
}

export class AvoNetworkCallsHandler {
  private apiKey: string;
  private envName: string;
  private appName: string;
  private appVersion: string;
  private libVersion: string;
  private samplingRate: number = 1.0;
  private sending: boolean = false;

  private static trackingEndpoint = "https://api.avo.app/inspector/v1/track";

  constructor(
    apiKey: string,
    envName: string,
    appName: string,
    appVersion: string,
    libVersion: string,
  ) {
    this.apiKey = apiKey;
    this.envName = envName;
    this.appName = appName;
    this.appVersion = appVersion;
    this.libVersion = libVersion;
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
    xmlhttp.setRequestHeader("Content-Type", "text/plain");
    xmlhttp.send(JSON.stringify(events));
    xmlhttp.onload = () => {
      if (xmlhttp.status != 200) {
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
    }
    this.sending = false;
  }

  async bodyForEventSchemaCall(
    eventName: string,
    eventProperties: Array<{
      propertyName: string;
      propertyType: string;
      children?: any;
    }>,
    eventId: string | null,
    eventHash: string | null
  ): Promise<EventSchemaBody> {
    const anonymousId = await AvoStreamId.initialize();
    let eventSchemaBody = this.createBaseCallBody(anonymousId) as EventSchemaBody;
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

  private createBaseCallBody(anonymousId: string): BaseBody {
    return {
      apiKey: this.apiKey,
      appName: this.appName,
      appVersion: this.appVersion,
      libVersion: this.libVersion,
      env: this.envName,
      libPlatform: "react-native",
      messageId: AvoGuid.newGuid(),
      anonymousId,
      createdAt: new Date().toISOString(),
      samplingRate: this.samplingRate,
    };
  }
}
