import { AvoStreamId } from "../AvoStreamId";
import { AvoInspector } from "../AvoInspector";

import { defaultOptions } from "../__tests__/constants";

describe("StreamId", () => {
  beforeAll(() => {
    new AvoInspector(defaultOptions);
  });

  afterEach(() => {
    // Clear the cache and storage after each test to ensure clean state
    AvoStreamId.clearCache();
    AvoInspector.avoStorage.removeItem(AvoStreamId.storageKey);
    AvoInspector.avoStorage.removeItem(AvoStreamId.createdAtKey);
    AvoInspector.avoStorage.removeItem(AvoStreamId.lastActivityKey);
  });

  test("storageKey equal to \"AvoInspectorStreamId\"", () => {
    expect(AvoStreamId.storageKey).toEqual("AvoInspectorStreamId");
  });

  test("createdAtKey equal to \"AvoInspectorStreamIdCreatedAt\"", () => {
    expect(AvoStreamId.createdAtKey).toEqual("AvoInspectorStreamIdCreatedAt");
  });

  test("lastActivityKey equal to \"AvoInspectorStreamIdLastActivityAt\"", () => {
    expect(AvoStreamId.lastActivityKey).toEqual("AvoInspectorStreamIdLastActivityAt");
  });

  test("Sets streamId on first access", () => {
    // Given

    // When
    const streamId = AvoStreamId.streamId;

    // Then
    expect(streamId).not.toBeNull();
    expect(streamId).not.toBe("unknown");
  });

  test("Creates stream id if not present in storage", () => {
    // Given
    AvoInspector.avoStorage.removeItem(AvoStreamId.storageKey);
    AvoStreamId.clearCache();

    // When
    const streamId = AvoStreamId.streamId;

    // Then
    expect(streamId).not.toBeNull();
    expect(streamId).not.toBe("unknown");
  });

  test("Reuses stream id if present in storage and not expired", (done) => {
    // Given
    const testId = "test-stream-id-12345";
    const now = Date.now();

    AvoInspector.avoStorage.setItem(AvoStreamId.storageKey, testId);
    AvoInspector.avoStorage.setItem(AvoStreamId.createdAtKey, now);
    AvoInspector.avoStorage.setItem(AvoStreamId.lastActivityKey, now);

    // Wait for storage operation to complete
    AvoInspector.avoStorage.runAfterInit(() => {
      AvoStreamId.clearCache();

      // When
      const streamId = AvoStreamId.streamId;

      // Then
      expect(streamId).toBe(testId);
      done();
    });
  });

  test("Persists stream id across multiple accesses", () => {
    // Given
    AvoInspector.avoStorage.removeItem(AvoStreamId.storageKey);
    AvoStreamId.clearCache();

    // When
    const firstAccess = AvoStreamId.streamId;
    const secondAccess = AvoStreamId.streamId;

    // Then
    expect(firstAccess).toBe(secondAccess);
  });

  test("Persists stream id to storage", async () => {
    // Given
    AvoInspector.avoStorage.removeItem(AvoStreamId.storageKey);
    AvoStreamId.clearCache();

    // When
    const streamId = AvoStreamId.streamId;

    // Wait a bit for async storage to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    const storedId = AvoInspector.avoStorage.getItem<string>(AvoStreamId.storageKey);

    // Then
    expect(storedId).toBe(streamId);
  });

  test("Stores timestamps when generating new stream id", async () => {
    // Given
    AvoInspector.avoStorage.removeItem(AvoStreamId.storageKey);
    AvoStreamId.clearCache();
    const beforeTime = Date.now();

    // When
    AvoStreamId.streamId;

    // Wait a bit for async storage to complete
    await new Promise(resolve => setTimeout(resolve, 10));

    const createdAt = AvoInspector.avoStorage.getItem<number>(AvoStreamId.createdAtKey);
    const lastActivityAt = AvoInspector.avoStorage.getItem<number>(AvoStreamId.lastActivityKey);
    const afterTime = Date.now();

    // Then
    expect(createdAt).toBeGreaterThanOrEqual(beforeTime);
    expect(createdAt).toBeLessThanOrEqual(afterTime);
    expect(lastActivityAt).toBeGreaterThanOrEqual(beforeTime);
    expect(lastActivityAt).toBeLessThanOrEqual(afterTime);
  });

  test("Loads stream id from storage after cache clear", (done) => {
    // Given - First access creates and stores an ID
    AvoInspector.avoStorage.removeItem(AvoStreamId.storageKey);
    AvoStreamId.clearCache();
    const firstId = AvoStreamId.streamId;

    // Wait for storage write to complete
    AvoInspector.avoStorage.runAfterInit(() => {
      // When - Clear cache and access again
      AvoStreamId.clearCache();
      const secondId = AvoStreamId.streamId;

      // Then - Should load the same ID from storage
      expect(secondId).toBe(firstId);
      done();
    });
  });

  describe("Ephemeral Reset Logic", () => {
    // Constants matching the implementation
    const MAX_AGE_MS = 4 * 60 * 60 * 1000; // 4 hours
    const IDLE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

    test("Does NOT reset if created less than 4 hours ago (even if idle 2+ hours)", (done) => {
      // Given - ID created 3 hours ago, idle for 2.5 hours
      const testId = "test-stream-id-not-old-enough";
      const now = Date.now();
      const createdAt = now - (3 * 60 * 60 * 1000); // 3 hours ago
      const lastActivityAt = now - (2.5 * 60 * 60 * 1000); // 2.5 hours ago (idle)

      AvoInspector.avoStorage.setItem(AvoStreamId.storageKey, testId);
      AvoInspector.avoStorage.setItem(AvoStreamId.createdAtKey, createdAt);
      AvoInspector.avoStorage.setItem(AvoStreamId.lastActivityKey, lastActivityAt);

      AvoInspector.avoStorage.runAfterInit(() => {
        AvoStreamId.clearCache();

        // When
        const streamId = AvoStreamId.streamId;

        // Then - Should NOT reset because not old enough
        expect(streamId).toBe(testId);
        done();
      });
    });

    test("Does NOT reset if idle less than 2 hours (even if 4+ hours old)", (done) => {
      // Given - ID created 5 hours ago, but active 1 hour ago
      const testId = "test-stream-id-not-idle-enough";
      const now = Date.now();
      const createdAt = now - (5 * 60 * 60 * 1000); // 5 hours ago
      const lastActivityAt = now - (1 * 60 * 60 * 1000); // 1 hour ago (recent activity)

      AvoInspector.avoStorage.setItem(AvoStreamId.storageKey, testId);
      AvoInspector.avoStorage.setItem(AvoStreamId.createdAtKey, createdAt);
      AvoInspector.avoStorage.setItem(AvoStreamId.lastActivityKey, lastActivityAt);

      AvoInspector.avoStorage.runAfterInit(() => {
        AvoStreamId.clearCache();

        // When
        const streamId = AvoStreamId.streamId;

        // Then - Should NOT reset because not idle enough
        expect(streamId).toBe(testId);
        done();
      });
    });

    test("Resets if 4+ hours old AND idle for 2+ hours", (done) => {
      // Given - ID created 5 hours ago, idle for 3 hours
      const testId = "test-stream-id-should-reset";
      const now = Date.now();
      const createdAt = now - (5 * 60 * 60 * 1000); // 5 hours ago
      const lastActivityAt = now - (3 * 60 * 60 * 1000); // 3 hours ago (idle)

      AvoInspector.avoStorage.setItem(AvoStreamId.storageKey, testId);
      AvoInspector.avoStorage.setItem(AvoStreamId.createdAtKey, createdAt);
      AvoInspector.avoStorage.setItem(AvoStreamId.lastActivityKey, lastActivityAt);

      AvoInspector.avoStorage.runAfterInit(() => {
        AvoStreamId.clearCache();

        // When
        const streamId = AvoStreamId.streamId;

        // Then - Should reset to a new ID
        expect(streamId).not.toBe(testId);
        expect(streamId).not.toBe("unknown");
        done();
      });
    });

    test("Updates lastActivityAt on each access (non-expired)", async () => {
      // Given - Fresh ID
      AvoInspector.avoStorage.removeItem(AvoStreamId.storageKey);
      AvoStreamId.clearCache();

      // First access
      AvoStreamId.streamId;
      await new Promise(resolve => setTimeout(resolve, 10));

      const firstActivityAt = AvoInspector.avoStorage.getItem<number>(AvoStreamId.lastActivityKey);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 50));

      // Second access
      AvoStreamId.streamId;
      await new Promise(resolve => setTimeout(resolve, 10));

      const secondActivityAt = AvoInspector.avoStorage.getItem<number>(AvoStreamId.lastActivityKey);

      // Then - lastActivityAt should have been updated
      expect(secondActivityAt).toBeGreaterThan(firstActivityAt!);
    });

    test("Resets timestamps when generating new ID after expiry", (done) => {
      // Given - Expired ID
      const testId = "test-stream-id-expired";
      const now = Date.now();
      const oldCreatedAt = now - (5 * 60 * 60 * 1000); // 5 hours ago
      const oldLastActivityAt = now - (3 * 60 * 60 * 1000); // 3 hours ago

      AvoInspector.avoStorage.setItem(AvoStreamId.storageKey, testId);
      AvoInspector.avoStorage.setItem(AvoStreamId.createdAtKey, oldCreatedAt);
      AvoInspector.avoStorage.setItem(AvoStreamId.lastActivityKey, oldLastActivityAt);

      AvoInspector.avoStorage.runAfterInit(() => {
        AvoStreamId.clearCache();
        const beforeReset = Date.now();

        // When - Access triggers reset
        AvoStreamId.streamId;

        // Wait for storage
        setTimeout(() => {
          const newCreatedAt = AvoInspector.avoStorage.getItem<number>(AvoStreamId.createdAtKey);
          const newLastActivityAt = AvoInspector.avoStorage.getItem<number>(AvoStreamId.lastActivityKey);

          // Then - Timestamps should be fresh
          expect(newCreatedAt).toBeGreaterThanOrEqual(beforeReset);
          expect(newLastActivityAt).toBeGreaterThanOrEqual(beforeReset);
          done();
        }, 10);
      });
    });
  });
});
