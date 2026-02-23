import { type AvoNetworkCallsHandler } from "./AvoNetworkCallsHandler";
import type { EventSpecMetadata } from "./eventSpec/AvoEventSpecFetchTypes";
import type { ValidationIssue } from "./eventSpec/EventValidator";
export interface AvoBatcherType {
    handleSessionStarted: () => void;
    handleTrackSchema: (eventName: string, schema: Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>, eventId: string | null, eventHash: string | null, variantId?: string | null, eventSpecMetadata?: EventSpecMetadata, validationErrors?: ValidationIssue[]) => void;
}
export declare class AvoBatcher implements AvoBatcherType {
    private events;
    private batchFlushAttemptTimestamp;
    private readonly networkCallsHandler;
    constructor(networkCallsHandler: AvoNetworkCallsHandler);
    handleSessionStarted(): void;
    handleTrackSchema(eventName: string, schema: Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>, eventId: string | null, eventHash: string | null, variantId?: string | null, eventSpecMetadata?: EventSpecMetadata, validationErrors?: ValidationIssue[]): void;
    private checkIfBatchNeedsToBeSent;
    private saveEvents;
    static get cacheKey(): string;
}
