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
        propertyType: string;
        children?: any;
    }>;
    avoFunction: boolean;
    eventId: string | null;
    eventHash: string | null;
}
export declare class AvoNetworkCallsHandler {
    private apiKey;
    private envName;
    private appName;
    private appVersion;
    private libVersion;
    private samplingRate;
    private sending;
    private static trackingEndpoint;
    constructor(apiKey: string, envName: string, appName: string, appVersion: string, libVersion: string);
    callInspectorWithBatchBody(inEvents: Array<SessionStartedBody | EventSchemaBody>, onCompleted: (error: string | null) => any): void;
    private fixSessionAndTrackingIds;
    bodyForSessionStartedCall(): SessionStartedBody;
    bodyForEventSchemaCall(eventName: string, eventProperties: Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>, eventId: string | null, eventHash: string | null): EventSchemaBody;
    private createBaseCallBody;
}
