import AvoGuid from "./AvoGuid";
import { AvoInspector } from "./AvoInspector";

/**
 * AvoStreamId manages an ephemeral stream identifier.
 *
 * The stream ID is generated and stored persistently, but resets after:
 * - 4 hours of total age AND
 * - 2 hours of idle time (no activity)
 *
 * This ensures the ID is truly anonymous by not persisting indefinitely,
 * while still maintaining session continuity during active usage.
 */
export class AvoStreamId {
  private static _streamId: string | null = null;
  private static _createdAt: number | null = null;
  private static _lastActivityAt: number | null = null;

  // Ephemeral reset thresholds
  private static readonly MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours
  private static readonly IDLE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

  // Storage keys
  private static readonly STREAM_ID_KEY = "AvoInspectorStreamId";
  private static readonly CREATED_AT_KEY = "AvoInspectorStreamIdCreatedAt";
  private static readonly LAST_ACTIVITY_KEY = "AvoInspectorStreamIdLastActivityAt";

  /**
   * Get the stream ID. If it doesn't exist or has expired, generates a new one.
   * Returns "unknown" if storage is not initialized.
   */
  static get streamId(): string {
    // Return cached value if available and not expired
    if (AvoStreamId._streamId !== null && !AvoStreamId.shouldReset()) {
      AvoStreamId.updateLastActivity();
      return AvoStreamId._streamId;
    }

    if (!AvoInspector.avoStorage.isInitialized()) {
      return "unknown";
    }

    // Load from storage
    AvoStreamId.loadFromStorage();

    // Check if we should reset
    if (AvoStreamId._streamId !== null && AvoStreamId.shouldReset()) {
      return AvoStreamId.generateAndStoreNew();
    }

    // If no ID exists, generate new one
    if (AvoStreamId._streamId === null) {
      return AvoStreamId.generateAndStoreNew();
    }

    // Update last activity and return existing
    AvoStreamId.updateLastActivity();
    return AvoStreamId._streamId;
  }

  /**
   * Check if the stream ID should be reset based on age and idle time.
   */
  private static shouldReset(): boolean {
    if (AvoStreamId._createdAt === null || AvoStreamId._lastActivityAt === null) {
      return false;
    }

    const now = Date.now();
    const age = now - AvoStreamId._createdAt;
    const idleTime = now - AvoStreamId._lastActivityAt;

    // Reset if older than 4 hours AND idle for 2+ hours
    return age > AvoStreamId.MAX_AGE_MS && idleTime > AvoStreamId.IDLE_THRESHOLD_MS;
  }

  /**
   * Load stream ID and timestamps from storage into cache.
   */
  private static loadFromStorage(): void {
    try {
      const storedId = AvoInspector.avoStorage.getItem<string>(AvoStreamId.STREAM_ID_KEY);
      const createdAt = AvoInspector.avoStorage.getItem<number>(AvoStreamId.CREATED_AT_KEY);
      const lastActivityAt = AvoInspector.avoStorage.getItem<number>(AvoStreamId.LAST_ACTIVITY_KEY);

      if (storedId !== null && storedId !== undefined) {
        AvoStreamId._streamId = storedId;
        AvoStreamId._createdAt = createdAt ?? Date.now();
        AvoStreamId._lastActivityAt = lastActivityAt ?? Date.now();
      }
    } catch (e) {
      console.error("Avo Inspector: Error reading stream ID from storage. Please report to support@avo.app.", e);
    }
  }

  /**
   * Generate a new stream ID and store it with timestamps.
   */
  private static generateAndStoreNew(): string {
    const now = Date.now();
    AvoStreamId._streamId = AvoGuid.newGuid();
    AvoStreamId._createdAt = now;
    AvoStreamId._lastActivityAt = now;

    try {
      AvoInspector.avoStorage.setItem(AvoStreamId.STREAM_ID_KEY, AvoStreamId._streamId);
      AvoInspector.avoStorage.setItem(AvoStreamId.CREATED_AT_KEY, AvoStreamId._createdAt);
      AvoInspector.avoStorage.setItem(AvoStreamId.LAST_ACTIVITY_KEY, AvoStreamId._lastActivityAt);
    } catch (e) {
      console.error("Avo Inspector: Error saving stream ID to storage. Please report to support@avo.app.", e);
    }

    return AvoStreamId._streamId;
  }

  /**
   * Update the last activity timestamp.
   */
  private static updateLastActivity(): void {
    const now = Date.now();
    AvoStreamId._lastActivityAt = now;

    try {
      AvoInspector.avoStorage.setItem(AvoStreamId.LAST_ACTIVITY_KEY, now);
    } catch (e) {
      // Silently fail - not critical
    }
  }

  /**
   * The storage key used to persist the stream ID.
   */
  static get storageKey(): string {
    return AvoStreamId.STREAM_ID_KEY;
  }

  /**
   * The storage key for created at timestamp.
   */
  static get createdAtKey(): string {
    return AvoStreamId.CREATED_AT_KEY;
  }

  /**
   * The storage key for last activity timestamp.
   */
  static get lastActivityKey(): string {
    return AvoStreamId.LAST_ACTIVITY_KEY;
  }

  /**
   * Clear the cached stream ID. The next access will reload from storage.
   * This is primarily useful for testing.
   */
  static clearCache(): void {
    AvoStreamId._streamId = null;
    AvoStreamId._createdAt = null;
    AvoStreamId._lastActivityAt = null;
  }
}
