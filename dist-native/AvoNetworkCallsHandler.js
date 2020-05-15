"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AvoGuid_1 = require("./AvoGuid");
const AvoSessionTracker_1 = require("./AvoSessionTracker");
const AvoInspector_1 = require("./AvoInspector");
const AvoInstallationId_1 = require("./AvoInstallationId");
class AvoNetworkCallsHandler {
    constructor(apiKey, envName, appName, appVersion, libVersion) {
        this.samplingRate = 1.0;
        this.sending = false;
        this.apiKey = apiKey;
        this.envName = envName;
        this.appName = appName;
        this.appVersion = appVersion;
        this.libVersion = libVersion;
    }
    callInspectorWithBatchBody(events, onCompleted) {
        if (this.sending) {
            onCompleted("Batch sending cancelled because another batch sending is in progress. Your events will be sent with next batch.");
            return;
        }
        if (events.length === 0) {
            return;
        }
        if (Math.random() > this.samplingRate) {
            if (AvoInspector_1.AvoInspector.shouldLog) {
                console.log("Avo Inspector: last event schema dropped due to sampling rate.");
            }
            return;
        }
        if (AvoInspector_1.AvoInspector.shouldLog) {
            events.forEach(function (event) {
                if (event.type === "sessionStarted") {
                    console.log("Avo Inspector: sending session started event.");
                }
                else if (event.type === "event") {
                    let schemaEvent = event;
                    console.log("Avo Inspector: sending event " + schemaEvent.eventName + " with schema " + JSON.stringify(schemaEvent.eventProperties));
                }
            });
        }
        this.sending = true;
        let xmlhttp = new XMLHttpRequest();
        xmlhttp.open("POST", AvoNetworkCallsHandler.trackingEndpoint, true);
        xmlhttp.setRequestHeader("Content-Type", "text/plain");
        xmlhttp.send(JSON.stringify(events));
        xmlhttp.onload = () => {
            if (xmlhttp.status != 200) {
                onCompleted(`Error ${xmlhttp.status}: ${xmlhttp.statusText}`);
            }
            else {
                const samplingRate = JSON.parse(xmlhttp.response).samplingRate;
                if (samplingRate !== undefined) {
                    this.samplingRate = samplingRate;
                }
                onCompleted(null);
            }
        };
        xmlhttp.onerror = () => {
            onCompleted("Request failed");
        };
        xmlhttp.ontimeout = () => {
            onCompleted("Request timed out");
        };
        this.sending = false;
    }
    bodyForSessionStartedCall() {
        let sessionBody = this.createBaseCallBody();
        sessionBody.type = "sessionStarted";
        return sessionBody;
    }
    bodyForEventSchemaCall(eventName, eventProperties) {
        let eventSchemaBody = this.createBaseCallBody();
        eventSchemaBody.type = "event";
        eventSchemaBody.eventName = eventName;
        eventSchemaBody.eventProperties = eventProperties;
        return eventSchemaBody;
    }
    createBaseCallBody() {
        return {
            apiKey: this.apiKey,
            appName: this.appName,
            appVersion: this.appVersion,
            libVersion: this.libVersion,
            env: this.envName,
            libPlatform: "web",
            messageId: AvoGuid_1.default.newGuid(),
            trackingId: AvoInstallationId_1.AvoInstallationId.getInstallationId(),
            createdAt: new Date().toISOString(),
            sessionId: AvoSessionTracker_1.AvoSessionTracker.sessionId,
            samplingRate: this.samplingRate,
        };
    }
}
exports.AvoNetworkCallsHandler = AvoNetworkCallsHandler;
AvoNetworkCallsHandler.trackingEndpoint = "https://api.avo.app/inspector/v1/track";
