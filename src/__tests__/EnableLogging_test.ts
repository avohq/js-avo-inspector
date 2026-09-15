import type { AvoInspector as AvoInspectorClass } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";

/**
 * Regression tests for AVO-3079.
 *
 * `enableLogging(false)` must actually silence Inspector's dev logging. The
 * constructor used to hardcode logging ON for the Dev environment and then
 * hand that snapshot value to AvoStorage / EventSpecCache / AvoEventSpecFetcher,
 * so a later `enableLogging(false)` never reached those sub-components and dev
 * log noise kept printing.
 *
 * These tests exercise the sub-component that actually logs on the happy path
 * (EventSpecCache logs "Cache hit for key" on every hit when logging is on),
 * plus the propagated flags, to prove the toggle now takes effect end to end.
 */
describe("enableLogging – dev log suppression (AVO-3079)", () => {
  // Loaded fresh in beforeEach so each test starts from clean static state.
  let AvoInspector: typeof AvoInspectorClass;

  const apiKey = "api-key-xxx";
  const version = "1.0.0";
  const streamId = "stream-1";
  const eventName = "test_event";

  const build = (env: string): any =>
    new AvoInspector({
      apiKey,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      env: env as any,
      version
    });

  // Populates the cache then reads it back, clearing the console spy right
  // before the read so only the cache-hit log (if any) is captured.
  const triggerCacheHitLog = (inspector: any): void => {
    const cache = inspector.eventSpecCache;
    expect(cache).toBeDefined();
    cache.set(apiKey, streamId, eventName, null);
    (console.log as jest.Mock).mockClear();
    cache.get(apiKey, streamId, eventName);
  };

  beforeEach(() => {
    jest.resetModules();
    // requireActual (not a bare require) after resetModules gives a freshly
    // evaluated module, and keeps the file lint-clean (no-var-requires).
    AvoInspector = jest.requireActual<{
      AvoInspector: typeof AvoInspectorClass;
    }>("../AvoInspector").AvoInspector;
    (console.log as jest.Mock).mockClear();
  });

  test("dev logs are on by default (regression guard)", () => {
    const inspector = build(AvoInspectorEnv.Dev);

    triggerCacheHitLog(inspector);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Cache hit")
    );
  });

  test("prod logs are off by default (regression guard)", () => {
    const inspector = build(AvoInspectorEnv.Prod);

    triggerCacheHitLog(inspector);

    expect(console.log).not.toHaveBeenCalled();
  });

  test("enableLogging(false) silences EventSpecCache logs in dev", () => {
    const inspector = build(AvoInspectorEnv.Dev);

    inspector.enableLogging(false);
    triggerCacheHitLog(inspector);

    expect(console.log).not.toHaveBeenCalled();
  });

  test("enableLogging(false) propagates to storage, cache and fetcher in dev", () => {
    const inspector = build(AvoInspectorEnv.Dev);

    inspector.enableLogging(false);

    expect(AvoInspector.shouldLog).toBe(false);
    expect(inspector.eventSpecCache.shouldLog).toBe(false);
    expect(inspector.eventSpecFetcher.shouldLog).toBe(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((AvoInspector.avoStorage.storageImpl as any).shouldLog).toBe(false);
  });

  test("enableLogging(true) propagates to the cache in prod", () => {
    const inspector = build(AvoInspectorEnv.Prod);

    inspector.enableLogging(true);
    triggerCacheHitLog(inspector);

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("Cache hit")
    );
  });

  test("constructor does not clobber a logging preference set beforehand", () => {
    // Opt out of logging before constructing a Dev inspector.
    AvoInspector.shouldLog = false;

    const inspector = build(AvoInspectorEnv.Dev);

    // The Dev branch of the constructor must not force logging back on.
    expect(AvoInspector.shouldLog).toBe(false);
    triggerCacheHitLog(inspector);
    expect(console.log).not.toHaveBeenCalled();
  });
});
