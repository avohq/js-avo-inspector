/**
 * The one warning TrackOptions can produce.
 *
 * Without a client the SDK sends to `/inspector/v1/track`, which has no
 * `outputReference`/`originHint` fields and answers 200 regardless, so the SDK
 * leaves both out of the body and — once per build, when logging is on — says
 * so. With a client (v2) both are sent and nothing is logged.
 *
 * There is deliberately no null-appVersion warning on either transport. v2
 * stores a null appVersion as "unversioned", and v1 never receives one: without
 * a client the origin-scoped null does not apply and the event keeps the
 * configured version. The last block pins both halves of that.
 *
 * The latch is module-level, which is also why the full and lite builds warn
 * independently — the `describe.each` blocks run against each of them — and
 * why every test loads a fresh copy of its handler via `jest.isolateModules`.
 */

const HINTS_OMITTED_WARNING =
  "[Avo Inspector] outputReference and originHint are sent only when a client is configured, so they were left out of this event.";

interface FreshHandler {
  /** Builds an event-schema body with the given options. */
  bodyWith: (options?: Record<string, unknown>) => any;
  /** Toggles the build's logging flag. */
  setShouldLog: (enable: boolean) => void;
}

const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

/** Loads the full build's handler with a pristine warning latch. */
const loadFullHandler = (client?: string): FreshHandler => {
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
      "3.3.0",
      undefined, // publicEncryptionKey
      client
    );

    fresh = {
      bodyWith: (options?: Record<string, unknown>) =>
        handler.bodyForEventSchemaCall(
          "event name",
          eventProperties,
          null, // eventId
          null, // eventHash
          undefined, // eventSpecMetadata
          undefined, // validatedBranchId
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
const loadLiteHandler = (client?: string): FreshHandler => {
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
      "3.3.0",
      client
    );

    fresh = {
      bodyWith: (options?: Record<string, unknown>) =>
        handler.bodyForEventSchemaCall(
          "event name",
          eventProperties,
          null, // eventId
          null, // eventHash
          undefined, // eventSpecMetadata
          undefined, // validatedBranchId
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
])("v1 (no client): omitted hints warning (%s)", (_name, load) => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  test("warns exactly once however many hinted events are built", () => {
    const handler = load();
    handler.setShouldLog(true);

    handler.bodyWith({ outputReference: "meta-x7k2q" });
    handler.bodyWith({ originHint: "ios", appVersion: "5.1.0" });
    handler.bodyWith({ originHint: "ios" });
    handler.bodyWith({ outputReference: "tiktok-9f3q2", originHint: "web" });

    expect(warnMock.mock.calls).toEqual([[HINTS_OMITTED_WARNING]]);
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
    expect(args).toEqual([HINTS_OMITTED_WARNING]);
    expect(args[0]).not.toContain("hint-that-must-not-be-logged");
    expect(args[0]).not.toContain("output-that-must-not-be-logged");
  });

  test("stays silent when logging is disabled, and does not burn the one warning a later logging-enabled call is owed", () => {
    const handler = load();

    handler.setShouldLog(false);
    handler.bodyWith({ outputReference: "meta-x7k2q" });
    handler.bodyWith({ originHint: "ios" });

    expect(warnMock).not.toHaveBeenCalled();

    handler.setShouldLog(true);
    handler.bodyWith({ outputReference: "meta-x7k2q" });

    expect(warnMock.mock.calls).toEqual([[HINTS_OMITTED_WARNING]]);
  });

  test("stays silent when nothing is left out", () => {
    const handler = load();
    handler.setShouldLog(true);

    handler.bodyWith();
    handler.bodyWith({});
    // appVersion is a v1 field and is honored, so nothing is omitted.
    handler.bodyWith({ appVersion: "5.1.0" });
    // Hints that normalize away would not have been sent on v2 either.
    handler.bodyWith({ outputReference: "  ", originHint: "" });
    handler.bodyWith({ outputReference: 42, originHint: null });

    expect(warnMock).not.toHaveBeenCalled();

    // Positive control: the same handler does warn once a hint is left out.
    handler.bodyWith({ outputReference: "meta-x7k2q" });
    expect(warnMock).toHaveBeenCalledTimes(1);
  });
});

describe.each([
  ["full build", loadFullHandler],
  ["lite build", loadLiteHandler]
])("v2 (client set): no warnings (%s)", (_name, load) => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  test("the calls that warn on v1 stay silent, and the body keeps the hints", () => {
    const handler = load("gtm-web");
    handler.setShouldLog(true);

    const body = handler.bodyWith({
      originHint: "ios",
      outputReference: "meta-x7k2q"
    });
    handler.bodyWith({ outputReference: "tiktok-9f3q2" });

    expect(warnMock).not.toHaveBeenCalled();
    expect(body.originHint).toBe("ios");
    expect(body.outputReference).toBe("meta-x7k2q");
  });

  test("control: the same calls without a client do warn", () => {
    const handler = load();
    handler.setShouldLog(true);

    handler.bodyWith({ originHint: "ios", outputReference: "meta-x7k2q" });
    handler.bodyWith({ outputReference: "tiktok-9f3q2" });

    expect(warnMock.mock.calls).toEqual([[HINTS_OMITTED_WARNING]]);
  });
});

describe("omitted hints warning - latch scope", () => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  // This is why the guarantee is worded "one warning per build", not "one per
  // page": an app that loads both entry points holds independent latches.
  test("the full and lite builds latch independently (separate bundles)", () => {
    const full = loadFullHandler();
    const lite = loadLiteHandler();

    full.setShouldLog(true);
    lite.setShouldLog(true);

    full.bodyWith({ originHint: "ios" });
    full.bodyWith({ originHint: "ios" });
    lite.bodyWith({ originHint: "ios" });
    lite.bodyWith({ originHint: "ios" });

    expect(warnMock.mock.calls).toEqual([
      [HINTS_OMITTED_WARNING],
      [HINTS_OMITTED_WARNING]
    ]);
  });
});

describe.each([
  ["full build", loadFullHandler],
  ["lite build", loadLiteHandler]
])("no null-appVersion warning on either transport (%s)", (_name, load) => {
  beforeEach(() => {
    warnMock.mockClear();
  });

  const originOnly = { originHint: "ios" };
  const originWithBlankVersions = [
    originOnly,
    { originHint: "ios", appVersion: "" },
    { originHint: "ios", appVersion: "   " },
    { originHint: "ios", appVersion: 42 }
  ];

  test("v2: originHint without appVersion builds a null appVersion and logs nothing", () => {
    const handler = load("gtm-web");
    handler.setShouldLog(true);

    originWithBlankVersions.forEach((options) => {
      expect(handler.bodyWith(options).appVersion).toBeNull();
    });

    expect(warnMock).not.toHaveBeenCalled();
  });

  test("v1: the same calls keep the configured version, and the only warning is the omitted-hints one", () => {
    const handler = load();
    handler.setShouldLog(true);

    originWithBlankVersions.forEach((options) => {
      expect(handler.bodyWith(options).appVersion).toBe("1.0.0");
    });

    // Positive control that console.warn is observed here at all: the
    // omitted-hints warning does fire, and it is the only one.
    expect(warnMock.mock.calls).toEqual([[HINTS_OMITTED_WARNING]]);
    warnMock.mock.calls.forEach((args) => {
      expect(String(args[0])).not.toContain("appVersion");
    });
  });
});
