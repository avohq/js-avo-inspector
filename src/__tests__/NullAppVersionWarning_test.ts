/**
 * The nullable-appVersion warning.
 *
 * `/inspector/v1/track` currently drops any event whose `appVersion` is null and
 * still answers 200, so the SDK warns once per page/process when it builds such a
 * body. The latch is module-level, so every test here loads a fresh copy of the
 * handler module via `jest.isolateModules`.
 */

const WARNING =
  "[Avo Inspector] originHint is set without appVersion; appVersion will be sent as null, which the Inspector backend currently drops. Pass options.appVersion until the backend is updated.";

interface FreshHandler {
  /** Builds an event-schema body with the given options. */
  bodyWith: (options?: Record<string, unknown>) => any;
  /** Toggles the build's logging flag. */
  setShouldLog: (enable: boolean) => void;
}

const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

/** Loads the full build's handler with a pristine warning latch. */
const loadFullHandler = (): FreshHandler => {
  let fresh!: FreshHandler;

  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { AvoInspector } = require("../AvoInspector");
    const { AvoNetworkCallsHandler } = require("../AvoNetworkCallsHandler");
    const { AvoStreamId } = require("../AvoStreamId");
    /* eslint-enable @typescript-eslint/no-var-requires */

    // The full build reads the stream id while building a body; stub it so no
    // AvoInspector instance (and therefore no storage) is needed here.
    jest
      .spyOn(AvoStreamId, "streamId", "get")
      .mockReturnValue("mock-stream-id");

    const handler = new AvoNetworkCallsHandler(
      "api-key-xxx",
      "prod",
      "",
      "1.0.0",
      "3.3.0"
    );

    fresh = {
      bodyWith: (options?: Record<string, unknown>) =>
        handler.bodyForEventSchemaCall(
          "event name",
          eventProperties,
          null,
          null,
          undefined,
          undefined,
          options
        ),
      setShouldLog: (enable: boolean) => {
        AvoInspector.shouldLog = enable;
      }
    };
  });

  return fresh;
};

/** Loads the lite build's handler with a pristine warning latch. */
const loadLiteHandler = (): FreshHandler => {
  let fresh!: FreshHandler;

  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { AvoInspectorLite } = require("../lite/AvoInspectorLite");
    const {
      AvoNetworkCallsHandlerLite
    } = require("../lite/AvoNetworkCallsHandlerLite");
    /* eslint-enable @typescript-eslint/no-var-requires */

    const handler = new AvoNetworkCallsHandlerLite(
      "api-key-lite-xxx",
      "prod",
      "",
      "1.0.0",
      "3.3.0"
    );

    fresh = {
      bodyWith: (options?: Record<string, unknown>) =>
        handler.bodyForEventSchemaCall(
          "event name",
          eventProperties,
          null,
          null,
          undefined,
          undefined,
          options
        ),
      setShouldLog: (enable: boolean) => {
        AvoInspectorLite.shouldLog = enable;
      }
    };
  });

  return fresh;
};

// `console.warn` is spied once in src/__tests__/jest.setup.js and never replaced,
// so a direct cast is stable across the `jest.isolateModules` loads above.
const warnMock = console.warn as jest.Mock;

describe.each([
  ["full build", loadFullHandler],
  ["lite build", loadLiteHandler]
])("null appVersion warning (%s)", (_name, load) => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  test("warns exactly once across several originHint-without-appVersion calls", () => {
    const handler = load();
    handler.setShouldLog(true);

    handler.bodyWith({ originHint: "ios" });
    handler.bodyWith({ originHint: "android", outputReference: "meta-x7k2q" });
    handler.bodyWith({ originHint: "web", appVersion: "   " });

    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledWith(WARNING);
  });

  test("the warning carries no option values", () => {
    const handler = load();
    handler.setShouldLog(true);

    handler.bodyWith({
      originHint: "hint-that-must-not-be-logged",
      outputReference: "output-that-must-not-be-logged"
    });

    expect(warnMock).toHaveBeenCalledTimes(1);

    const args = warnMock.mock.calls[0];
    expect(args.length).toBe(1);
    expect(args[0]).toBe(WARNING);
    expect(args[0]).not.toContain("hint-that-must-not-be-logged");
    expect(args[0]).not.toContain("output-that-must-not-be-logged");
  });

  test("stays silent when logging is disabled, and does not burn the one warning a later logging-enabled call is owed", () => {
    const handler = load();

    handler.setShouldLog(false);
    handler.bodyWith({ originHint: "ios" });
    handler.bodyWith({ originHint: "android" });

    expect(warnMock).not.toHaveBeenCalled();

    handler.setShouldLog(true);
    handler.bodyWith({ originHint: "ios" });

    expect(warnMock).toHaveBeenCalledTimes(1);
    expect(warnMock).toHaveBeenCalledWith(WARNING);
  });

  test("stays silent when appVersion is provided alongside originHint", () => {
    const handler = load();
    handler.setShouldLog(true);

    handler.bodyWith({ originHint: "ios", appVersion: "5.1.0" });
    handler.bodyWith({ originHint: "web", appVersion: "  2.0.0  " });

    expect(warnMock).not.toHaveBeenCalled();
  });

  test("stays silent when there is no originHint at all", () => {
    const handler = load();
    handler.setShouldLog(true);

    handler.bodyWith();
    handler.bodyWith({});
    handler.bodyWith({ outputReference: "meta-x7k2q" });
    handler.bodyWith({ appVersion: "5.1.0" });
    // An originHint that normalizes away is not an originHint.
    handler.bodyWith({ originHint: "   " });

    expect(warnMock).not.toHaveBeenCalled();
  });

  test("the warning does not change the body it warns about", () => {
    const handler = load();
    handler.setShouldLog(true);

    const body = handler.bodyWith({ originHint: "ios" });

    expect(body.originHint).toBe("ios");
    expect(body.appVersion).toBeNull();
    expect(warnMock).toHaveBeenCalledTimes(1);
  });
});

describe("null appVersion warning - latch scope", () => {
  beforeEach(() => {
    (console.warn as jest.Mock).mockClear();
  });

  test("the full and lite builds latch independently (separate bundles)", () => {
    const full = loadFullHandler();
    const lite = loadLiteHandler();

    full.setShouldLog(true);
    lite.setShouldLog(true);

    full.bodyWith({ originHint: "ios" });
    lite.bodyWith({ originHint: "ios" });

    expect(console.warn as jest.Mock).toHaveBeenCalledTimes(2);
  });
});
