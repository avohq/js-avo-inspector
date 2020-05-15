export declare class AvoStorage {
    data: {
        [key: string]: string | null;
    };
    reactNative: any | null;
    Platform: any | null;
    AsyncStorage: any | null;
    initialized: boolean;
    onInitFuncs: Array<() => void>;
    constructor();
    runOnInit(func: () => void): void;
    getItemAsync<T>(key: string): Promise<T | null>;
    getItem: <T>(key: string) => T | null;
    setItem: <T>(key: string, value: T) => void;
    removeItem: (key: string) => void;
}
