//import Cookies from 'universal-cookie';
import AvoGuid from "./AvoGuid";
import { AvoBatcherType } from "./AvoBatcher";
import LocalStorage from "./LocalStorage";

export class AvoSessionTracker {
  private static _sessionId: null | string;
  static get sessionId(): string {
    if (AvoSessionTracker._sessionId == null) {
      throw new Error(
        "no sessionId set, Avo Inspector not correctly initialized"
      );
    }
    return AvoSessionTracker._sessionId;
  }

  private _lastSessionTimestamp: number;
  get lastSessionTimestamp(): number {
    return this._lastSessionTimestamp;
  }

  private _sessionLengthMillis: number = 5 * 60 * 1000;
  get sessionLengthMillis(): number {
    return this._sessionLengthMillis;
  }

  private avoBatcher: AvoBatcherType;

  constructor(avoBatcher: AvoBatcherType) {
    let maybeLastSessionTimestamp = LocalStorage.getItem<number>(
      AvoSessionTracker.lastSessionTimestampKey
    );
    if (
      maybeLastSessionTimestamp !== null &&
      maybeLastSessionTimestamp !== undefined
    ) {
      this._lastSessionTimestamp = maybeLastSessionTimestamp; //this.cookies.get(AvoSessionTracker.lastSessionTimestampKey);
      if (isNaN(this._lastSessionTimestamp)) {
        this._lastSessionTimestamp = 0;
      }
    } else {
      this._lastSessionTimestamp = 0;
    }

    let maybeSessionId = LocalStorage.getItem<string>(
      AvoSessionTracker.idCacheKey
    ); //this.cookies.get(AvoSessionTracker.idCacheKey);

    if (maybeSessionId === null || maybeSessionId === undefined) {
      this.updateSessionId();
    } else {
      AvoSessionTracker._sessionId = maybeSessionId;
    }

    this.avoBatcher = avoBatcher;
  }

  startOrProlongSession(atTime: number): void {
    const timeSinceLastSession = atTime - this._lastSessionTimestamp;

    if (timeSinceLastSession > this._sessionLengthMillis) {
      this.updateSessionId();
      this.avoBatcher.startSession();
    }

    this._lastSessionTimestamp = atTime;
    //this.cookies.set(AvoSessionTracker.lastSessionTimestampKey, this.lastSessionTimestamp);
    LocalStorage.setItem(
      AvoSessionTracker.lastSessionTimestampKey,
      this._lastSessionTimestamp
    );
  }

  private updateSessionId(): void {
    AvoSessionTracker._sessionId = AvoGuid.newGuid();
    LocalStorage.setItem(
      AvoSessionTracker.idCacheKey,
      AvoSessionTracker.sessionId
    ); //this.cookies.set(AvoSessionTracker.idCacheKey, AvoSessionTracker.sessionId);
  }

  static get lastSessionTimestampKey(): string {
    return "AvoInspectorSessionTimestamp";
  }

  static get idCacheKey(): string {
    return "AvoInspectorSessionId";
  }
}
