import { AvoAnonymousId } from "../AvoAnonymousId";
import { AvoInspector } from "../AvoInspector";

import { defaultOptions } from "../__tests__/constants";

describe("AnonymousId", () => {
  beforeAll(() => {
    new AvoInspector(defaultOptions);
  });

  afterEach(() => {
    // Clear the cache after each test to ensure clean state
    AvoAnonymousId.clearCache();
  });

  test("storageKey equal to \"AvoInspectorAnonymousId\"", () => {
    expect(AvoAnonymousId.storageKey).toEqual("AvoInspectorAnonymousId");
  });

  test("Sets anonymousId on first access", () => {
    // Given

    // When
    const anonymousId = AvoAnonymousId.anonymousId;

    // Then
    expect(anonymousId).not.toBeNull();
    expect(anonymousId).not.toBe("unknown");
  });

  test("Creates anonymous id if not present in storage", () => {
    // Given
    AvoInspector.avoStorage.removeItem(AvoAnonymousId.storageKey);
    AvoAnonymousId.clearCache();

    // When
    const anonymousId = AvoAnonymousId.anonymousId;

    // Then
    expect(anonymousId).not.toBeNull();
    expect(anonymousId).not.toBe("unknown");
  });

  test("Reuses anonymous id if present in storage", (done) => {
    // Given
    const testId = "test-anonymous-id-12345";

    AvoInspector.avoStorage.setItem(AvoAnonymousId.storageKey, testId);

    // Wait for storage operation to complete
    AvoInspector.avoStorage.runAfterInit(() => {
      AvoAnonymousId.clearCache();

      // When
      const anonymousId = AvoAnonymousId.anonymousId;

      // Then
      expect(anonymousId).toBe(testId);
      done();
    });
  });

  test("Persists anonymous id across multiple accesses", () => {
    // Given
    AvoInspector.avoStorage.removeItem(AvoAnonymousId.storageKey);
    AvoAnonymousId.clearCache();

    // When
    const firstAccess = AvoAnonymousId.anonymousId;
    const secondAccess = AvoAnonymousId.anonymousId;

    // Then
    expect(firstAccess).toBe(secondAccess);
  });

  test("Persists anonymous id to storage", async () => {
    // Given
    AvoInspector.avoStorage.removeItem(AvoAnonymousId.storageKey);
    AvoAnonymousId.clearCache();

    // When
    const anonymousId = AvoAnonymousId.anonymousId;
    
    // Wait a bit for async storage to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    const storedId = AvoInspector.avoStorage.getItem<string>(AvoAnonymousId.storageKey);

    // Then
    expect(storedId).toBe(anonymousId);
  });

  test("Loads anonymous id from storage after cache clear", (done) => {
    // Given - First access creates and stores an ID
    AvoInspector.avoStorage.removeItem(AvoAnonymousId.storageKey);
    AvoAnonymousId.clearCache();
    const firstId = AvoAnonymousId.anonymousId;
    
    // Wait for storage write to complete
    AvoInspector.avoStorage.runAfterInit(() => {
      // When - Clear cache and access again
      AvoAnonymousId.clearCache();
      const secondId = AvoAnonymousId.anonymousId;

      // Then - Should load the same ID from storage
      expect(secondId).toBe(firstId);
      done();
    });
  });
});

