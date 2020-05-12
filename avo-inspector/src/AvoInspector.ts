import { AvoInspectorEnv } from './AvoInspectorEnv';
import { AvoSchemaParser } from './AvoSchemaParser';
import { AvoSessionTracker } from './AvoSessionTracker';
import AvoBatcher from './AvoBatcher';
import AvoNetworkCallsHandler from './AvoNetworkCallsHandler';

export class AvoInspector {
    
    libVersion = "0.0.1";

    environment: AvoInspectorEnv;
    sessionTracker: AvoSessionTracker;
    batcher: AvoBatcher;
    networkCallsHandler: AvoNetworkCallsHandler;
    apiKey: string;
    version: string;

    private static _batchSize = 30;
    static get batchSize() {
        return this._batchSize;
    }

    private static _batchFlushSeconds = 30;
    static get batchFlushSeconds() {
        return this._batchFlushSeconds;
    }

    constructor(apiKey: string, appName: string, env: AvoInspectorEnv, version: string) {
        this.environment = env;
        if (this.environment == null) {
            this.environment = AvoInspectorEnv.Dev;
            console.warn("[Avo Inspector] No environment provided. Defaulting to dev.");
        }
        this.apiKey = apiKey;
        if (this.apiKey == null || this.apiKey.trim().length == 0) {
            throw new Error("[Avo Inspector] No API key provided. Inspector can't operate without API key.");
        }
        this.version = version;
        if (this.version == null || this.version.trim().length == 0) {
            throw new Error("[Avo Inspector] No version provided. Many features of Inspector rely on versioning. Please provide comparable string version, i.e. integer or semantic.");
        }

        this.networkCallsHandler = new AvoNetworkCallsHandler();
        this.batcher = new AvoBatcher(apiKey, env, appName, version, this.libVersion, this.networkCallsHandler);
        this.sessionTracker = new AvoSessionTracker(this.batcher);

        let inspector = this;
        window.onload = function() {
            inspector.sessionTracker.startOrProlongSession(Date.now());
        };
    }
    
    trackSchemaFromEvent(eventName: string, eventProperties: { [propName: string] : any}): { [propName: string] : string} {
        console.log('Inspected event: ' + eventName + ": " + JSON.stringify(eventProperties));
        this.sessionTracker.startOrProlongSession(Date.now());
        return { "prop": "unknown" };
    }

    trackSchema(eventName: string, eventSchema: { [propName: string] : string}) {
        console.log('Inspected event: ' + eventName + ": " + JSON.stringify(eventSchema));
        this.sessionTracker.startOrProlongSession(Date.now());
    }

    enableLogging(enable: Boolean) {
        
    }
    
    extractSchema(eventProperties: { [propName: string] : any}): Array<any> {
        this.sessionTracker.startOrProlongSession(Date.now());
        return new AvoSchemaParser().extractSchema(eventProperties);
    }

    setBatchSize(newBatchSize: number) {
        AvoInspector._batchSize = newBatchSize;
    }

    setBatchFlushSeconds(newBatchFlushSeconds: number) {
        AvoInspector._batchFlushSeconds = newBatchFlushSeconds;
    }
}