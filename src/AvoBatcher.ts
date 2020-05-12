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

    let savedEvents: Array<SessionStartedBody | EventSchemaBody> | null = LocalStorage.getItem(AvoBatcher.cacheKey);
    if (savedEvents !== null) {
      this.events = savedEvents;
      this.checkIfBatchNeedsToBeSent();
    }
  }

  handleSessionStarted(): void {
    this.events.push(this.networkCallsHandler.bodyForSessionStartedCall());
    this.saveEvents();

    this.checkIfBatchNeedsToBeSent();
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
    this.saveEvents();

    this.checkIfBatchNeedsToBeSent();
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
        this.networkCallsHandler.callInspectorWithBatchBody(sendingEvents, function(error: string | null): any {
            if (error != null) {
              avoBatcher.events = avoBatcher.events.concat(sendingEvents);
            } 
            avoBatcher.saveEvents();
        });
    };
}

  private saveEvents(): void {
    if (this.events.length > 1000) {
      const extraElements = this.events.length - 1000;
      this.events.splice(0, extraElements);
    }

    LocalStorage.setItem(AvoBatcher.cacheKey, this.events);
  }

  static get cacheKey(): string {
    return "AvoInspectorEvents";
  }
}
