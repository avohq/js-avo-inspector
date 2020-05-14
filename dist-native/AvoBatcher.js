"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AvoInspector_1 = require("./AvoInspector");
class AvoBatcher {
    constructor(networkCallsHandler) {
        this.events = [];
        this.networkCallsHandler = networkCallsHandler;
        this.batchFlushAttemptTimestamp = Date.now();
        AvoInspector_1.AvoInspector.avoStorage.getItemAsync(AvoBatcher.cacheKey).then((savedEvents) => {
            if (savedEvents !== null) {
                this.events = this.events.concat(savedEvents);
                this.checkIfBatchNeedsToBeSent();
            }
        });
    }
    handleSessionStarted() {
        this.events.push(this.networkCallsHandler.bodyForSessionStartedCall());
        this.saveEvents();
        this.checkIfBatchNeedsToBeSent();
    }
    handleTrackSchema(eventName, schema) {
        this.events.push(this.networkCallsHandler.bodyForEventSchemaCall(eventName, schema));
        this.saveEvents();
        if (AvoInspector_1.AvoInspector.shouldLog) {
            console.log("Avo Inspector: saved event " + eventName + " with schema " + JSON.stringify(schema));
        }
        this.checkIfBatchNeedsToBeSent();
    }
    checkIfBatchNeedsToBeSent() {
        const batchSize = this.events.length;
        const now = Date.now();
        const timeSinceLastFlushAttempt = now - this.batchFlushAttemptTimestamp;
        const sendBySize = (batchSize % AvoInspector_1.AvoInspector.batchSize) == 0;
        const sendByTime = timeSinceLastFlushAttempt >= AvoInspector_1.AvoInspector.batchFlushSeconds * 1000;
        const avoBatcher = this;
        if (sendBySize || sendByTime) {
            this.batchFlushAttemptTimestamp = now;
            const sendingEvents = avoBatcher.events;
            avoBatcher.events = [];
            this.networkCallsHandler.callInspectorWithBatchBody(sendingEvents, function (error) {
                if (error != null) {
                    avoBatcher.events = avoBatcher.events.concat(sendingEvents);
                    if (AvoInspector_1.AvoInspector.shouldLog) {
                        console.log("Avo Inspector: batch sending failed: " + error + ". We will attempt to send your schemas with next batch");
                    }
                }
                else {
                    if (AvoInspector_1.AvoInspector.shouldLog) {
                        console.log("Avo Inspector: batch sent successfully.");
                    }
                }
                avoBatcher.saveEvents();
            });
        }
        ;
    }
    saveEvents() {
        if (this.events.length > 1000) {
            const extraElements = this.events.length - 1000;
            this.events.splice(0, extraElements);
        }
        AvoInspector_1.AvoInspector.avoStorage.setItem(AvoBatcher.cacheKey, this.events);
    }
    static get cacheKey() {
        return "AvoInspectorEvents";
    }
}
exports.AvoBatcher = AvoBatcher;
