import {
  SessionStartedBody,
  EventSchemaBody,
  AvoNetworkCallsHandler,
} from "./AvoNetworkCallsHandler";
import LocalStorage from "./LocalStorage";

export interface AvoBatcherType {
  startSession(): void;

  trackEventSchema(
    eventName: string,
    schema: Array<{
      propertyName: string;
      propertyValue: string;
      children?: any;
    }>
  ): void;
}

export class AvoBatcher {
  private static avoInspectorBatchKey = "avo_inspector_batch_key";

  private static trackingEndpoint = "https://api.avo.app/inspector/v1/track";

  private events: Array<SessionStartedBody | EventSchemaBody> = [];

  private networkCallsHandler: AvoNetworkCallsHandler;
  private uploadScheduled: boolean = false;
  private batchPeriod: number = 1000;
  private sending: boolean = false;

  constructor(networkCallsHandler: AvoNetworkCallsHandler) {
    this.networkCallsHandler = networkCallsHandler;
  }

  startSession(): void {
    this.events.push(this.networkCallsHandler.bodyForSessionStartedCall());
    this.saveEvents();
    this.sendEvents();
  }

  trackEventSchema(
    eventName: string,
    schema: Array<{
      propertyName: string;
      propertyValue: string;
      children?: any;
    }>
  ): void {
    this.events.push(
      this.networkCallsHandler.bodyForEventSchemaCall(eventName, schema)
    );
    this.saveEvents();
    this.sendEvents();
  }

  private saveEvents(): void {
    LocalStorage.setItem(AvoBatcher.cacheKey, this.events);
  }

  private sendEvents(): void {
    if (this.uploadScheduled) {
      return;
    }

    this.uploadScheduled = true;
    setTimeout(() => {
      this.uploadScheduled = false;
      this.postEvents();
    }, this.batchPeriod);
  }

  private postEvents(): void {
    if (this.sending) {
      return;
    }
    if (this.events.length === 0) {
      return;
    }
    this.sending = true;
    let xmlhttp = new XMLHttpRequest();
    xmlhttp.open("POST", AvoBatcher.trackingEndpoint, true);
    xmlhttp.setRequestHeader("Content-Type", "text/plain");
    xmlhttp.send(JSON.stringify(this.events));
    this.events = [];
    this.saveEvents();
    this.sending = false;
  }

  static get cacheKey(): string {
    return "AvoInspectorEvents";
  }
}
