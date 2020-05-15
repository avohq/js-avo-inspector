import { AvoBatcherType } from "./AvoBatcher";
export declare class AvoSessionTracker {
    private static _sessionId;
    static get sessionId(): string;
    private _lastSessionTimestamp;
    get lastSessionTimestamp(): number;
    private _sessionLengthMillis;
    get sessionLengthMillis(): number;
    private avoBatcher;
    constructor(avoBatcher: AvoBatcherType);
    startOrProlongSession(atTime: number): void;
    private static updateSessionId;
    static get lastSessionTimestampKey(): string;
    static get idCacheKey(): string;
}
