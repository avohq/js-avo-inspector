import AvoGuid from "./AvoGuid";
import { AvoInspector } from "./AvoInspector";

export class AvoStreamId {
  private static _anonymousId: string | null = null;
  private static _initializationPromise: Promise<string> | null = null;

  /**
   * Returns the persistent anonymous ID (Model A).
   * Generates a UUID once and persists it via AsyncStorage.
   * Never resets based on time.
   * Concurrent calls before cache is populated all return the same UUID.
   */
  static initialize(): Promise<string> {
    // Return cached value immediately if available
    if (AvoStreamId._anonymousId !== null) {
      return Promise.resolve(AvoStreamId._anonymousId);
    }

    // Return the in-flight promise if initialization is already underway
    if (AvoStreamId._initializationPromise !== null) {
      return AvoStreamId._initializationPromise;
    }

    // Guard: if storage isn't initialized yet, fall back to a fresh GUID
    if (!AvoInspector.avoStorage) {
      const fallbackId = AvoGuid.newGuid();
      AvoStreamId._anonymousId = fallbackId;
      return Promise.resolve(fallbackId);
    }

    // Start initialization and cache the promise to handle concurrent calls
    const storagePromise = AvoInspector.avoStorage.getItemAsync<string>(AvoStreamId.cacheKey);
    const resolvedPromise = storagePromise && typeof storagePromise.then === "function"
      ? storagePromise
      : Promise.resolve(null);

    AvoStreamId._initializationPromise = resolvedPromise.then((maybeId) => {
      if (maybeId !== null && maybeId !== undefined) {
        AvoStreamId._anonymousId = maybeId;
      } else {
        AvoStreamId._anonymousId = AvoGuid.newGuid();
        AvoInspector.avoStorage.setItem(
          AvoStreamId.cacheKey,
          AvoStreamId._anonymousId
        );
      }
      return AvoStreamId._anonymousId as string;
    }).catch((error) => {
      // Reset so callers can retry on next call
      AvoStreamId._initializationPromise = null;
      // Fall back to a fresh GUID
      const fallbackId = AvoGuid.newGuid();
      AvoStreamId._anonymousId = fallbackId;
      return fallbackId;
    });

    return AvoStreamId._initializationPromise;
  }

  /**
   * Sets a custom anonymous ID. Persists to storage.
   */
  static setAnonymousId(id: string): void {
    AvoStreamId._anonymousId = id;
    AvoStreamId._initializationPromise = null;
    if (AvoInspector.avoStorage) {
      AvoInspector.avoStorage.setItem(AvoStreamId.cacheKey, id);
    }
  }

  /**
   * Clears the cached anonymous ID. The next access will reload from storage.
   */
  static clearCache(): void {
    AvoStreamId._anonymousId = null;
    AvoStreamId._initializationPromise = null;
  }

  static get cacheKey(): string {
    return "AvoInspectorAnonymousId";
  }
}
