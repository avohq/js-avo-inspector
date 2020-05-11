import { AvoInspectorEnv } from './AvoInspectorEnv';
import { AvoSchemaParser } from './AvoSchemaParser';
import { AvoSessionTracker } from './AvoSessionTracker';

export class AvoInspector {
    
    environment: AvoInspectorEnv;
    sessionTracker: AvoSessionTracker;
    apiKey: string;
    version: string;

    constructor(apiKey: string, env: AvoInspectorEnv, version: string) {
        this.environment = env;
        if (this.environment == null) {
            this.environment = AvoInspectorEnv.Dev;
            console.error("[Avo Inspector] No environment provided. Defaulting to dev.");
        }
        this.apiKey = apiKey;
        if (this.apiKey == null || this.apiKey.trim().length == 0) {
            throw new Error("[Avo Inspector] No API key provided. Inspector can't operate without API key.");
        }
        this.version = version;
        if (this.version == null || this.version.trim().length == 0) {
            throw new Error("[Avo Inspector] No version provided. Many features of Inspector rely on versioning. Please provide comparable string version, i.e. integer or semantic.");
        }

        this.sessionTracker = new AvoSessionTracker({ startSession: () => {} });

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
    
    extractSchema(eventProperties: { [propName: string] : any}): string {
        this.sessionTracker.startOrProlongSession(Date.now());
        return new AvoSchemaParser().extractSchema(eventProperties)
    }

    setBatchSize(newBatchSize: Number) {

    }

    setBatchFlushSeconds(newBatchFlushSeconds: Number) {

    }
}