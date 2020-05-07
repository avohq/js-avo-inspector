import { AvoInspectorEnv } from './AvoInspectorEnv';
import { AvoSchemaParser } from './AvoSchemaParser';
import { AvoSessionTracker } from './AvoSessionTracker';

export class AvoInspector {
    
    environment: AvoInspectorEnv;
    sessionTracker: AvoSessionTracker;

    constructor(apiKey: string, env: AvoInspectorEnv) {
        this.environment = env;

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