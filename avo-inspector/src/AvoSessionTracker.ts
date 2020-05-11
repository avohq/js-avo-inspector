//import Cookies from 'universal-cookie';
import AvoGuid from './AvoGuid';

export class AvoSessionTracker {
    static sessionId: string;
    private _lastSessionTimestamp: number;
    get lastSessionTimestamp(): number { return this._lastSessionTimestamp }
    private _sessionLengthMillis: number = 5 * 60 * 1000;
    get sessionLengthMillis(): number { return this._sessionLengthMillis }
    private avoBatcher;

    constructor(avoBatcher) {
        this._lastSessionTimestamp = parseInt(window.localStorage.getItem(AvoSessionTracker.lastSessionTimestampKey)); //this.cookies.get(AvoSessionTracker.lastSessionTimestampKey);
        AvoSessionTracker.sessionId = window.localStorage.getItem(AvoSessionTracker.idCacheKey); //this.cookies.get(AvoSessionTracker.idCacheKey);
        if (this._lastSessionTimestamp === null || this._lastSessionTimestamp === undefined || isNaN(this._lastSessionTimestamp)) {
            this._lastSessionTimestamp = 0;
        }

        if (AvoSessionTracker.sessionId === null || AvoSessionTracker.sessionId === undefined) {
            this.updateSessionId();
        }

        this.avoBatcher = avoBatcher;
    }

    startOrProlongSession(atTime: number) {
        const timeSinceLastSession = atTime - this._lastSessionTimestamp;

        if (timeSinceLastSession > this._sessionLengthMillis) {
            this.updateSessionId();
            this.avoBatcher.startSession();
        }

        this._lastSessionTimestamp = atTime;
         //this.cookies.set(AvoSessionTracker.lastSessionTimestampKey, this.lastSessionTimestamp);
         window.localStorage.setItem(AvoSessionTracker.lastSessionTimestampKey, this._lastSessionTimestamp.toString());
    }

    private updateSessionId() {
        AvoSessionTracker.sessionId = AvoGuid.newGuid();
        window.localStorage.setItem(AvoSessionTracker.idCacheKey, AvoSessionTracker.sessionId); //this.cookies.set(AvoSessionTracker.idCacheKey, AvoSessionTracker.sessionId);
    }

    static get lastSessionTimestampKey(): string { return "AvoInspectorSessionTimestamp" }
    static get idCacheKey(): string { return "AvoInspectorSessionId" }
}

