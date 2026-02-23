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
    callInspectorWithBatchBody(inEvents: Array<EventSchemaBody>, onCompleted: (error: string | null) => any): void;
    bodyForEventSchemaCall(eventName: string, eventProperties: Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>, eventId: string | null, eventHash: string | null): Promise<EventSchemaBody>;
    private createBaseCallBody;
}
