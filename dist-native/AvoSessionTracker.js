"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AvoGuid_1 = require("./AvoGuid");
const AvoInspector_1 = require("./AvoInspector");
class AvoSessionTracker {
    constructor(avoBatcher) {
        this._lastSessionTimestamp = null;
        this._sessionLengthMillis = 5 * 60 * 1000;
        this.avoBatcher = avoBatcher;
    }
    static get sessionId() {
        if (AvoSessionTracker._sessionId === null) {
            if (!AvoInspector_1.AvoInspector.avoStorage.initialized) {
                return "unknown";
            }
            let maybeSessionId = null;
            try {
                maybeSessionId = AvoInspector_1.AvoInspector.avoStorage.getItem(AvoSessionTracker.idCacheKey);
            }
            catch (e) {
                console.error("Avo Inspector: something went wrong. Please report to support@avo.app.", e);
            }
            if ((maybeSessionId === null || maybeSessionId === undefined)) {
                AvoSessionTracker._sessionId = this.updateSessionId();
            }
            else {
                AvoSessionTracker._sessionId = maybeSessionId;
            }
        }
        return AvoSessionTracker._sessionId;
    }
    get lastSessionTimestamp() {
        if (this._lastSessionTimestamp === null || this._lastSessionTimestamp === 0) {
            let maybeLastSessionTimestamp = AvoInspector_1.AvoInspector.avoStorage.getItem(AvoSessionTracker.lastSessionTimestampKey);
            if (maybeLastSessionTimestamp !== null &&
                maybeLastSessionTimestamp !== undefined) {
                this._lastSessionTimestamp = maybeLastSessionTimestamp;
                if (isNaN(this._lastSessionTimestamp)) {
                    this._lastSessionTimestamp = 0;
                }
            }
            else {
                this._lastSessionTimestamp = 0;
            }
        }
        return this._lastSessionTimestamp;
    }
    get sessionLengthMillis() {
        return this._sessionLengthMillis;
    }
    startOrProlongSession(atTime) {
        AvoInspector_1.AvoInspector.avoStorage.runOnInit(() => {
            const timeSinceLastSession = atTime - this.lastSessionTimestamp;
            if (timeSinceLastSession > this._sessionLengthMillis) {
                AvoSessionTracker.updateSessionId();
                this.avoBatcher.handleSessionStarted();
            }
            this._lastSessionTimestamp = atTime;
            AvoInspector_1.AvoInspector.avoStorage.setItem(AvoSessionTracker.lastSessionTimestampKey, this._lastSessionTimestamp);
        });
    }
    static updateSessionId() {
        AvoSessionTracker._sessionId = AvoGuid_1.default.newGuid();
        try {
            AvoInspector_1.AvoInspector.avoStorage.setItem(AvoSessionTracker.idCacheKey, AvoSessionTracker.sessionId);
        }
        catch (e) {
            console.error("Avo Inspector: something went very wrong. Please report to support@avo.app.", e);
        }
        return AvoSessionTracker._sessionId;
    }
    static get lastSessionTimestampKey() {
        return "AvoInspectorSessionTimestamp";
    }
    static get idCacheKey() {
        return "AvoInspectorSessionId";
    }
}
exports.AvoSessionTracker = AvoSessionTracker;
AvoSessionTracker._sessionId = null;
