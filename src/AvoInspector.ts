export class AvoInspector {
    trackSchemaFromEvent(eventName: String, eventProperties: { String : any}) {
        console.log('Inspected event: ' + eventName + ": " + JSON.stringify(eventProperties));
    }
} 

