import AvoGuid from "../AvoGuid";
import { AvoNetworkCallsHandler, type BaseBody } from "../AvoNetworkCallsHandler";
import { AvoAnonymousId } from "../AvoAnonymousId";

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
      .spyOn(AvoAnonymousId as any, "anonymousId", "get")
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
      createdAt: new Date().toISOString(),
      anonymousId: mockedReturns.INSTALLATION_ID,
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
      "text/plain"
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
});
