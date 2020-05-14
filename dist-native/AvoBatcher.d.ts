import { AvoNetworkCallsHandler } from "./AvoNetworkCallsHandler";
export interface AvoBatcherType {
    handleSessionStarted(): void;
    handleTrackSchema(eventName: string, schema: Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>): void;
}
export declare class AvoBatcher implements AvoBatcherType {
    private events;
    private batchFlushAttemptTimestamp;
    private networkCallsHandler;
    constructor(networkCallsHandler: AvoNetworkCallsHandler);
    handleSessionStarted(): void;
    handleTrackSchema(eventName: string, schema: Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>): void;
    private checkIfBatchNeedsToBeSent;
    private saveEvents;
    static get cacheKey(): string;
}
