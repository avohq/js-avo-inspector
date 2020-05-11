//import Cookies from 'universal-cookie';
import AvoGuid from "./AvoGuid";

export class AvoSessionTracker {
  static sessionId: null | string;
  private _lastSessionTimestamp: number;
  get lastSessionTimestamp(): number {
    return this._lastSessionTimestamp;
  }
  private _sessionLengthMillis: number = 5 * 60 * 1000;
  get sessionLengthMillis(): number {
    return this._sessionLengthMillis;
  }
  private avoBatcher: any;

  constructor(avoBatcher: any) {
    let maybeLastSessionTimestamp = window.localStorage.getItem(
      AvoSessionTracker.lastSessionTimestampKey
    );
    if (
      maybeLastSessionTimestamp !== null &&
      maybeLastSessionTimestamp !== undefined
    ) {
      this._lastSessionTimestamp = JSON.parse(maybeLastSessionTimestamp); //this.cookies.get(AvoSessionTracker.lastSessionTimestampKey);
      if (isNaN(this._lastSessionTimestamp)) {
        this._lastSessionTimestamp = 0;
      }
    } else {
      this._lastSessionTimestamp = 0;
    }

    let maybeSessionId = window.localStorage.getItem(
      AvoSessionTracker.idCacheKey
    ); //this.cookies.get(AvoSessionTracker.idCacheKey);

    if (maybeSessionId === null || maybeSessionId === undefined) {
      this.updateSessionId();
    } else {
      AvoSessionTracker.sessionId = JSON.parse(maybeSessionId);
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
    window.localStorage.setItem(
      AvoSessionTracker.lastSessionTimestampKey,
      JSON.stringify(this._lastSessionTimestamp)
    );
  }

  private updateSessionId() {
    AvoSessionTracker.sessionId = AvoGuid.newGuid();
    window.localStorage.setItem(
      AvoSessionTracker.idCacheKey,
      JSON.stringify(AvoSessionTracker.sessionId)
    ); //this.cookies.set(AvoSessionTracker.idCacheKey, AvoSessionTracker.sessionId);
  }

  static get lastSessionTimestampKey(): string {
    return "AvoInspectorSessionTimestamp";
  }
  static get idCacheKey(): string {
    return "AvoInspectorSessionId";
  }
}
