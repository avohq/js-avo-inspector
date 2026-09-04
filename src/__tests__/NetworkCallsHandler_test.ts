import AvoGuid from "../AvoGuid";
import { AvoNetworkCallsHandler, type BaseBody } from "../AvoNetworkCallsHandler";
import { AvoStreamId } from "../AvoStreamId";

import xhrMock from "../__mocks__/xhr";

import {
  defaultOptions,
  mockedReturns,
  requestMsg,
  trackingEndpoint
} from "./constants";

const inspectorVersion = process.env.npm_package_version || "";

describe("NetworkCallsHandler", () => {
  const { apiKey, env, version } = defaultOptions;
  const appName = "";

  let networkHandler: AvoNetworkCallsHandler;
  let baseBody: BaseBody;

  const customCallback = jest.fn();
  const now = new Date();

  beforeAll(() => {
    jest.spyOn(global, "Date").mockImplementation(() => now);

    jest
      .spyOn(AvoGuid as any, "newGuid")
      .mockImplementation(() => mockedReturns.GUID);

    jest
      .spyOn(AvoStreamId as any, "streamId", "get")
      .mockImplementation(() => mockedReturns.INSTALLATION_ID);

    networkHandler = new AvoNetworkCallsHandler(
      apiKey,
      env,
      "",
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
      streamId: mockedReturns.INSTALLATION_ID,
      samplingRate: 1.0
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("bodyForSessionStartedCall returns base body + session started body used for session started", () => {
    const body = networkHandler.bodyForSessionStartedCall();

    expect(body).toEqual({
      ...baseBody,
      type: "sessionStarted"
    });
  });

  test("bodyForEventSchemaCall returns base body + event schema used for event sending from non Avo Codegen", () => {
    const eventName = "event name";
    const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

    const body = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null, null
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
  });

  test("bodyForEventSchemaCall returns base body + event schema used for event sending from Avo Codegen", () => {
    const eventName = "event name";
    const eventId = "event id";
    const eventHash = "event hash";
    const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

    const body = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      eventId,
      eventHash
    );

    expect(body).toEqual({
      ...baseBody,
      type: "event",
      eventName,
      eventProperties,
      avoFunction: true,
      eventId,
      eventHash
    });
  });

  test("POST request is not sent if event list is empty", () => {
    const events: any = [];

    networkHandler.callInspectorWithBatchBody(events, customCallback);

    expect(xhrMock.open).not.toBeCalled();
  });

  test("callInspectorWithBatchBody sends POST request", () => {
    const eventName = "event name";
    const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

    const sessionStartedBody = networkHandler.bodyForSessionStartedCall();
    const eventBody = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null, null
    );

    const events = [sessionStartedBody, eventBody];

    networkHandler.callInspectorWithBatchBody(events, customCallback);

    expect(xhrMock.open).toBeCalledTimes(1);
    expect(xhrMock.open).toBeCalledWith("POST", trackingEndpoint, true);

    expect(xhrMock.setRequestHeader).toBeCalledWith(
      "Content-Type",
      "application/json"
    );

    expect(xhrMock.send).toBeCalledTimes(1);
    expect(xhrMock.send).toBeCalledWith(JSON.stringify(events));

    xhrMock.onload();

    expect(customCallback).toBeCalledTimes(1);
    expect(customCallback).toBeCalledWith(null);
  });

  test("Custom callback is called when 200 OK", () => {
    const sessionStartedBody = networkHandler.bodyForSessionStartedCall();
    const events = [sessionStartedBody];

    networkHandler.callInspectorWithBatchBody(events, customCallback);

    xhrMock.onload();

    expect(customCallback).toBeCalledTimes(1);
    expect(customCallback).toBeCalledWith(null);
  });

  test("Custom callback is called with error when not 200 OK", () => {
    const xhrErrorMock = require("../__mocks__/xhrError").default;

    const sessionStartedBody = networkHandler.bodyForSessionStartedCall();
    const events = [sessionStartedBody];

    networkHandler.callInspectorWithBatchBody(events, customCallback);

    xhrErrorMock.onload();

    expect(customCallback).toHaveBeenCalledTimes(1);
    expect(customCallback).toHaveBeenCalledWith(new Error("Error 400: Bad Request"));
  });

  test("Custom callback is called onerror", () => {
    const xhrErrorMock = require("../__mocks__/xhrError").default;

    const sessionStartedBody = networkHandler.bodyForSessionStartedCall();
    const events = [sessionStartedBody];

    networkHandler.callInspectorWithBatchBody(events, customCallback);

    xhrErrorMock.onerror();

    expect(customCallback).toHaveBeenCalledTimes(1);
    expect(customCallback).toHaveBeenCalledWith(new Error(requestMsg.ERROR));
  });

  test("Custom callback is called ontimeout", () => {
    const xhrErrorMock = require("../__mocks__/xhrError").default;

    const sessionStartedBody = networkHandler.bodyForSessionStartedCall();
    const events = [sessionStartedBody];

    networkHandler.callInspectorWithBatchBody(events, customCallback);

    xhrErrorMock.ontimeout();

    expect(customCallback).toHaveBeenCalledTimes(1);
    expect(customCallback).toHaveBeenCalledWith(new Error(requestMsg.TIMEOUT));
  });

  test("bodyForEventSchemaCall correctly includes nested object array properties", () => {
    // This test verifies that nested object arrays (like visibleSmartResults)
    // are correctly included in the eventProperties payload
    const eventName = "Cmd Palette Results Received";
    const eventProperties = [
      { propertyName: "Schema Id", propertyType: "string" },
      { propertyName: "Branch Id", propertyType: "string" },
      // Nested object array property
      {
        propertyName: "Visible Smart Results",
        propertyType: "list",
        children: [
          [
            { propertyName: "itemName", propertyType: "string" },
            { propertyName: "itemType", propertyType: "string" },
            { propertyName: "searchResultPosition", propertyType: "int" },
            { propertyName: "searchResultRanking", propertyType: "float" },
            { propertyName: "searchTerm", propertyType: "string" }
          ]
        ]
      }
    ];

    const body = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null
    );

    // Verify the eventProperties are included in the body
    expect(body.eventProperties).toEqual(eventProperties);
    expect(body.eventProperties.length).toBe(3);

    // Verify the nested property structure is preserved
    const nestedProp = body.eventProperties.find(
      (p) => p.propertyName === "Visible Smart Results"
    );
    expect(nestedProp).toBeDefined();
    expect(nestedProp!.propertyType).toBe("list");
    expect(nestedProp!.children).toBeDefined();
    expect(nestedProp!.children!.length).toBe(1);
    expect(Array.isArray(nestedProp!.children![0])).toBe(true);

    // Verify JSON serialization preserves the structure
    const jsonPayload = JSON.stringify([body]);
    const parsed = JSON.parse(jsonPayload);

    expect(parsed[0].eventProperties.length).toBe(3);

    const parsedNestedProp = parsed[0].eventProperties.find(
      (p: any) => p.propertyName === "Visible Smart Results"
    );
    expect(parsedNestedProp.children.length).toBe(1);
    expect(parsedNestedProp.children[0].length).toBe(5);
    expect(parsedNestedProp.children[0][0].propertyName).toBe("itemName");
  });

  test("JSON serialization of nested object arrays is correct for API", () => {
    // This test verifies that the JSON.stringify of nested object arrays
    // produces the correct structure that would be sent to the API
    const eventName = "Cmd Palette Results Received";
    const eventProperties = [
      { propertyName: "Schema Id", propertyType: "string" },
      {
        propertyName: "Visible Smart Results",
        propertyType: "list",
        children: [
          [
            { propertyName: "itemName", propertyType: "string" },
            { propertyName: "itemType", propertyType: "string" }
          ]
        ]
      }
    ];

    const eventBody = networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null
    );

    const events = [eventBody];

    // Verify the JSON structure that would be sent to the API
    const jsonPayload = JSON.stringify(events);
    const parsedPayload = JSON.parse(jsonPayload);

    // Verify the nested structure is preserved in the JSON
    expect(parsedPayload[0].eventProperties.length).toBe(2);

    const parsedNestedProp = parsedPayload[0].eventProperties.find(
      (p: any) => p.propertyName === "Visible Smart Results"
    );
    expect(parsedNestedProp).toBeDefined();
    expect(parsedNestedProp.propertyType).toBe("list");
    expect(parsedNestedProp.children).toBeDefined();
    expect(parsedNestedProp.children.length).toBe(1);
    expect(parsedNestedProp.children[0].length).toBe(2);
    expect(parsedNestedProp.children[0][0].propertyName).toBe("itemName");
    expect(parsedNestedProp.children[0][1].propertyName).toBe("itemType");
  });

  describe("publicEncryptionKey", () => {
    test("bodyForSessionStartedCall includes publicEncryptionKey when provided", () => {
      const testEncryptionKey = "test-encryption-key-123";
      const handlerWithKey = new AvoNetworkCallsHandler(
        apiKey,
        env,
        "",
        version,
        inspectorVersion,
        testEncryptionKey
      );

      const body = handlerWithKey.bodyForSessionStartedCall();

      expect(body.publicEncryptionKey).toBe(testEncryptionKey);
    });

    test("bodyForEventSchemaCall includes publicEncryptionKey when provided", () => {
      const testEncryptionKey = "test-encryption-key-456";
      const handlerWithKey = new AvoNetworkCallsHandler(
        apiKey,
        env,
        "",
        version,
        inspectorVersion,
        testEncryptionKey
      );

      const eventName = "test event";
      const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

      const body = handlerWithKey.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null
      );

      expect(body.publicEncryptionKey).toBe(testEncryptionKey);
    });

    test("body does not include publicEncryptionKey when not provided", () => {
      const handlerWithoutKey = new AvoNetworkCallsHandler(
        apiKey,
        env,
        "",
        version,
        inspectorVersion
        // No encryption key
      );

      const sessionBody = handlerWithoutKey.bodyForSessionStartedCall();
      const eventBody = handlerWithoutKey.bodyForEventSchemaCall(
        "test event",
        [{ propertyName: "prop0", propertyType: "string" }],
        null,
        null
      );

      expect(sessionBody.publicEncryptionKey).toBeUndefined();
      expect(eventBody.publicEncryptionKey).toBeUndefined();
    });

    test("body does not include publicEncryptionKey when empty string provided", () => {
      const handlerWithEmptyKey = new AvoNetworkCallsHandler(
        apiKey,
        env,
        "",
        version,
        inspectorVersion,
        "" // Empty string
      );

      const body = handlerWithEmptyKey.bodyForSessionStartedCall();

      expect(body.publicEncryptionKey).toBeUndefined();
    });

    test("publicEncryptionKey is included in JSON payload sent to API", () => {
      const testEncryptionKey = "test-encryption-key-789";
      const handlerWithKey = new AvoNetworkCallsHandler(
        apiKey,
        env,
        "",
        version,
        inspectorVersion,
        testEncryptionKey
      );

      const eventBody = handlerWithKey.bodyForEventSchemaCall(
        "test event",
        [{ propertyName: "prop0", propertyType: "string" }],
        null,
        null
      );

      const jsonPayload = JSON.stringify([eventBody]);
      const parsed = JSON.parse(jsonPayload);

      expect(parsed[0].publicEncryptionKey).toBe(testEncryptionKey);
    });
  });

  describe("TrackOptions (outputReference, originHint)", () => {
    const eventName = "event name";
    const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

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
      expect(Object.prototype.hasOwnProperty.call(body, "outputReference")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(body, "originHint")).toBe(false);
    });

    test("bodyForEventSchemaCall with options = {} produces body with no outputReference/originHint keys", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        {}
      );

      expect(Object.prototype.hasOwnProperty.call(body, "outputReference")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(body, "originHint")).toBe(false);
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

    test("bodyForEventSchemaCall omits originHint when it is an empty string", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { originHint: "" }
      );

      expect(Object.prototype.hasOwnProperty.call(body, "originHint")).toBe(false);
    });

    test("bodyForEventSchemaCall omits outputReference/originHint for non-string values", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { outputReference: 42 as any, originHint: null as any }
      );

      expect(Object.prototype.hasOwnProperty.call(body, "outputReference")).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(body, "originHint")).toBe(false);
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
        { originHint: "android" }
      );

      expect(body.originHint).toBe("android");
      expect(Object.prototype.hasOwnProperty.call(body, "outputReference")).toBe(false);
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
    });

    test("bodyForEventSchemaCall preserves an originHint of 200+ characters untouched, no length limit", () => {
      const longHint = "a".repeat(210);

      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { originHint: longHint }
      );

      expect(body.originHint).toBe(longHint);
      expect(body.originHint!.length).toBe(210);
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

        expect(Object.prototype.hasOwnProperty.call(body, "outputReference")).toBe(false);
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

        expect(Object.prototype.hasOwnProperty.call(body, "originHint")).toBe(false);
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
      expect(Object.prototype.hasOwnProperty.call(parsed, "originHint")).toBe(false);
      expect(Object.keys(parsed)).not.toContain("originHint");
    });
  });

  describe("TrackOptions.appVersion with originHint", () => {
    const eventName = "event name";
    const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

    test("originHint present, appVersion present -> body.appVersion is options.appVersion", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { originHint: "ios", appVersion: "5.1.0" }
      );

      expect(body.appVersion).toBe("5.1.0");
    });

    test("originHint present, appVersion absent -> body.appVersion is null (root version ignored)", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { originHint: "ios" }
      );

      expect(body.appVersion).toBeNull();
      expect(Object.prototype.hasOwnProperty.call(body, "appVersion")).toBe(true);
    });

    test("originHint absent, appVersion present -> body.appVersion is options.appVersion", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { appVersion: "5.1.0" }
      );

      expect(body.appVersion).toBe("5.1.0");
    });

    test("originHint absent, appVersion absent -> body.appVersion is the root version (unchanged behaviour)", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null
      );

      expect(body.appVersion).toBe(version);
    });

    test("appVersion is trimmed", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { originHint: "ios", appVersion: "  2.0.0 " }
      );

      expect(body.appVersion).toBe("2.0.0");
    });

    test("appVersion of '' is treated as absent (originHint present -> null)", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { originHint: "ios", appVersion: "" }
      );

      expect(body.appVersion).toBeNull();
    });

    test("appVersion of '   ' (whitespace-only) is treated as absent (originHint present -> null)", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { originHint: "ios", appVersion: "   " }
      );

      expect(body.appVersion).toBeNull();
    });

    test("appVersion of 42 (non-string) is treated as absent (originHint present -> null)", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { originHint: "ios", appVersion: 42 as any }
      );

      expect(body.appVersion).toBeNull();
    });

    test("appVersion of '' is treated as absent (originHint absent -> root version)", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { appVersion: "" }
      );

      expect(body.appVersion).toBe(version);
    });

    test("appVersion of '   ' (whitespace-only) is treated as absent (originHint absent -> root version)", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { appVersion: "   " }
      );

      expect(body.appVersion).toBe(version);
    });

    test("appVersion of 42 (non-string) is treated as absent (originHint absent -> root version)", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { appVersion: 42 as any }
      );

      expect(body.appVersion).toBe(version);
    });

    test("sessionStarted body still carries the root version, unaffected by appVersion rule", () => {
      const body = networkHandler.bodyForSessionStartedCall();

      expect(body.appVersion).toBe(version);
    });

    test("body with originHint and no appVersion survives JSON round trip preserving literal null", () => {
      const body = networkHandler.bodyForEventSchemaCall(
        eventName,
        eventProperties,
        null,
        null,
        undefined,
        undefined,
        { originHint: "ios" }
      );

      const jsonString = JSON.stringify(body);
      expect(jsonString).toContain('"appVersion":null');

      const parsed = JSON.parse(jsonString);
      expect(parsed.appVersion).toBeNull();
      expect(Object.prototype.hasOwnProperty.call(parsed, "appVersion")).toBe(true);
    });
  });
});
