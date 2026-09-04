import AvoGuid from "../AvoGuid";
import {
  AvoNetworkCallsHandlerLite,
  type BaseBody
} from "../lite/AvoNetworkCallsHandlerLite";

import { defaultOptions, mockedReturns } from "./constants";

const inspectorVersion = process.env.npm_package_version || "";

// Port of the TrackOptions coverage in NetworkCallsHandler_test.ts. The lite
// handler is a textual copy of the full one (enforced by `yarn verify:lite-sync`),
// so the omission/trim table and the appVersion rule must hold identically here.
describe("NetworkCallsHandlerLite - TrackOptions parity", () => {
  const { apiKey, env, version } = defaultOptions;
  const appName = "";
  const eventName = "event name";
  const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

  let networkHandler: AvoNetworkCallsHandlerLite;
  let baseBody: BaseBody;

  const now = new Date();

  beforeAll(() => {
    jest.spyOn(global, "Date").mockImplementation(() => now);

    jest
      .spyOn(AvoGuid as any, "newGuid")
      .mockImplementation(() => mockedReturns.GUID);

    networkHandler = new AvoNetworkCallsHandlerLite(
      apiKey,
      env,
      appName,
      version,
      inspectorVersion
    );

    baseBody = {
      apiKey,
      appName,
      appVersion: version,
      libVersion: inspectorVersion,
      env,
      libPlatform: "web",
      messageId: mockedReturns.GUID,
      trackingId: "",
      createdAt: new Date().toISOString(),
      sessionId: "",
      // The lite build has no stream id generation.
      streamId: "",
      samplingRate: 1.0
    };
  });

  test("bodyForEventSchemaCall without options produces body identical to pre-change baseline (regression)", () => {
    const body = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null
    );

    expect(body).toEqual({
      ...baseBody,
      type: "event",
      eventName,
      eventProperties,
      avoFunction: false,
      eventId: null,
      eventHash: null
    });
    expect(Object.prototype.hasOwnProperty.call(body, "outputReference")).toBe(
      false
    );
    expect(Object.prototype.hasOwnProperty.call(body, "originHint")).toBe(false);
  });

  test("bodyForEventSchemaCall with options omitted and options = {} produce bodies with identical key sets (no new keys)", () => {
    const bodyWithoutOptions = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null
    );
    const bodyWithEmptyOptions = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null,
      undefined,
      undefined,
      {}
    );

    expect(Object.keys(bodyWithEmptyOptions).sort()).toEqual(
      Object.keys(bodyWithoutOptions).sort()
    );
    expect(bodyWithEmptyOptions).toEqual(bodyWithoutOptions);
  });

  test("bodyForEventSchemaCall trims outputReference and omits originHint when absent", () => {
    const body = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null,
      undefined,
      undefined,
      { outputReference: "  meta-x7k2q  " }
    );

    expect(body.outputReference).toBe("meta-x7k2q");
    expect(Object.prototype.hasOwnProperty.call(body, "originHint")).toBe(false);
  });

  test("bodyForEventSchemaCall trims originHint", () => {
    const body = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null,
      undefined,
      undefined,
      { originHint: "\tandroid \n" }
    );

    expect(body.originHint).toBe("android");
  });

  test("bodyForEventSchemaCall sets both outputReference and originHint when both provided", () => {
    const body = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null,
      undefined,
      undefined,
      { outputReference: "meta-x7k2q", originHint: "android" }
    );

    expect(body.outputReference).toBe("meta-x7k2q");
    expect(body.originHint).toBe("android");
  });

  test("bodyForEventSchemaCall sets only originHint when only originHint is provided (outputReference stays absent)", () => {
    const body = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null,
      undefined,
      undefined,
      { originHint: "android", appVersion: "5.1.0" }
    );

    expect(body.originHint).toBe("android");
    expect(Object.prototype.hasOwnProperty.call(body, "outputReference")).toBe(
      false
    );
  });

  const invalidHintValues: Array<[string, unknown]> = [
    ["empty string", ""],
    ["whitespace-only string", "   "],
    ["null", null],
    ["number", 42],
    ["boolean", true],
    ["empty object", {}],
    ["empty array", []],
    ["undefined", undefined]
  ];

  test.each(invalidHintValues)(
    "bodyForEventSchemaCall omits outputReference when options.outputReference is %s",
    (_description, value) => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { outputReference: value as any }
      );

      expect(Object.prototype.hasOwnProperty.call(body, "outputReference")).toBe(
        false
      );
    }
  );

  test.each(invalidHintValues)(
    "bodyForEventSchemaCall omits originHint when options.originHint is %s",
    (_description, value) => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { originHint: value as any }
      );

      expect(Object.prototype.hasOwnProperty.call(body, "originHint")).toBe(
        false
      );
      // An omitted originHint must not trigger the nullable-appVersion rule.
      expect(body.appVersion).toBe(version);
    }
  );

  test("body with hints survives JSON.stringify -> JSON.parse with keys intact and no undefined-valued keys for the omitted field", () => {
    const body = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null,
      undefined,
      undefined,
      { outputReference: "meta-x7k2q" }
    );

    const parsed = JSON.parse(JSON.stringify(body));

    expect(parsed.outputReference).toBe("meta-x7k2q");
    expect(Object.prototype.hasOwnProperty.call(parsed, "originHint")).toBe(
      false
    );
    expect(Object.keys(parsed)).not.toContain("originHint");
  });
});

