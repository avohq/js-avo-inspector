/**
 * AvoAnonymousId manages a persistent anonymous user identifier.
 *
 * The anonymous ID is generated once and stored persistently across sessions.
 * It remains the same until the storage is cleared or the user uninstalls the app.
 *
 * This class is designed to be standalone and reusable across different SDK platforms
 * (Web, Node, React Native). Each platform should provide its own AvoStorage implementation.
 */
export declare class AvoAnonymousId {
    private static _anonymousId;
    /**
     * Get the anonymous ID. If it doesn't exist, generates and persists a new one.
     * Returns "unknown" if storage is not initialized.
     */
    static get anonymousId(): string;
    /**
     * The storage key used to persist the anonymous ID.
     */
    static get storageKey(): string;
    /**
     * Clear the cached anonymous ID. The next access will reload from storage.
     * This is primarily useful for testing.
     */
    static clearCache(): void;
}
