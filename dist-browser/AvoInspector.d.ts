import { type AvoInspectorEnvValueType } from "./AvoInspectorEnv";
import { AvoBatcher } from "./AvoBatcher";
import { AvoStorage } from "./AvoStorage";
import { AvoDeduplicator } from "./AvoDeduplicator";
export declare class AvoInspector {
    environment: AvoInspectorEnvValueType;
    avoBatcher: AvoBatcher;
    avoDeduplicator: AvoDeduplicator;
    apiKey: string;
    version: string;
    private avoNetworkCallsHandler;
    private publicEncryptionKey?;
    private streamId?;
    private eventSpecCache?;
    private eventSpecFetcher?;
    static avoStorage: AvoStorage;
    private static _batchSize;
    static get batchSize(): number;
    static set batchSize(newSize: number);
    private static _batchFlushSeconds;
    static get batchFlushSeconds(): number;
    private static _shouldLog;
    static get shouldLog(): boolean;
    static set shouldLog(enable: boolean);
    private static _networkTimeout;
    static get networkTimeout(): number;
    static set networkTimeout(timeout: number);
    constructor(options: {
        apiKey: string;
        env: AvoInspectorEnvValueType;
        version: string;
        appName?: string;
        suffix?: string;
        publicEncryptionKey?: string;
    });
    trackSchemaFromEvent(eventName: string, eventProperties: Record<string, any>): Promise<Array<{
        propertyName: string;
        propertyType: string;
        encryptedPropertyValue?: string;
        children?: any;
    }>>;
    private _avoFunctionTrackSchemaFromEvent;
    trackSchema(eventName: string, eventSchema: Array<{
        propertyName: string;
        propertyType: string;
        encryptedPropertyValue?: string;
        children?: any;
    }>): Promise<void>;
    private trackSchemaInternal;
    enableLogging(enable: boolean): void;
    extractSchema(eventProperties: Record<string, any>, shouldLogIfEnabled?: boolean): Array<{
        propertyName: string;
        propertyType: string;
        encryptedPropertyValue?: string;
        children?: any;
    }>;
    setBatchSize(newBatchSize: number): void;
    setBatchFlushSeconds(newBatchFlushSeconds: number): void;
    /**
     * Fetches the event spec if spec fetching is enabled.
     * Used by trackSchema when we don't have raw properties to validate.
     *
     * Note: EventSpec fetching only happens in dev/staging environments.
     */
    private fetchEventSpecIfNeeded;
    /**
     * Fetches event spec and validates the event against it.
     * Returns ValidationResult if spec is available, null otherwise.
     *
     * Note: EventSpec fetching and validation only happens in dev/staging environments.
     */
    private fetchAndValidateEvent;
    /**
     * Sends an event immediately with validation data (bypasses batching).
     * Logs validation errors if shouldLog is true.
     */
    private sendEventWithValidation;
}
