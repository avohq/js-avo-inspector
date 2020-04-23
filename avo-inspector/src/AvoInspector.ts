import { AvoInspectorEnv } from './AvoInspectorEnv';
import { AvoType } from './AvoType';

export class AvoInspector {
    
    constructor(apiKey: string, env: AvoInspectorEnv) {

    }
    
    trackSchemaFromEvent(eventName: string, eventProperties: { [propName: string] : any}): { [propName: string] : AvoType.Type} {
        console.log('Inspected event: ' + eventName + ": " + JSON.stringify(eventProperties));
        return { "prop": new AvoType.Unknown() };
    }

    trackSchema(eventName: string, eventSchema: { [propName: string] : AvoType.Type}) {
        console.log('Inspected event: ' + eventName + ": " + JSON.stringify(eventSchema));
    }

    enableLogging(enable: Boolean) {
        
    }
    
    extractSchema(eventProperties: { [propName: string] : any}): { [propName: string] : AvoType.Type} {
        if (eventProperties == null) {
            return {};
        }

        let result: {[propName: string] : AvoType.Type} = {};

        for (let propName in eventProperties) {
            let propValue = eventProperties[propName];

            result[propName] = this.getPropValueType(propValue);
        }

        return result;
    }

    private getPropValueType(propValue: any): AvoType.Type {
        let propType = typeof propValue;
        if (propValue == null) {
            return new AvoType.Null();
        } else if (propType === "string" ) {
            return new AvoType.String();
        } else if (propType === "number" || propType === "bigint") {
            if ((propValue + "").indexOf(".") >= 0) {
                return new AvoType.Float();
            } else {
                return new AvoType.Int();
            }
        } else if (propType === "boolean") {
            return new AvoType.Boolean();
        } else if (propType === "object") {
            if (propValue instanceof Array) {
                return new AvoType.List();
            } else {
                return new AvoType.AvoObject();
            }
        } else {
            return new AvoType.Unknown();
        }
    }

    setBatchSize(newBatchSize: Number) {

    }

    setBatchFlushSeconds(newBatchFlushSeconds: Number) {

    }
}