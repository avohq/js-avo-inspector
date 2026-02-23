export declare class AvoStreamId {
    private static _anonymousId;
    private static _initializationPromise;
    /**
     * Returns the persistent anonymous ID (Model A).
     * Generates a UUID once and persists it via AsyncStorage.
     * Never resets based on time.
     * Concurrent calls before cache is populated all return the same UUID.
     */
    static initialize(): Promise<string>;
    static get cacheKey(): string;
}
