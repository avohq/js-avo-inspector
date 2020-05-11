import AvoGuid from "./AvoGuid";
import { AvoSessionTracker } from "./AvoSessionTracker";

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
  samplingRate: number;
}

export interface SessionStartedBody extends BaseBody {
  type: "sessionStarted";
}

export interface EventSchemaBody extends BaseBody {
  type: "event";
  eventName: string;
  eventProperties: Array<{
    propertyName: string;
    propertyValue: string;
    children?: any;
  }>;
}

export class AvoNetworkCallsHandler {
  private apiKey: string;
  private envName: string;
  private appName: string;
  private appVersion: string;
  private libVersion: string;
  private installationId: string;
  private samplingRate: number = 1.0;

  constructor(
    apiKey: string,
    envName: string,
    appName: string,
    appVersion: string,
    libVersion: string,
    installationId: string
  ) {
    this.apiKey = apiKey;
    this.envName = envName;
    this.appName = appName;
    this.appVersion = appVersion;
    this.libVersion = libVersion;
    this.installationId = installationId;
  }

  bodyForSessionStartedCall(): SessionStartedBody {
    let sessionBody = this.createBaseCallBody() as SessionStartedBody;
    sessionBody.type = "sessionStarted";
    return sessionBody;
  }

  bodyForEventSchemaCall(
    eventName: string,
    eventProperties: Array<{
      propertyName: string;
      propertyValue: string;
      children?: any;
    }>
  ): EventSchemaBody {
    let eventSchemaBody = this.createBaseCallBody() as EventSchemaBody;
    eventSchemaBody.type = "event";
    (eventSchemaBody.eventName = eventName),
      (eventSchemaBody.eventProperties = eventProperties);
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
      trackingId: this.installationId,
      createdAt: new Date().toISOString(),
      sessionId: AvoSessionTracker.sessionId,
      samplingRate: this.samplingRate,
    };
  }
}
