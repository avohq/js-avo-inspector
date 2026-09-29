import type { AvoInspectorLite as AvoInspectorLiteClass } from "../lite/AvoInspectorLite";
import { AvoInspectorEnv } from "../AvoInspectorEnv";

/**
 * Regression tests for AVO-3079 in the lite build.
 *
 * `AvoInspectorLite` had the same bug as the full build: the constructor
 * hardcoded logging ON for the Dev environment (clobbering an explicit opt-out)
 * and handed that snapshot to `AvoStorage`, so a later `enableLogging(false)`
 * left storage's captured `true` in place and its dev error logs kept printing.
 *
 * The lite build has no EventSpecCache / AvoEventSpecFetcher, so `AvoStorage` is
 * the only sub-component to propagate to. `extractSchema` gives a network-free
 * observable log gated on the shared `shouldLog` flag for the positive control.
 */
describe("AvoInspectorLite enableLogging – dev log suppression (AVO-3079)", () => {
  // Loaded fresh in beforeEach so each test starts from clean static state.
  let AvoInspectorLite: typeof AvoInspectorLiteClass;

  const apiKey = "api-key-xxx";
  const version = "1.0.0";

  const build = (env: string): any =>
    new AvoInspectorLite({
      apiKey,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      env: env as any,
      version
    });

  const storageShouldLog = (): boolean =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (AvoInspectorLite.avoStorage.storageImpl as any).shouldLog;

  beforeEach(() => {
    jest.resetModules();
    AvoInspectorLite = jest.requireActual<{
      AvoInspectorLite: typeof AvoInspectorLiteClass;
    }>("../lite/AvoInspectorLite").AvoInspectorLite;
    (console.log as jest.Mock).mockClear();
  });

  test("dev logs are on by default and fire when enabled (positive control)", async () => {
    const inspector = build(AvoInspectorEnv.Dev);

    expect(AvoInspectorLite.shouldLog).toBe(true);
    expect(storageShouldLog()).toBe(true);

    (console.log as jest.Mock).mockClear();
    await inspector.extractSchema({ prop: 1 });

    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining("extracting schema")
    );
  });

  test("prod logs are off by default (regression guard)", async () => {
    const inspector = build(AvoInspectorEnv.Prod);

    expect(AvoInspectorLite.shouldLog).toBe(false);
    expect(storageShouldLog()).toBe(false);

    (console.log as jest.Mock).mockClear();
    await inspector.extractSchema({ prop: 1 });

    expect(console.log).not.toHaveBeenCalled();
  });

  test("enableLogging(false) silences logs and propagates to storage in dev", async () => {
    const inspector = build(AvoInspectorEnv.Dev);

    inspector.enableLogging(false);

    expect(AvoInspectorLite.shouldLog).toBe(false);
    // Without the propagation fix, AvoStorage keeps the `true` it was
    // constructed with and its dev error logs keep printing.
    expect(storageShouldLog()).toBe(false);

    (console.log as jest.Mock).mockClear();
    await inspector.extractSchema({ prop: 1 });
    expect(console.log).not.toHaveBeenCalled();
  });

  test("enableLogging(true) propagates to storage in prod", () => {
    const inspector = build(AvoInspectorEnv.Prod);

    inspector.enableLogging(true);

    expect(AvoInspectorLite.shouldLog).toBe(true);
    expect(storageShouldLog()).toBe(true);
  });

  test("constructor does not clobber a logging preference set beforehand", async () => {
    // Opt out of logging before constructing a Dev inspector.
    AvoInspectorLite.shouldLog = false;

    const inspector = build(AvoInspectorEnv.Dev);

    // The Dev branch of the constructor must not force logging back on...
    expect(AvoInspectorLite.shouldLog).toBe(false);
    // ...and AvoStorage must be constructed with the opted-out value.
    expect(storageShouldLog()).toBe(false);

    (console.log as jest.Mock).mockClear();
    await inspector.extractSchema({ prop: 1 });
    expect(console.log).not.toHaveBeenCalled();
  });
});
