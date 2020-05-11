import { AvoInspectorEnv } from "./AvoInspectorEnv";
import { AvoSchemaParser } from "./AvoSchemaParser";
import { AvoSessionTracker } from "./AvoSessionTracker";
import { AvoBatcher } from "./AvoBatcher";

export class AvoInspector {
  environment: AvoInspectorEnv;
  avoBatcher: AvoBatcher;
  sessionTracker: AvoSessionTracker;
  apiKey: string;
  version: string;

  constructor(apiKey: string, env: AvoInspectorEnv, version: string) {
    // the constructor does aggressive null/undefined checking because same code paths will be accessible from JS
    if (env === null || env === undefined) {
      this.environment = AvoInspectorEnv.Dev;
      console.error(
        "[Avo Inspector] No environment provided. Defaulting to dev."
      );
    } else {
      this.environment = env;
    }

    if (apiKey === null || apiKey === undefined || apiKey.trim().length == 0) {
      throw new Error(
        "[Avo Inspector] No API key provided. Inspector can't operate without API key."
      );
    } else {
      this.apiKey = apiKey;
    }

    if (
      version === null ||
      version === undefined ||
      version.trim().length == 0
    ) {
      throw new Error(
        "[Avo Inspector] No version provided. Many features of Inspector rely on versioning. Please provide comparable string version, i.e. integer or semantic."
      );
    } else {
      this.version = version;
    }

    this.avoBatcher = new AvoBatcher();
    this.sessionTracker = new AvoSessionTracker(this.avoBatcher);

    let inspector = this;
    window.addEventListener(
      "load",
      function () {
        inspector.sessionTracker.startOrProlongSession(Date.now());
      },
      false
    );
  }

  trackSchemaFromEvent(
    eventName: string,
    eventProperties: { [propName: string]: any }
  ): void {
    console.log(
      "Inspected event: " + eventName + ": " + JSON.stringify(eventProperties)
    );
    let eventSchema = this.extractSchema(eventProperties);
    this.sessionTracker.startOrProlongSession(Date.now());
    this.avoBatcher.trackEventSchema(eventName, eventSchema);
  }

  trackSchema(eventName: string, eventSchema: { [propName: string]: string }) {
    console.log(
      "Inspected event: " + eventName + ": " + JSON.stringify(eventSchema)
    );
    this.sessionTracker.startOrProlongSession(Date.now());
  }

  enableLogging(enable: Boolean) {}

  extractSchema(eventProperties: {
    [propName: string]: any;
  }): Array<{
    propertyName: string;
    propertyValue: string;
    children?: any;
  }> {
    this.sessionTracker.startOrProlongSession(Date.now());
    return new AvoSchemaParser().extractSchema(eventProperties);
  }

  setBatchSize(newBatchSize: Number) {}

  setBatchFlushSeconds(newBatchFlushSeconds: Number) {}
}
