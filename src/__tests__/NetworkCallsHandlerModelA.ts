import AvoGuid from "../AvoGuid";
import { AvoStreamId } from "../AvoStreamId";
import { AvoNetworkCallsHandler, BaseBody } from "../AvoNetworkCallsHandler";

import xhrMock from "../__mocks__/xhr";

import {
  defaultOptions,
  mockedReturns,
  requestMsg,
  trackingEndpoint,
} from "./constants";

const inspectorVersion = process.env.npm_package_version || "";

describe("NetworkCallsHandler Model A", () => {
  const { apiKey, env, version } = defaultOptions;
  const appName = "";

  let networkHandler: AvoNetworkCallsHandler;
  let baseBody: BaseBody;

  const customCallback = jest.fn();
  const now = new Date();

  beforeAll(() => {
    // @ts-ignore
    jest.spyOn(global, "Date").mockImplementation(() => now);

    jest
      .spyOn(AvoStreamId as any, "initialize")
      .mockResolvedValue(mockedReturns.ANONYMOUS_ID);

    jest
      .spyOn(AvoGuid as any, "newGuid")
      .mockImplementation(() => mockedReturns.GUID);

    networkHandler = new AvoNetworkCallsHandler(
      apiKey,
      env,
      "",
      version,
      inspectorVersion,
    );

    baseBody = {
      apiKey,
      appName,
      appVersion: version,
      libVersion: inspectorVersion,
      env,
      libPlatform: "react-native",
      messageId: mockedReturns.GUID,
      trackingId: "",
      sessionId: "",
      anonymousId: mockedReturns.ANONYMOUS_ID,
      createdAt: new Date().toISOString(),
      samplingRate: 1.0,
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test("BaseBody contains anonymousId field", async () => {
    const body = await networkHandler.bodyForEventSchemaCall(
      "test event",
      [],
      null,
      null
    );
    expect(body).toHaveProperty("anonymousId");
  });

  test("BaseBody contains empty sessionId field", async () => {
    const body = await networkHandler.bodyForEventSchemaCall(
      "test event",
      [],
      null,
      null
    );
    expect(body).toHaveProperty("sessionId", "");
  });

  test("BaseBody contains empty trackingId field", async () => {
    const body = await networkHandler.bodyForEventSchemaCall(
      "test event",
      [],
      null,
      null
    );
    expect(body).toHaveProperty("trackingId", "");
  });

  test("libPlatform is 'react-native'", async () => {
    const body = await networkHandler.bodyForEventSchemaCall(
      "test event",
      [],
      null,
      null
    );
    expect(body.libPlatform).toBe("react-native");
  });

  test("bodyForEventSchemaCall returns base body + event schema from non avo functions", async () => {
    const eventName = "event name";
    const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

    const body = await networkHandler.bodyForEventSchemaCall(
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
      eventHash: null,
    });
  });

  test("bodyForEventSchemaCall returns base body + event schema from avo functions", async () => {
    const eventName = "event name";
    const eventId = "event id";
    const eventHash = "event hash";
    const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

    const body = await networkHandler.bodyForEventSchemaCall(
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
      eventHash,
    });
  });

  test("bodyForSessionStartedCall does NOT exist", () => {
    expect((networkHandler as any).bodyForSessionStartedCall).toBeUndefined();
  });

  test("fixSessionAndTrackingIds does NOT exist", () => {
    expect((networkHandler as any).fixSessionAndTrackingIds).toBeUndefined();
  });

  test("POST request is not sent if event list is empty", () => {
    const events: any = [];

    networkHandler.callInspectorWithBatchBody(events, customCallback);

    expect(xhrMock.open).not.toBeCalled();
  });

  test("callInspectorWithBatchBody sends POST request", async () => {
    const eventName = "event name";
    const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

    const eventBody = await networkHandler.bodyForEventSchemaCall(
      eventName,
      eventProperties,
      null,
      null
    );

    const events = [eventBody];

    networkHandler.callInspectorWithBatchBody(events, customCallback);

    expect(xhrMock.open).toBeCalledTimes(1);
    expect(xhrMock.open).toBeCalledWith("POST", trackingEndpoint, true);

    expect(xhrMock.setRequestHeader).toBeCalledWith(
      "Content-Type",
      "application/json",
    );

    expect(xhrMock.send).toBeCalledTimes(1);
    expect(xhrMock.send).toBeCalledWith(JSON.stringify(events));

    xhrMock.onload();

    expect(customCallback).toBeCalledTimes(1);
    expect(customCallback).toBeCalledWith(null);
  });
});
