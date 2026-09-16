import AvoGuid from "../AvoGuid";
import {
  AvoNetworkCallsHandlerLite,
  type BaseBody
} from "../lite/AvoNetworkCallsHandlerLite";

import xhrMock from "../__mocks__/xhr";

import { defaultOptions, mockedReturns, trackingEndpoint } from "./constants";

const inspectorVersion = process.env.npm_package_version || "";

// Port of the TrackOptions coverage in NetworkCallsHandler_test.ts. The lite
// handler is a textual copy of the full one (enforced by `yarn verify:lite-sync`),
// so the transport selection, the omission/trim table and the appVersion rule
// must hold identically here.
describe("NetworkCallsHandlerLite - TrackOptions parity", () => {
  const { apiKey, env, version } = defaultOptions;
  const appName = "";
  const eventName = "event name";
  const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

  /** No client configured: the v1 transport. */
  let networkHandler: AvoNetworkCallsHandlerLite;
  /** Client configured: the v2 transport, which is the only one that sends the hints. */
  let v2Handler: AvoNetworkCallsHandlerLite;
  let baseBody: BaseBody;

  const now = new Date();

  afterEach(() => {
    jest.clearAllMocks();
  });

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

    v2Handler = new AvoNetworkCallsHandlerLite(
      apiKey,
      env,
      appName,
      version,
      inspectorVersion,
      "gtm-web"
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

  // Pins v1: no client is configured on networkHandler, so both the body and
  // the request must be 3.2.0's. The byte-for-byte version of this pin, checked
  // against the 3.2.0 source itself, is V1WireBaseline_test.ts.
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

    networkHandler.callInspectorWithBatchBody([body], jest.fn());

    expect(xhrMock.open.mock.calls).toEqual([["POST", trackingEndpoint, true]]);
    expect(xhrMock.setRequestHeader.mock.calls).toEqual([
      ["Content-Type", "text/plain"]
    ]);
    expect(xhrMock.send.mock.calls).toEqual([[JSON.stringify([body])]]);
  });

  test("without a client, outputReference and originHint are left out of the body even when given", () => {
    const body = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null,
      undefined,
      undefined,
      { outputReference: "meta-x7k2q", originHint: "android", appVersion: "5.1.0" }
    );

    expect(Object.prototype.hasOwnProperty.call(body, "outputReference")).toBe(
      false
    );
    expect(Object.prototype.hasOwnProperty.call(body, "originHint")).toBe(false);
    // appVersion is a v1 field, so the override still applies.
    expect(body.appVersion).toBe("5.1.0");
  });

  test("with a client, the same options put both hints on the body (positive control for the omission above)", () => {
    const body = v2Handler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null,
      undefined,
      undefined,
      { outputReference: "meta-x7k2q", originHint: "android", appVersion: "5.1.0" }
    );

    expect(body.outputReference).toBe("meta-x7k2q");
    expect(body.originHint).toBe("android");
    expect(body.appVersion).toBe("5.1.0");
  });

  test("Codegen bodies never carry the hints on either transport, and keep eventId/eventHash/avoFunction", () => {
    [networkHandler, v2Handler].forEach((handler) => {
      const body = handler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        "event id",
        "event hash"
      );

      expect(body.avoFunction).toBe(true);
      expect(body.eventId).toBe("event id");
      expect(body.eventHash).toBe("event hash");
      expect(
        Object.prototype.hasOwnProperty.call(body, "outputReference")
      ).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(body, "originHint")).toBe(
        false
      );
    });
  });

  test("bodyForEventSchemaCall with options omitted and options = {} produce bodies with identical key sets (no new keys)", () => {
    const bodyWithoutOptions = v2Handler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null
    );
    const bodyWithEmptyOptions = v2Handler.bodyForEventSchemaCall(
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
    const body = v2Handler.bodyForEventSchemaCall(
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
    const body = v2Handler.bodyForEventSchemaCall(
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
    const body = v2Handler.bodyForEventSchemaCall(
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
    const body = v2Handler.bodyForEventSchemaCall(
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
      const body = v2Handler.bodyForEventSchemaCall(
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
      const body = v2Handler.bodyForEventSchemaCall(
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
    const body = v2Handler.bodyForEventSchemaCall(
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

// The origin-scoped null is a v2 rule; the v1 side is the describe block after
// this one. See NetworkCallsHandler_test.ts.
describe("NetworkCallsHandlerLite - TrackOptions.appVersion with originHint (v2, client set)", () => {
  const client = "gtm-web";
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
      inspectorVersion,
      client
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

// Without a client the hint is left out and the origin-scoped null never
// applies: v1 drops an event whose appVersion is null. Each case carries the v2
// handler as its positive control.
describe("NetworkCallsHandlerLite - TrackOptions.appVersion with originHint (v1, no client)", () => {
  const { apiKey, env, version } = defaultOptions;

  const v1 = () =>
    new AvoNetworkCallsHandlerLite(apiKey, env, "", version, inspectorVersion);
  const v2 = () =>
    new AvoNetworkCallsHandlerLite(
      apiKey,
      env,
      "",
      version,
      inspectorVersion,
      "gtm-web"
    );

  const bodyWith = (
    handler: AvoNetworkCallsHandlerLite,
    options: Record<string, unknown>
  ) =>
    handler.bodyForEventSchemaCall(
      "event name",
      [{ propertyName: "prop0", propertyType: "string" }],
      null,
      null,
      undefined,
      undefined,
      options as any
    );

  test.each([
    ["appVersion absent", { originHint: "ios" }],
    ["appVersion empty string", { originHint: "ios", appVersion: "" }],
    ["appVersion whitespace-only", { originHint: "ios", appVersion: "   " }],
    ["appVersion number", { originHint: "ios", appVersion: 42 }],
    ["appVersion null", { originHint: "ios", appVersion: null }]
  ] as Array<[string, Record<string, unknown>]>)(
    "originHint present, %s -> the configured version, not null (v2 sends null)",
    (_description, options) => {
      expect(bodyWith(v2(), options).appVersion).toBeNull();

      const body = bodyWith(v1(), options);
      expect(body.appVersion).toBe(version);
      expect(Object.prototype.hasOwnProperty.call(body, "originHint")).toBe(
        false
      );
    }
  );

  test("an appVersion option still overrides, with or without originHint", () => {
    expect(
      bodyWith(v1(), { originHint: "ios", appVersion: " 5.1.0 " }).appVersion
    ).toBe("5.1.0");
    expect(bodyWith(v1(), { appVersion: "5.1.0" }).appVersion).toBe("5.1.0");
  });

  test("the serialized body carries a string appVersion and no null, where v2's has a literal null", () => {
    expect(JSON.stringify(bodyWith(v2(), { originHint: "ios" }))).toContain(
      '"appVersion":null'
    );

    const v1Json = JSON.stringify(bodyWith(v1(), { originHint: "ios" }));
    expect(v1Json).not.toContain('"appVersion":null');
    expect(v1Json).toContain(`"appVersion":"${version}"`);
  });
});
