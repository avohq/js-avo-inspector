export class AvoInspector {
    trackSchemaFromEvent(eventName: String, eventProperties: { [propName: string] : any}) {
        console.log('Inspected event: ' + eventName + ": " + JSON.stringify(eventProperties));
    }
} 

