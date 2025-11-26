import {
  type SessionStartedBody,
  type EventSchemaBody,
  type AvoNetworkCallsHandler
} from "./AvoNetworkCallsHandler";
import { AvoInspector } from "./AvoInspector";
import type { EventSpecMetadata } from "./eventSpec/AvoEventSpecFetchTypes";
import type { ValidationIssue } from "./eventSpec/EventValidator";

export interface AvoBatcherType {
  handleSessionStarted: () => void

  handleTrackSchema: (
    eventName: string,
    schema: Array<{
      propertyName: string
      propertyType: string
      children?: any
    }>,
    eventId: string | null,
    eventHash: string | null,
    variantId?: string | null,
    eventSpecMetadata?: EventSpecMetadata,
    validationErrors?: ValidationIssue[]
  ) => void
}

export class AvoBatcher implements AvoBatcherType {
  private events: Array<SessionStartedBody | EventSchemaBody> = [];

  private batchFlushAttemptTimestamp: number;

  private readonly networkCallsHandler: AvoNetworkCallsHandler;

  constructor (networkCallsHandler: AvoNetworkCallsHandler) {
    this.networkCallsHandler = networkCallsHandler;

    this.batchFlushAttemptTimestamp = Date.now();

    AvoInspector.avoStorage
      .getItemAsync<Array<SessionStartedBody | EventSchemaBody | null> | null>(
      AvoBatcher.cacheKey
    )
      .then((savedEvents) => {
        if (savedEvents !== null) {
          const nonNullSavedEvents = savedEvents.filter(
            (event) => event !== null
          );
          this.events = this.events.concat(
            nonNullSavedEvents as Array<SessionStartedBody | EventSchemaBody>
          );
          this.checkIfBatchNeedsToBeSent();
        }
      }).catch((error) => {
        console.error("Avo Inspector: error getting events from cache", error);
      });
  }

  handleSessionStarted (): void {
    this.events.push(this.networkCallsHandler.bodyForSessionStartedCall());
    this.saveEvents();

    this.checkIfBatchNeedsToBeSent();
  }

  handleTrackSchema (
    eventName: string,
    schema: Array<{
      propertyName: string
      propertyType: string
      children?: any
    }>,
    eventId: string | null,
    eventHash: string | null,
    variantId?: string | null,
    eventSpecMetadata?: EventSpecMetadata,
    validationErrors?: ValidationIssue[]
  ): void {
    this.events.push(
      this.networkCallsHandler.bodyForEventSchemaCall(
        eventName,
        schema,
        eventId,
        eventHash,
        variantId,
        eventSpecMetadata,
        validationErrors
      )
    );
    this.saveEvents();

    if (AvoInspector.shouldLog) {
      console.log(
        "Avo Inspector: saved event " +
          eventName +
          " with schema " +
          JSON.stringify(schema)
      );
    }

    this.checkIfBatchNeedsToBeSent();
  }

  private checkIfBatchNeedsToBeSent () {
    const batchSize = this.events.length;
    const now = Date.now();
    const timeSinceLastFlushAttempt = now - this.batchFlushAttemptTimestamp;

    const sendBySize = batchSize % AvoInspector.batchSize == 0;
    const sendByTime =
      timeSinceLastFlushAttempt >= AvoInspector.batchFlushSeconds * 1000;

    const avoBatcher = this;
    if (sendBySize || sendByTime) {
      this.batchFlushAttemptTimestamp = now;
      const sendingEvents: Array<SessionStartedBody | EventSchemaBody> =
        avoBatcher.events;
      avoBatcher.events = [];
      this.networkCallsHandler.callInspectorWithBatchBody(
        sendingEvents,
        function (error: Error | null): any {
          if (error != null) {
            avoBatcher.events = avoBatcher.events.concat(sendingEvents);

            if (AvoInspector.shouldLog) {
              console.log(
                "Avo Inspector: batch sending failed: " +
                  error.message +
                  ". We will attempt to send your schemas with next batch"
              );
            }
          } else {
            if (AvoInspector.shouldLog) {
              console.log("Avo Inspector: batch sent successfully.");
            }
          }
          avoBatcher.saveEvents();
        }
      );
    }
  }

  private saveEvents (): void {
    if (this.events.length > 1000) {
      const extraElements = this.events.length - 1000;
      this.events.splice(0, extraElements);
    }

    AvoInspector.avoStorage.setItem(AvoBatcher.cacheKey, this.events);
  }

  static get cacheKey (): string {
    return "AvoInspectorEvents";
  }
}
