import type { AvoInspectorLite as AvoInspectorLiteClass } from "../lite/AvoInspectorLite";
import { AvoInspectorEnv } from "../AvoInspectorEnv";

/**
 * Regression tests for AVO-3079 in the lite build.
 *
 * The lite build has no EventSpecCache / AvoEventSpecFetcher, so `AvoStorage`
 * (which reads the static flag live through a getter) is the sub-component that
 * matters. `extractSchema` gives a network-free observable log gated on the
 * shared `shouldLog` flag. Assertions are observable rather than on private
 * fields.
 */
describe("AvoInspectorLite enableLogging – log suppression (AVO-3079)", () => {
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

  // extractSchema logs "extracting schema from ..." iff logging is on, and
  // touches no network/storage, so it is a clean observable.
  const expectSchemaLogged = async (
    inspector: any,
    logged: boolean
  ): Promise<void> => {
    (console.log as jest.Mock).mockClear();
    await inspector.extractSchema({ prop: 1 });
    if (logged) {
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("extracting schema")
      );
    } else {
      expect(console.log).not.toHaveBeenCalled();
    }
  };

  beforeEach(() => {
    jest.resetModules();
    AvoInspectorLite = jest.requireActual<{
      AvoInspectorLite: typeof AvoInspectorLiteClass;
    }>("../lite/AvoInspectorLite").AvoInspectorLite;
    (console.log as jest.Mock).mockClear();
    (console.error as jest.Mock).mockClear();
  });

  test("dev logs are on by default (positive control)", async () => {
    await expectSchemaLogged(build(AvoInspectorEnv.Dev), true);
  });

  test("prod logs are off by default", async () => {
    await expectSchemaLogged(build(AvoInspectorEnv.Prod), false);
  });

  test("enableLogging(false) silences logs in dev", async () => {
    const inspector = build(AvoInspectorEnv.Dev);
    inspector.enableLogging(false);
    await expectSchemaLogged(inspector, false);
  });

  test("enableLogging(true) enables logs in prod", async () => {
    const inspector = build(AvoInspectorEnv.Prod);
    inspector.enableLogging(true);
    await expectSchemaLogged(inspector, true);
  });

  test("constructor does not clobber a logging preference set beforehand", async () => {
    AvoInspectorLite.shouldLog = false;
    await expectSchemaLogged(build(AvoInspectorEnv.Dev), false);
  });

  test("AvoInspectorLite.shouldLog toggles AvoStorage error logs live", () => {
    const inspector = build(AvoInspectorEnv.Dev);

    const setItemSpy = jest
      .spyOn(window.localStorage, "setItem")
      .mockImplementation(() => {
        throw new Error("quota exceeded");
      });

    try {
      (console.error as jest.Mock).mockClear();
      AvoInspectorLite.avoStorage.setItem("k", "v");
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("setItem error"),
        expect.anything()
      );

      // Setting the static flag after construction silences storage live, with
      // no per-instance propagation.
      inspector.enableLogging(false);
      (console.error as jest.Mock).mockClear();
      AvoInspectorLite.avoStorage.setItem("k", "v");
      expect(console.error).not.toHaveBeenCalled();
    } finally {
      setItemSpy.mockRestore();
    }
  });
});
