declare abstract class PlatformAvoStorage {
    abstract init(shouldLog: boolean, suffix: string): void;
    abstract getItemAsync<T>(key: string): Promise<T | null>;
    abstract getItem<T>(key: string): T | null;
    abstract setItem<T>(key: string, value: T): void;
    abstract removeItem(key: string): void;
    abstract runAfterInit(func: () => void): void;
    abstract isInitialized(): boolean;
    parseJson<T>(maybeItem: string | null | undefined): T | null;
}
export declare class AvoStorage {
    Platform: string | null;
    storageImpl: PlatformAvoStorage;
    constructor(shouldLog: boolean, suffix?: string);
    isInitialized(): boolean;
    getItemAsync<T>(key: string): Promise<T | null>;
    getItem<T>(key: string): T | null;
    setItem<T>(key: string, value: T): void;
    removeItem(key: string): void;
    runAfterInit(func: () => void): void;
}
export {};
