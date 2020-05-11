import { AvoInspectorEnv } from "./AvoInspectorEnv";
import { AvoSchemaParser } from "./AvoSchemaParser";
import { AvoSessionTracker } from "./AvoSessionTracker";
import { AvoBatcher } from "./AvoBatcher";
import { AvoNetworkCallsHandler } from "./AvoNetworkCallsHandler";
import { AvoInstallationId } from "./AvoInstallationId";

let libVersion = require("../package.json").version;

export class AvoInspector {
  environment: AvoInspectorEnv;
  avoBatcher: AvoBatcher;
  sessionTracker: AvoSessionTracker;
  apiKey: string;
  version: string;

  // constructor(apiKey: string, env: AvoInspectorEnv, version: string) {
  constructor(options: {
    apiKey: string;
    env: AvoInspectorEnv;
    version: string;
    appName?: string;
  }) {
    // the constructor does aggressive null/undefined checking because same code paths will be accessible from JS
    if (options.env === null || options.env === undefined) {
      this.environment = AvoInspectorEnv.Dev;
      console.error(
        "[Avo Inspector] No environment provided. Defaulting to dev."
      );
    } else {
      this.environment = options.env;
    }

    if (
      options.apiKey === null ||
      options.apiKey === undefined ||
      options.apiKey.trim().length == 0
    ) {
      throw new Error(
        "[Avo Inspector] No API key provided. Inspector can't operate without API key."
      );
    } else {
      this.apiKey = options.apiKey;
    }

    if (
      options.version === null ||
      options.version === undefined ||
      options.version.trim().length == 0
    ) {
      throw new Error(
        "[Avo Inspector] No version provided. Many features of Inspector rely on versioning. Please provide comparable string version, i.e. integer or semantic."
      );
    } else {
      this.version = options.version;
    }

    let avoNetworkCallsHandler = new AvoNetworkCallsHandler(
      this.apiKey,
      this.environment.toString(),
      options.appName || "",
      this.version,
      libVersion,
      AvoInstallationId.getInstallationId()
    );
    this.avoBatcher = new AvoBatcher(avoNetworkCallsHandler);
    this.sessionTracker = new AvoSessionTracker(this.avoBatcher);

    window.addEventListener(
      "load",
      () => {
        this.sessionTracker.startOrProlongSession(Date.now());
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

  trackSchema(
    eventName: string,
    eventSchema: { [propName: string]: string }
  ): void {
    console.log(
      "Inspected event: " + eventName + ": " + JSON.stringify(eventSchema)
    );
    this.sessionTracker.startOrProlongSession(Date.now());
  }

  enableLogging(enable: boolean) {}

  extractSchema(eventProperties: {
    [propName: string]: any;
  }): Array<{
    propertyName: string;
    propertyType: string;
    children?: any;
  }> {
    this.sessionTracker.startOrProlongSession(Date.now());
    return new AvoSchemaParser().extractSchema(eventProperties);
  }

  setBatchSize(newBatchSize: number): void {}

  setBatchFlushSeconds(newBatchFlushSeconds: number): void {}
}
