import { AvoStreamId } from "../AvoStreamId";
import { AvoStorage } from "../AvoStorage";
import { AvoInspector } from "../AvoInspector";

import { defaultOptions } from "../__tests__/constants";

describe("StreamId", () => {
  const storage = new AvoStorage(defaultOptions.shouldLog);

  beforeAll(() => {
    new AvoInspector(defaultOptions);
  });

  beforeEach(() => {
    // Reset the cached anonymousId between tests
    (AvoStreamId as any)._anonymousId = null;
    (AvoStreamId as any)._initializationPromise = null;
  });

  afterEach(() => {
    storage.removeItem(AvoStreamId.cacheKey);
    (AvoStreamId as any)._anonymousId = null;
    (AvoStreamId as any)._initializationPromise = null;
  });

  test(`cacheKey equal to "AvoInspectorAnonymousId"`, () => {
    expect(AvoStreamId.cacheKey).toEqual("AvoInspectorAnonymousId");
  });

  test("Returns a UUID after initialize()", async () => {
    const id = await AvoStreamId.initialize();

    expect(id).not.toBeNull();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  test("Persists the same UUID across multiple initialize() calls", async () => {
    const id1 = await AvoStreamId.initialize();

    // Reset in-memory cache to force re-read from storage
    (AvoStreamId as any)._anonymousId = null;
    (AvoStreamId as any)._initializationPromise = null;

    const id2 = await AvoStreamId.initialize();

    expect(id1).toBe(id2);
  });

  test("Returns cached value on second call without re-reading storage", async () => {
    const id1 = await AvoStreamId.initialize();
    const id2 = await AvoStreamId.initialize();

    expect(id1).toBe(id2);
  });

  test("Concurrent calls before cache populated all return same UUID (promise lock)", async () => {
    // Reset cache to force concurrent initialization
    (AvoStreamId as any)._anonymousId = null;
    (AvoStreamId as any)._initializationPromise = null;

    // Fire multiple concurrent calls
    const [id1, id2, id3] = await Promise.all([
      AvoStreamId.initialize(),
      AvoStreamId.initialize(),
      AvoStreamId.initialize(),
    ]);

    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
  });

  test("UUID never resets - calling initialize again returns same value", async () => {
    const id1 = await AvoStreamId.initialize();

    // Simulate time passing / multiple app restarts by clearing memory cache
    (AvoStreamId as any)._anonymousId = null;
    (AvoStreamId as any)._initializationPromise = null;

    const id2 = await AvoStreamId.initialize();
    (AvoStreamId as any)._anonymousId = null;
    (AvoStreamId as any)._initializationPromise = null;

    const id3 = await AvoStreamId.initialize();

    expect(id1).toBe(id2);
    expect(id2).toBe(id3);
  });
});
