import AvoGuid from "./AvoGuid";
import { AvoBatcherType } from "./AvoBatcher";
import LocalStorage from "./LocalStorage";

export class AvoSessionTracker {
  private static _sessionId: null | string;
  static get sessionId(): string {
    if (AvoSessionTracker._sessionId == null) {
      throw new Error(
        "no sessionId set, Avo Inspector was not initialized correctly"
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
      this._lastSessionTimestamp = maybeLastSessionTimestamp;
      if (isNaN(this._lastSessionTimestamp)) {
        this._lastSessionTimestamp = 0;
      }
    } else {
      this._lastSessionTimestamp = 0;
    }

    let maybeSessionId = LocalStorage.getItem<string>(
      AvoSessionTracker.idCacheKey
    );

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
      this.avoBatcher.handleSessionStarted();
    }

    this._lastSessionTimestamp = atTime;
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
    );
  }

  static get lastSessionTimestampKey(): string {
    return "AvoInspectorSessionTimestamp";
  }

  static get idCacheKey(): string {
    return "AvoInspectorSessionId";
  }
}
