import AvoGuid from "./AvoGuid";
import { AvoBatcherType } from "./AvoBatcher";
import { AvoInspector } from "./AvoInspector";

export class AvoSessionTracker {
  private static _sessionId: null | string = null;
  static get sessionId(): string {
    if (AvoSessionTracker._sessionId === null) {
      if (!AvoInspector.avoStorage.initialized) {
        return "unknown";
      }

      let maybeSessionId: string | null = null;
      try {
        maybeSessionId = AvoInspector.avoStorage.getItem<string>(
          AvoSessionTracker.idCacheKey
        );
      } catch (e) {
        console.error(
          "Avo Inspector: something went wrong. Please report to support@avo.app.",
          e
        );
      }

      if (maybeSessionId === null || maybeSessionId === undefined) {
        AvoSessionTracker._sessionId = this.updateSessionId();
      } else {
        AvoSessionTracker._sessionId = maybeSessionId;
      }
    }
    return AvoSessionTracker._sessionId;
  }

  private _lastSessionTimestamp: number | null = null;
  get lastSessionTimestamp(): number {
    if (
      this._lastSessionTimestamp === null ||
      this._lastSessionTimestamp === 0
    ) {
      let maybeLastSessionTimestamp = AvoInspector.avoStorage.getItem<number>(
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
    }

    return this._lastSessionTimestamp;
  }

  private _sessionLengthMillis: number = 5 * 60 * 1000;
  get sessionLengthMillis(): number {
    return this._sessionLengthMillis;
  }

  private avoBatcher: AvoBatcherType;

  constructor(avoBatcher: AvoBatcherType) {
    this.avoBatcher = avoBatcher;
  }

  startOrProlongSession(atTime: number): void {
    AvoInspector.avoStorage.runOnItemsFromPreviousSessionLoaded(() => {
      const timeSinceLastSession = atTime - this.lastSessionTimestamp;

      if (timeSinceLastSession > this._sessionLengthMillis) {
        AvoSessionTracker.updateSessionId();
        this.avoBatcher.handleSessionStarted();
      }

      this._lastSessionTimestamp = atTime;
      AvoInspector.avoStorage.setItem(
        AvoSessionTracker.lastSessionTimestampKey,
        this._lastSessionTimestamp
      );
    });
  }

  private static updateSessionId(): string {
    AvoSessionTracker._sessionId = AvoGuid.newGuid();
    try {
      AvoInspector.avoStorage.setItem(
        AvoSessionTracker.idCacheKey,
        AvoSessionTracker.sessionId
      );
    } catch (e) {
      console.error(
        "Avo Inspector: something went wrong. Please report to support@avo.app.",
        e
      );
    }
    return AvoSessionTracker._sessionId;
  }

  static get lastSessionTimestampKey(): string {
    return "AvoInspectorSessionTimestamp";
  }

  static get idCacheKey(): string {
    return "AvoInspectorSessionId";
  }
}
