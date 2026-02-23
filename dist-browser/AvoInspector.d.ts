import { AvoInspectorEnvValueType } from "./AvoInspectorEnv";
import { AvoBatcher } from "./AvoBatcher";
import { AvoStorage } from "./AvoStorage";
import { AvoDeduplicator } from "./AvoDeduplicator";
export declare class AvoInspector {
    environment: AvoInspectorEnvValueType;
    avoBatcher: AvoBatcher;
    avoDeduplicator: AvoDeduplicator;
    apiKey: string;
    version: string;
    publicEncryptionKey?: string;
    private streamId?;
    private eventSpecCache?;
    private eventSpecFetcher?;
    private currentBranchId;
    static avoStorage: AvoStorage;
    private static _batchSize;
    static get batchSize(): number;
    static set batchSize(newSize: number);
    private static _batchFlushSeconds;
    static get batchFlushSeconds(): number;
    private static _shouldLog;
    static get shouldLog(): boolean;
    static set shouldLog(enable: boolean);
    constructor(options: {
        apiKey: string;
        env: AvoInspectorEnvValueType;
        version: string;
        appName?: string;
        publicEncryptionKey?: string;
    });
    trackSchemaFromEvent(eventName: string, eventProperties: {
        [propName: string]: any;
    }): Promise<Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>>;
    private _avoFunctionTrackSchemaFromEvent;
    trackSchema(eventName: string, eventSchema: Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>): void;
    private trackSchemaInternal;
    enableLogging(enable: boolean): void;
    extractSchema(eventProperties: {
        [propName: string]: any;
    }, shouldLogIfEnabled?: boolean): Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>;
    setBatchSize(newBatchSize: number): void;
    setBatchFlushSeconds(newBatchFlushSeconds: number): void;
    /**
     * Handles branch change detection and cache storage for a fetched event spec.
     */
    private handleBranchChangeAndCache;
    /**
     * Fetches event spec and validates the event against it.
     * Returns ValidationResult if spec is available, null otherwise.
     * Only runs in dev/staging environments.
     */
    private fetchAndValidateEvent;
    /**
     * Merges validation results into the event schema.
     * Adds failedEventIds or passedEventIds to each property based on validation.
     */
    private mergeValidationResults;
    /**
     * Merges validation result into a single property, recursively handling children.
     */
    private mergePropertyValidation;
}
