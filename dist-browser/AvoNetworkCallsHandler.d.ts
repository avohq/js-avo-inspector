import type { EventSpecMetadata } from "./eventSpec/AvoEventSpecFetchTypes";
import type { ValidationIssue } from "./eventSpec/EventValidator";
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
    anonymousId: string;
    samplingRate: number;
}
export interface SessionStartedBody extends BaseBody {
    type: "sessionStarted";
}
export interface EventSchemaBody extends BaseBody {
    type: "event";
    /** ID of the matched base event */
    eventId: string | null;
    /** ID of the matched variant (if any) */
    variantId?: string | null;
    /** Name seen in code */
    eventName?: string;
    /** Event spec metadata from EventSpecResponse */
    eventSpecMetadata?: EventSpecMetadata;
    /** Array of validation issues found during validation */
    validationErrors?: ValidationIssue[];
    eventProperties: Array<{
        propertyName: string;
        propertyType: string;
        encryptedPropertyValue?: string;
        children?: any;
    }>;
    avoFunction: boolean;
    eventHash: string | null;
}
export declare class AvoNetworkCallsHandler {
    private readonly apiKey;
    private readonly envName;
    private readonly appName;
    private readonly appVersion;
    private readonly libVersion;
    private samplingRate;
    private sending;
    private static readonly trackingEndpoint;
    constructor(apiKey: string, envName: string, appName: string, appVersion: string, libVersion: string);
    callInspectorWithBatchBody(inEvents: Array<SessionStartedBody | EventSchemaBody>, onCompleted: (error: Error | null) => any): void;
    private fixAnonymousIds;
    bodyForSessionStartedCall(): SessionStartedBody;
    bodyForEventSchemaCall(eventName: string, eventProperties: Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>, eventId: string | null, eventHash: string | null, variantId?: string | null, eventSpecMetadata?: EventSpecMetadata, validationErrors?: ValidationIssue[]): EventSchemaBody;
    private createBaseCallBody;
    /**
     * Calls Inspector API immediately with a single event (bypasses batching).
     * Used when event spec validation is available.
     * Note: Does not drop due to sampling - validated events are always sent.
     */
    callInspectorImmediately(eventBody: EventSchemaBody, onCompleted: (error: Error | null) => any): void;
    /**
     * Check if event should be dropped based on sampling rate.
     */
    private shouldDropBySampling;
    /**
     * Core Inspector API call logic shared by batch and immediate calls.
     */
    private callInspectorApi;
}
