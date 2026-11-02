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

  test("enableLogging(false) silences storage errors in the browser storage", () => {
    const inspector = build(AvoInspectorEnv.Dev);
    expect(inspector).toBeDefined();
    const storage = (AvoInspector as any).avoStorage.storageImpl;
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const hadWindow = "window" in global;
    const originalWindow = (global as any).window;
    (global as any).window = {
      localStorage: {
        getItem: () => {
          throw new Error("boom");
        },
      },
    };
    try {
      storage.useFallbackStorage = false;
      storage.getItem("k");
      expect(errorSpy).toHaveBeenCalled(); // positive control

      errorSpy.mockClear();
      inspector.enableLogging(false);
      storage.getItem("k");
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      if (hadWindow) {
        (global as any).window = originalWindow;
      } else {
        delete (global as any).window;
      }
      errorSpy.mockRestore();
    }
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
    triggerCacheHitLog(inspector);
    expect(logSpy).not.toHaveBeenCalled();
  });

  test("enableLogging(false) on one inspector silences the others immediately", () => {
    const first = build(AvoInspectorEnv.Dev);
    const second = build(AvoInspectorEnv.Dev);

    // Positive control: the second inspector's cache hit logs while logging is on.
    triggerCacheHitLog(second);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Cache hit"));

    // No fetchAndValidateEvent in between: the change must apply right away.
    first.enableLogging(false);
    logSpy.mockClear();
    second.eventSpecCache.get(apiKey, streamId, eventName);

    expect(logSpy).not.toHaveBeenCalled();
  });

  test("setting AvoInspector.shouldLog after construction reaches the cache", () => {
    const inspector = build(AvoInspectorEnv.Dev);

    AvoInspector.shouldLog = false;
    triggerCacheHitLog(inspector);
    expect(logSpy).not.toHaveBeenCalled();

    AvoInspector.shouldLog = true;
    triggerCacheHitLog(inspector);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Cache hit"));
  });

  test("the cache-hit log does not contain the API key", () => {
    const inspector = build(AvoInspectorEnv.Dev);

    triggerCacheHitLog(inspector);

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(eventName));
    expect(JSON.stringify(logSpy.mock.calls)).not.toContain(apiKey);
  });

  test("an explicit enableLogging(true) sticks for a later Prod inspector", () => {
    AvoInspector.shouldLog = true;

    const prod = build(AvoInspectorEnv.Prod);
    logSpy.mockClear();
    prod.trackSchemaFromEvent("evt", { a: 1 });

    expect(AvoInspector.shouldLog).toBe(true);
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Avo Inspector: supplied event")
    );
  });

  test("a Prod inspector stays silent when logging was never set explicitly", () => {
    const prod = build(AvoInspectorEnv.Prod);
    logSpy.mockClear();
    prod.trackSchemaFromEvent("evt", { a: 1 });

    expect(AvoInspector.shouldLog).toBe(false);
    expect(logSpy).not.toHaveBeenCalled();
  });

  describe("EventValidator warnings", () => {
    const validateInvalidRegex = async (): Promise<void> => {
      const { validateEvent } = jest.requireActual(
        "../eventSpec/EventValidator"
      );
      const spec = {
        events: [
          {
            branchId: "b",
            baseEventId: "e1",
            variantIds: [],
            props: {
              p: { regexPatterns: { "(a+)+$": ["e1"] } },
            },
          },
        ],
        metadata: { schemaId: "s", branchId: "b", latestActionId: "a" },
      };
      await validateEvent({ p: "aaaa" }, spec as any);
    };

    let warnSpy: jest.SpyInstance;
    beforeEach(() => {
      warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    });
    afterEach(() => warnSpy.mockRestore());

    test("an unsafe regex pattern warns when logging is on", async () => {
      AvoInspector.shouldLog = true;
      await validateInvalidRegex();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("unsafe regex pattern")
      );
    });

    test("an unsafe regex pattern does not warn when logging is off", async () => {
      AvoInspector.shouldLog = false;
      await validateInvalidRegex();
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  test("an explicit preference persists across instances", () => {
    const first = build(AvoInspectorEnv.Dev);
    first.enableLogging(false);

    build(AvoInspectorEnv.Dev);

    expect(AvoInspector.shouldLog).toBe(false);
  });
});
