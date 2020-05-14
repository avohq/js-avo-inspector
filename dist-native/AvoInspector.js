"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AvoInspectorEnv_1 = require("./AvoInspectorEnv");
const AvoSchemaParser_1 = require("./AvoSchemaParser");
const AvoSessionTracker_1 = require("./AvoSessionTracker");
const AvoBatcher_1 = require("./AvoBatcher");
const AvoNetworkCallsHandler_1 = require("./AvoNetworkCallsHandler");
const AvoStorage_1 = require("./AvoStorage");
let libVersion = require("../package.json").version;
class AvoInspector {
    // constructor(apiKey: string, env: AvoInspectorEnv, version: string) {
    constructor(options) {
        // the constructor does aggressive null/undefined checking because same code paths will be accessible from JS
        if (options.env === null || options.env === undefined) {
            this.environment = AvoInspectorEnv_1.AvoInspectorEnv.Dev;
            console.warn("[Avo Inspector] No environment provided. Defaulting to dev.");
        }
        else {
            this.environment = options.env;
        }
        if (options.apiKey === null ||
            options.apiKey === undefined ||
            options.apiKey.trim().length == 0) {
            throw new Error("[Avo Inspector] No API key provided. Inspector can't operate without API key.");
        }
        else {
            this.apiKey = options.apiKey;
        }
        if (options.version === null ||
            options.version === undefined ||
            options.version.trim().length == 0) {
            throw new Error("[Avo Inspector] No version provided. Many features of Inspector rely on versioning. Please provide comparable string version, i.e. integer or semantic.");
        }
        else {
            this.version = options.version;
        }
        if (this.environment === AvoInspectorEnv_1.AvoInspectorEnv.Dev) {
            AvoInspector._batchFlushSeconds = 1;
            AvoInspector._shouldLog = true;
        }
        else {
            AvoInspector._batchFlushSeconds = 30;
            AvoInspector._shouldLog = false;
        }
        AvoInspector.avoStorage = new AvoStorage_1.AvoStorage();
        let avoNetworkCallsHandler = new AvoNetworkCallsHandler_1.AvoNetworkCallsHandler(this.apiKey, this.environment.toString(), options.appName || "", this.version, libVersion);
        this.avoBatcher = new AvoBatcher_1.AvoBatcher(avoNetworkCallsHandler);
        this.sessionTracker = new AvoSessionTracker_1.AvoSessionTracker(this.avoBatcher);
        try {
            if (process.env.BROWSER) {
                window.addEventListener("load", () => {
                    this.sessionTracker.startOrProlongSession(Date.now());
                }, false);
            }
            else {
                this.sessionTracker.startOrProlongSession(Date.now());
            }
        }
        catch (e) {
            console.error("Avo Inspector: something went very wrong. Please report to support@avo.app.", e);
        }
    }
    static get batchSize() {
        return this._batchSize;
    }
    static get batchFlushSeconds() {
        return this._batchFlushSeconds;
    }
    static get shouldLog() {
        return this._shouldLog;
    }
    trackSchemaFromEvent(eventName, eventProperties) {
        try {
            if (AvoInspector.shouldLog) {
                console.log("Avo Inspector: supplied event " + eventName + " with params " + JSON.stringify(eventProperties));
            }
            let eventSchema = this.extractSchema(eventProperties);
            this.trackSchema(eventName, eventSchema);
        }
        catch (e) {
            console.error("Avo Inspector: something went very wrong. Please report to support@avo.app.", e);
        }
    }
    trackSchema(eventName, eventSchema) {
        try {
            this.sessionTracker.startOrProlongSession(Date.now());
            this.avoBatcher.handleTrackSchema(eventName, eventSchema);
        }
        catch (e) {
            console.error("Avo Inspector: something went very wrong. Please report to support@avo.app.", e);
        }
    }
    enableLogging(enable) {
        AvoInspector._shouldLog = enable;
    }
    extractSchema(eventProperties) {
        try {
            this.sessionTracker.startOrProlongSession(Date.now());
            return new AvoSchemaParser_1.AvoSchemaParser().extractSchema(eventProperties);
        }
        catch (e) {
            console.error("Avo Inspector: something went very wrong. Please report to support@avo.app.", e);
            return [];
        }
    }
    setBatchSize(newBatchSize) {
        AvoInspector._batchSize = newBatchSize;
    }
    setBatchFlushSeconds(newBatchFlushSeconds) {
        AvoInspector._batchFlushSeconds = newBatchFlushSeconds;
    }
}
exports.AvoInspector = AvoInspector;
AvoInspector._batchSize = 30;
AvoInspector._batchFlushSeconds = 30;
AvoInspector._shouldLog = false;
