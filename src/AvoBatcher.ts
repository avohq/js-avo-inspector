import {
  SessionStartedBody,
  EventSchemaBody,
  AvoNetworkCallsHandler,
} from "./AvoNetworkCallsHandler";
import { AvoInspector } from "./AvoInspector"
import LocalStorage from "./LocalStorage";

export interface AvoBatcherType {
  handleSessionStarted(): void;

  handleTrackSchema(
    eventName: string,
    schema: Array<{
      propertyName: string;
      propertyType: string;
      children?: any;
    }>
  ): void;
}

export class AvoBatcher implements AvoBatcherType {

  private events: Array<SessionStartedBody | EventSchemaBody> = [];

  private batchFlushAttemptTimestamp: number;

  private networkCallsHandler: AvoNetworkCallsHandler;

  constructor(networkCallsHandler: AvoNetworkCallsHandler) {
    this.networkCallsHandler = networkCallsHandler;

    this.batchFlushAttemptTimestamp = Date.now();
  }

  handleSessionStarted(): void {
    this.events.push(this.networkCallsHandler.bodyForSessionStartedCall());

    this.checkIfBatchNeedsToBeSent();
 //   this.saveEvents();
 //   this.sendEvents();
  }

  handleTrackSchema(
    eventName: string,
    schema: Array<{
      propertyName: string;
      propertyType: string;
      children?: any;
    }>
  ): void {
    this.events.push(
      this.networkCallsHandler.bodyForEventSchemaCall(eventName, schema)
    );

    this.checkIfBatchNeedsToBeSent();
 //   this.saveEvents();
 //   this.sendEvents();
  }

  private checkIfBatchNeedsToBeSent() {
    const batchSize = this.events.length;
    const now = Date.now();
    const timeSinceLastFlushAttempt = now - this.batchFlushAttemptTimestamp;

    const sendBySize = (batchSize % AvoInspector.batchSize) == 0;
    const sendByTime = timeSinceLastFlushAttempt >= AvoInspector.batchFlushSeconds * 1000;

    const avoBatcher = this;
    if (sendBySize || sendByTime) {
        this.batchFlushAttemptTimestamp = now;
        const sendingEvents: Array<SessionStartedBody | EventSchemaBody> = avoBatcher.events;
        avoBatcher.events = [];
        this.networkCallsHandler.callInspectorWithBatchBody(this.events, function(error: string | null): any {
            if (error != null) {
              avoBatcher.events = avoBatcher.events.concat(sendingEvents);
            } 
            avoBatcher.saveEvents();
        });
    }
}

  private saveEvents(): void {
    LocalStorage.setItem(AvoBatcher.cacheKey, this.events);
  }

  /*
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
  */

  static get cacheKey(): string {
    return "AvoInspectorEvents";
  }
}
