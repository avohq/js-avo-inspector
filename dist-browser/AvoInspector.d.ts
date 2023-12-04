import { AvoInspectorEnvValueType } from "./AvoInspectorEnv";
import { AvoSessionTracker } from "./AvoSessionTracker";
import { AvoBatcher } from "./AvoBatcher";
import { AvoStorage } from "./AvoStorage";
import { AvoDeduplicator } from "./AvoDeduplicator";
export declare class AvoInspector {
    environment: AvoInspectorEnvValueType;
    avoBatcher: AvoBatcher;
    avoDeduplicator: AvoDeduplicator;
    sessionTracker: AvoSessionTracker;
    apiKey: string;
    version: string;
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
        suffix?: string;
    });
    trackSchemaFromEvent(eventName: string, eventProperties: {
        [propName: string]: any;
    }): Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>;
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
}