describe("NetworkCallsHandlerLite - TrackOptions.appVersion with originHint", () => {
  const { apiKey, env, version } = defaultOptions;
  const eventName = "event name";
  const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

  let networkHandler: AvoNetworkCallsHandlerLite;

  beforeAll(() => {
    networkHandler = new AvoNetworkCallsHandlerLite(
      apiKey,
      env,
      "",
      version,
      inspectorVersion
    );
  });

  const absentAppVersions: Array<[string, unknown]> = [
    ["empty string", ""],
    ["whitespace-only string", "   "],
    ["number", 42],
    ["boolean", true],
    ["null", null],
    ["empty object", {}],
    ["empty array", []]
  ];

  const bodyWith = (options?: Record<string, unknown>) =>
    networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null,
      undefined,
      undefined,
      options as any
    );

  test("originHint present, appVersion present -> body.appVersion is options.appVersion", () => {
    expect(bodyWith({ originHint: "ios", appVersion: "5.1.0" }).appVersion).toBe(
      "5.1.0"
    );
  });

  test("originHint present, appVersion absent -> body.appVersion is null (root version ignored)", () => {
    const body = bodyWith({ originHint: "ios" });

    expect(body.appVersion).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(body, "appVersion")).toBe(true);
  });

  test("originHint absent, appVersion present -> body.appVersion is options.appVersion", () => {
    expect(bodyWith({ appVersion: "5.1.0" }).appVersion).toBe("5.1.0");
  });

  test("originHint absent, appVersion absent -> body.appVersion is the root version (unchanged behaviour)", () => {
    expect(bodyWith(undefined).appVersion).toBe(version);
  });

  test("appVersion is trimmed", () => {
    expect(
      bodyWith({ originHint: "ios", appVersion: "  2.0.0 " }).appVersion
    ).toBe("2.0.0");
  });

  test.each(absentAppVersions)(
    "appVersion of %s is treated as absent (originHint present -> null)",
    (_description, value) => {
      expect(bodyWith({ originHint: "ios", appVersion: value }).appVersion).toBeNull();
    }
  );

  test.each(absentAppVersions)(
    "appVersion of %s is treated as absent (originHint absent -> root version)",
    (_description, value) => {
      expect(bodyWith({ appVersion: value }).appVersion).toBe(version);
    }
  );

  test("sessionStarted body still carries the root version, unaffected by appVersion rule", () => {
    expect(networkHandler.bodyForSessionStartedCall().appVersion).toBe(version);
  });

  test("body with originHint and no appVersion survives JSON round trip preserving literal null", () => {
    const jsonString = JSON.stringify(bodyWith({ originHint: "ios" }));
    expect(jsonString).toContain('"appVersion":null');

    const parsed = JSON.parse(jsonString);
    expect(parsed.appVersion).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(parsed, "appVersion")).toBe(
      true
    );
  });
});
