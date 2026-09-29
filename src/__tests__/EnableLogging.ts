import type { AvoInspector as AvoInspectorClass } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";

/**
 * Regression tests for AVO-3848 (React Native port of AVO-3079).
 *
 * `enableLogging(false)` and a pre-construction `AvoInspector.shouldLog = false`
 * must silence Inspector's dev logging. The constructor used to force logging
 * on for Dev and hand that snapshot to AvoStorage / EventSpecCache /
 * AvoEventSpecFetcher, so a later `enableLogging(false)` never reached them.
 *
 * EventSpecCache logs "Cache hit for key" on every hit when logging is on, so
 * it is used to prove the toggle takes effect end to end.
 */
describe("enableLogging – dev log suppression", () => {
  // Loaded fresh in beforeEach so each test starts from clean static state.
  let AvoInspector: typeof AvoInspectorClass;
  let logSpy: jest.SpyInstance;

  const apiKey = "api-key-xxx";
  const version = "1.0.0";
  const streamId = "stream-1";
  const eventName = "test_event";

  const build = (env: string): any =>
    new AvoInspector({
      apiKey,
      env: env as any,
      version,
    });

  // Populates the cache then reads it back, clearing the console spy right
  // before the read so only the cache-hit log (if any) is captured.
  const triggerCacheHitLog = (inspector: any): void => {
    const cache = inspector.eventSpecCache;
    expect(cache).toBeDefined();
    cache.set(apiKey, streamId, eventName, null);
    logSpy.mockClear();
    cache.get(apiKey, streamId, eventName);
  };

  beforeEach(() => {
    jest.resetModules();
    AvoInspector = jest.requireActual<{
      AvoInspector: typeof AvoInspectorClass;
    }>("../AvoInspector").AvoInspector;
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test("dev logs are on by default", () => {
    const inspector = build(AvoInspectorEnv.Dev);

    expect(AvoInspector.shouldLog).toBe(true);
    triggerCacheHitLog(inspector);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Cache hit"));
  });

  test("staging logs are off by default", () => {
    const inspector = build(AvoInspectorEnv.Staging);

    expect(AvoInspector.shouldLog).toBe(false);
    triggerCacheHitLog(inspector);

    expect(logSpy).not.toHaveBeenCalled();
  });

  test("prod logs are off by default", () => {
    build(AvoInspectorEnv.Prod);

    expect(AvoInspector.shouldLog).toBe(false);
  });

  test("enableLogging(false) silences EventSpecCache logs in dev", () => {
    const inspector = build(AvoInspectorEnv.Dev);

    inspector.enableLogging(false);
    triggerCacheHitLog(inspector);

    expect(logSpy).not.toHaveBeenCalled();
  });

  test("enableLogging(false) propagates to storage, cache and fetcher in dev", () => {
    const inspector = build(AvoInspectorEnv.Dev);

    inspector.enableLogging(false);

    expect(AvoInspector.shouldLog).toBe(false);
    expect(inspector.eventSpecCache.shouldLog).toBe(false);
    expect(inspector.eventSpecFetcher.shouldLog).toBe(false);
    expect((AvoInspector.avoStorage.storageImpl as any).shouldLog).toBe(false);
  });

  test("enableLogging(true) propagates to the cache in staging", () => {
    const inspector = build(AvoInspectorEnv.Staging);

    inspector.enableLogging(true);
    triggerCacheHitLog(inspector);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Cache hit"));
  });

  test("enableLogging() does not throw in prod, where there is no cache or fetcher", () => {
    const inspector = build(AvoInspectorEnv.Prod);

    expect(() => inspector.enableLogging(true)).not.toThrow();
    expect(AvoInspector.shouldLog).toBe(true);
  });

  test("constructor does not overwrite a logging preference set beforehand", () => {
    AvoInspector.shouldLog = false;

    const inspector = build(AvoInspectorEnv.Dev);

    expect(AvoInspector.shouldLog).toBe(false);
    expect((AvoInspector.avoStorage.storageImpl as any).shouldLog).toBe(false);
    triggerCacheHitLog(inspector);
    expect(logSpy).not.toHaveBeenCalled();
  });

  // Goes through the inspector's validation path, which is where the event
  // spec cache is used in practice: pre-populates the cache so the lookup is a
  // hit, then clears the spy so only the cache-hit log (if any) is captured.
  const validateWithCacheHit = async (inspector: any): Promise<void> => {
    inspector.streamId = streamId;
    inspector.eventSpecCache.set(apiKey, streamId, eventName, null);
    logSpy.mockClear();
    await inspector.fetchAndValidateEvent(eventName, {});
  };

  test("enableLogging(false) on one inspector silences the others", async () => {
    const first = build(AvoInspectorEnv.Dev);
    const second = build(AvoInspectorEnv.Dev);

    first.enableLogging(false);
    await validateWithCacheHit(second);

    expect(logSpy).not.toHaveBeenCalled();
    expect(second.eventSpecFetcher.shouldLog).toBe(false);
  });

  test("setting AvoInspector.shouldLog after construction reaches the cache", async () => {
    const inspector = build(AvoInspectorEnv.Dev);

    AvoInspector.shouldLog = false;
    await validateWithCacheHit(inspector);
    expect(logSpy).not.toHaveBeenCalled();

    AvoInspector.shouldLog = true;
    await validateWithCacheHit(inspector);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Cache hit"));
  });

  test("an explicit preference persists across instances", () => {
    const first = build(AvoInspectorEnv.Dev);
    first.enableLogging(false);

    build(AvoInspectorEnv.Dev);

    expect(AvoInspector.shouldLog).toBe(false);
  });
});
