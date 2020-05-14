import { AvoInspectorEnvValueType } from "./AvoInspectorEnv";
import { AvoSessionTracker } from "./AvoSessionTracker";
import { AvoBatcher } from "./AvoBatcher";
import { AvoStorage } from "./AvoStorage";
export declare class AvoInspector {
    environment: AvoInspectorEnvValueType;
    avoBatcher: AvoBatcher;
    sessionTracker: AvoSessionTracker;
    apiKey: string;
    version: string;
    static avoStorage: AvoStorage;
    private static _batchSize;
    static get batchSize(): number;
    private static _batchFlushSeconds;
    static get batchFlushSeconds(): number;
    private static _shouldLog;
    static get shouldLog(): boolean;
    constructor(options: {
        apiKey: string;
        env: AvoInspectorEnvValueType;
        version: string;
        appName?: string;
    });
    trackSchemaFromEvent(eventName: string, eventProperties: {
        [propName: string]: any;
    }): void;
    trackSchema(eventName: string, eventSchema: Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>): void;
    enableLogging(enable: boolean): void;
    extractSchema(eventProperties: {
        [propName: string]: any;
    }): Array<{
        propertyName: string;
        propertyType: string;
        children?: any;
    }>;
    setBatchSize(newBatchSize: number): void;
    setBatchFlushSeconds(newBatchFlushSeconds: number): void;
}
