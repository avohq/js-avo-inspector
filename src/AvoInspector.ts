import {AvoInspectorEnv} from './AvoInspectorEnv';
import {AvoType} from './AvoType';

export class AvoInspector {
    
    constructor(apiKey: string, env: AvoInspectorEnv) {

    }
    
    trackSchemaFromEvent(eventName: string, eventProperties: { [propName: string] : any}): { [propName: string] : AvoType} {
        console.log('Inspected event: ' + eventName + ": " + JSON.stringify(eventProperties));
        return { "prop": new AvoType() };
    }

    trackSchema(eventName: string, eventSchema: { [propName: string] : AvoType}) {
        console.log('Inspected event: ' + eventName + ": " + JSON.stringify(eventSchema));
    }

    enableLogging(enable: Boolean) {
        
    }
    
    extractSchema(eventProperties: { [propName: string] : any}): { [propName: string] : AvoType} {
        return { "prop": new AvoType() };
    }

    setBatchSize(newBatchSize: Number) {

    }

    setBatchFlushSeconds(newBatchFlushSeconds: Number) {

    }
}