import type { AvoInspector as AvoInspectorClass } from "../AvoInspector";
import type { EventSpecResponse } from "../eventSpec/AvoEventSpecFetchTypes";
import type { validateEvent as validateEventFn } from "../eventSpec/EventValidator";
import { AvoInspectorEnv } from "../AvoInspectorEnv";

/**
 * Regression tests for AVO-3079 (full build).
 *
 * `enableLogging(false)` / `AvoInspector.shouldLog = false` must silence every
 * non-error Inspector log, immediately and for every inspector instance on the
 * page. The sub-components (AvoStorage, EventSpecCache, AvoEventSpecFetcher)
 * read the one static flag live through a getter rather than caching a copy, so
 * there is a single source of truth.
 *
 * Assertions are observable (a cache hit that does or doesn't log; a storage
 * error that does or doesn't print; a validation warning that does or doesn't
 * fire) rather than reaching into private flags.
 */
describe("enableLogging – log suppression (AVO-3079)", () => {
  // Loaded fresh in beforeEach so each test starts from clean static state.
  let AvoInspector: typeof AvoInspectorClass;

  const apiKey = "api-key-xxx";
  const version = "1.0.0";
  const streamId = "stream-1";
  const eventName = "test_event";

  // A spec with a min/max constraint, so a NaN value hits the validator's
  // "NaN value fails min/max constraint" warning (gated on shouldLog).
  const minMaxSpec: EventSpecResponse = {
    events: [
      {
        branchId: "main",
        baseEventId: "evt_test",
        variantIds: [],
        props: {
          amount: {
            type: "number",
            required: false,
            minMaxRanges: { "0,100": ["evt_test"] }
          }
        }
      }
    ],
    metadata: { schemaId: "s", branchId: "main", latestActionId: "a" }
  };

  const build = (env: string): any =>
    new AvoInspector({
      apiKey,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      env: env as any,
      version
    });

  // Populates then reads the inspector's cache, asserting whether the cache-hit
  // line was logged. Console spy is cleared right before the read.
  const expectCacheHitLogged = (inspector: any, logged: boolean): void => {
    const cache = inspector.eventSpecCache;
    expect(cache).toBeDefined();
    cache.set(apiKey, streamId, eventName, null);
    (console.log as jest.Mock).mockClear();
    cache.get(apiKey, streamId, eventName);
    if (logged) {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Cache hit")
      );
      // The api key must never appear in the hit line — it prints on every
      // cache hit in dev/staging. Without this, putting the key back would
      // still pass the "Cache hit" assertion above. See AVO-3079 review.
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining(apiKey)
      );
    } else {
      expect(console.log).not.toHaveBeenCalled();
    }
  };

  beforeEach(() => {
    jest.resetModules();
    AvoInspector = jest.requireActual<{
      AvoInspector: typeof AvoInspectorClass;
    }>("../AvoInspector").AvoInspector;
    (console.log as jest.Mock).mockClear();
    (console.warn as jest.Mock).mockClear();
    (console.error as jest.Mock).mockClear();
  });

  test("dev logs are on by default (positive control)", () => {
    expectCacheHitLogged(build(AvoInspectorEnv.Dev), true);
  });

  test("prod logs are off by default", () => {
    expectCacheHitLogged(build(AvoInspectorEnv.Prod), false);
  });

  test("enableLogging(false) silences the cache in dev", () => {
    const inspector = build(AvoInspectorEnv.Dev);
    inspector.enableLogging(false);
    expectCacheHitLogged(inspector, false);
  });

  test("enableLogging(true) enables the cache log in prod", () => {
    const inspector = build(AvoInspectorEnv.Prod);
    inspector.enableLogging(true);
    expectCacheHitLogged(inspector, true);
  });

  test("constructor does not clobber a logging preference set beforehand", () => {
    AvoInspector.shouldLog = false;
    expectCacheHitLogged(build(AvoInspectorEnv.Dev), false);
  });

  test("an explicit enableLogging(true) survives a later prod construction (sticky; BREAKING vs 3.x)", () => {
    // A leftover debug opt-in from an earlier inspector/session.
    build(AvoInspectorEnv.Dev).enableLogging(true);
    // 3.x reset the flag to the environment default on every construction; now
    // it sticks, so a prod inspector constructed afterwards keeps logging on.
    // This is the leftover-enableLogging(true) case the migration note warns
    // about, and the direction the CHANGELOG headlines as BREAKING.
    expectCacheHitLogged(build(AvoInspectorEnv.Prod), true);
  });

  test("enableLogging(false) on one instance silences another instance's cache", () => {
    const a = build(AvoInspectorEnv.Dev);
    const b = build(AvoInspectorEnv.Dev);

    a.enableLogging(false);

    // b never had enableLogging called, but its cache reads the shared static
    // flag live, so it is silenced too.
    expectCacheHitLogged(b, false);
    expectCacheHitLogged(a, false);
  });

  test("AvoInspector.shouldLog = false after construction silences the cache", () => {
    const inspector = build(AvoInspectorEnv.Dev);
    AvoInspector.shouldLog = false;
    expectCacheHitLogged(inspector, false);
  });

  test("enableLogging toggles AvoStorage error logs live", () => {
    const inspector = build(AvoInspectorEnv.Dev);

    // Storage was initialised with a working localStorage; make writes throw now.
    const setItemSpy = jest
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });

    try {
      (console.error as jest.Mock).mockClear();
      AvoInspector.avoStorage.setItem("k", "v");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("setItem error"),
        expect.anything()
      );

      inspector.enableLogging(false);
      (console.error as jest.Mock).mockClear();
      AvoInspector.avoStorage.setItem("k", "v");
      expect(console.error).not.toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
    }
  });

  test("enableLogging(false) silences validation warnings (gated console.warn)", () => {
    const { validateEvent } = jest.requireActual<{
      validateEvent: typeof validateEventFn;
    }>("../eventSpec/EventValidator");

    AvoInspector.shouldLog = true;
    (console.warn as jest.Mock).mockClear();
    validateEvent({ amount: NaN }, minMaxSpec);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining("NaN value fails min/max")
    );

    AvoInspector.shouldLog = false;
    (console.warn as jest.Mock).mockClear();
    validateEvent({ amount: NaN }, minMaxSpec);
    expect(console.warn).not.toHaveBeenCalled();
  });

  // The constructor's environment misconfiguration warnings are deliberately
  // NOT gated on the logging flag: disabling logging must not hide a
  // misconfiguration. These are the always-printed messages the CHANGELOG
  // headlines; the "something went wrong" family is pinned (with logging off,
  // on Prod defaults) in UnboundPublicMethods_test.ts. See AVO-3079.
  test.each([
    ["missing", "", "No environment provided"],
    ["unsupported", "bogus", "Unsupported environment"]
  ])(
    "a %s environment still warns with enableLogging(false)",
    (_label, env, message) => {
      AvoInspector.shouldLog = false;
      (console.warn as jest.Mock).mockClear();
      build(env);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining(message)
      );
    }
  );
});
