import { AvoInspectorEnv } from "./AvoInspectorEnv";
import { AvoSchemaParser } from "./AvoSchemaParser";

export class AvoInspector {
  constructor(apiKey: string, env: AvoInspectorEnv) {}

  trackSchemaFromEvent(
    eventName: string,
    eventProperties: { [propName: string]: any }
  ): { [propName: string]: string } {
    console.log(
      "Inspected event: " + eventName + ": " + JSON.stringify(eventProperties)
    );
    return { prop: "unknown" };
  }

  trackSchema(eventName: string, eventSchema: { [propName: string]: string }) {
    console.log(
      "Inspected event: " + eventName + ": " + JSON.stringify(eventSchema)
    );
  }

  enableLogging(enable: Boolean) {}

  extractSchema(eventProperties: { [propName: string]: any }): string {
    return new AvoSchemaParser().extractSchema(eventProperties);
  }

  setBatchSize(newBatchSize: Number) {}

  setBatchFlushSeconds(newBatchFlushSeconds: Number) {}
}
