import { AvoInspectorEnv } from "./AvoInspectorEnv";
import { AvoSessionTracker } from "./AvoSessionTracker";
import AvoGuid from "./AvoGuid";
import { AvoInstallationId } from "./AvoInstallationId";
import AvoNetworkCallsHandler from "./AvoNetworkCallsHandler";
import { AvoInspector } from "./AvoInspector";

export default class AvoBatcher {

    apiKey: string;
    env: AvoInspectorEnv;
    appName: string;
    appVersion: string;
    libVersion: string;

    events: Array<any>
    
    batchFlushAttemptTimestamp: number

    networkHandler: AvoNetworkCallsHandler;

    constructor(apiKey: string, env: AvoInspectorEnv, appName: string,
            appVersion: string, libVersion: string, networkCallsHandler: AvoNetworkCallsHandler) {
        this.apiKey = apiKey;
        this.env = env;
        this.appName = appName;
        this.appVersion = appVersion;
        this.libVersion = libVersion;

        this.networkHandler = networkCallsHandler;

        this.batchFlushAttemptTimestamp = Date.now();
        this.events = [];
    }

    handleSessionStarted() {
        const sessionStartedBody = this.createBaseCallBody();
        sessionStartedBody["type"] = "sessionStarted";

        this.events.push(sessionStartedBody);

        this.checkIfBatchNeedsToBeSent();
    }

    handleTrackSchema(eventName: string, schema: Array<any>) {
        const eventBody = this.createBaseCallBody();
        eventBody["type"] = "event";
        eventBody["eventName"] = eventName;
        eventBody["eventProperties"] = schema;

        this.events.push(eventBody);

        this.checkIfBatchNeedsToBeSent();
    }

    private checkIfBatchNeedsToBeSent() {
        const batchSize = this.events.length;
        const now = Date.now();
        const timeSinceLastFlushAttempt = now - this.batchFlushAttemptTimestamp;
        
        const sendBySize = (batchSize % AvoInspector.batchSize) == 0;
        const sendByTime = timeSinceLastFlushAttempt >= AvoInspector.batchFlushSeconds * 1000;
        
        const avoBatcher = this;
        if (sendBySize || sendByTime) {
            this.batchFlushAttemptTimestamp = now;
            const sendingEvents = avoBatcher.events;
            avoBatcher.events = [];
            this.networkHandler.callInspectorWithBatchBody(this.events, function(error: string | null): any {
                if (error != null) {
                    avoBatcher.events.push(sendingEvents);
                }
            });
        }
    }

    private createBaseCallBody(): any {
        return {
            "apiKey": this.apiKey,
            "appName": this.appName,
            "appVersion": this.appVersion,
            "libVersion": this.libVersion,
            "samplingRate": this.networkHandler.samplingRate,
            "sessionId": AvoSessionTracker.sessionId,
            "env": this.env,
            "libPlatform": "web",
            "messageId": AvoGuid.newGuid(),
            "trackingId": AvoInstallationId.getInstallationId(),
            "createdAt": new Date().toISOString()
        }
    }
}