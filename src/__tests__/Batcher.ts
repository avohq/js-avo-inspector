import { AvoBatcher } from "../AvoBatcher";
import { AvoInspector } from "../AvoInspector";
import { AvoNetworkCallsHandler, type EventSchemaBody, type SessionStartedBody } from "../AvoNetworkCallsHandler";
import { AvoStorage } from "../AvoStorage";

import { defaultOptions, networkCallType } from "./constants";

const inspectorVersion = process.env.npm_package_version || "";

describe("Batcher", () => {
  let checkBatchSpy: jest.SpyInstance<any, unknown[]>;
  let inspectorCallSpy: jest.SpyInstance<any, unknown[]>;

  const { apiKey, env, version, shouldLog } = defaultOptions;

  const storage = new AvoStorage(shouldLog);
  const networkHandler = new AvoNetworkCallsHandler(
    apiKey,
    env,
    "",
    version,
    inspectorVersion
  );

  beforeAll(() => {
    checkBatchSpy = jest.spyOn(
      AvoBatcher.prototype as any,
      "checkIfBatchNeedsToBeSent"
    );

    inspectorCallSpy = jest.spyOn(
      AvoNetworkCallsHandler.prototype as any,
      "callInspectorWithBatchBody"
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);
  });

  test("handleSessionStarted adds event to storage", () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    inspector.avoBatcher.handleSessionStarted();

    const events: Array<SessionStartedBody | EventSchemaBody> | null = AvoInspector.avoStorage.getItem(AvoBatcher.cacheKey);

    expect(events).not.toBeNull();

    if (events !== null) {
      expect(events.length).toEqual(1);
      expect(events[0].type === networkCallType.SESSION_STARTED);
    }
  });

  test("handleTrackSchema adds event to storage", () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);

    inspector.avoBatcher.handleSessionStarted();
    inspector.avoBatcher.handleTrackSchema("event name", [], null, null);

    const events: Array<SessionStartedBody | EventSchemaBody> | null = AvoInspector.avoStorage.getItem(AvoBatcher.cacheKey);

    expect(events).not.toBeNull();

    if (events !== null) {
      expect(events.length).toEqual(2);
      expect(events[0].type === networkCallType.SESSION_STARTED);
      expect(events[1].type === networkCallType.EVENT);
    }
  });

  test("handleTrackSchema adds event to storage", () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);

    inspector.avoBatcher.handleTrackSchema("event name", [], null, null);
    const events: Array<SessionStartedBody | EventSchemaBody> | null = AvoInspector.avoStorage.getItem(AvoBatcher.cacheKey);

    expect(events).not.toBeNull();

    if (events !== null) {
      expect(events.length).toEqual(1);
      expect(events[0].type === networkCallType.EVENT);
    }
  });

  test("checkIfBatchNeedsToBeSent is called on Batcher initialization", async () => {
    const event = networkHandler.bodyForEventSchemaCall("name", [
      { propertyName: "prop0", propertyType: "string" }
    ], "testEventId", "testEventHash");

    storage.setItem(AvoBatcher.cacheKey, [event]);
    await new AvoBatcher(networkHandler);

    expect(checkBatchSpy).toHaveBeenCalledTimes(1);
  });

  test("checkIfBatchNeedsToBeSent is called on handleSessionStarted", () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    inspector.avoBatcher.handleSessionStarted();

    expect(checkBatchSpy).toHaveBeenCalledTimes(1);
  });

  test("checkIfBatchNeedsToBeSent is called on handleTrackSchema", () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    inspector.avoBatcher.handleSessionStarted();

    expect(checkBatchSpy).toHaveBeenCalledTimes(1);
  });

  test("Batcher saves events produced by AvoNetworkCallsHandler", async () => {
    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);

    const schemaEvent = networkHandler.bodyForEventSchemaCall("name", [
      { propertyName: "prop0", propertyType: "string" }
    ], "testEventId", "testEventHash");
    const sessionEvent = networkHandler.bodyForSessionStartedCall();

    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    inspector.avoBatcher.handleTrackSchema("name", [
      { propertyName: "prop0", propertyType: "string" }
    ], "testEventId", "testEventHash");
    inspector.avoBatcher.handleSessionStarted();

    const events: Array<SessionStartedBody | EventSchemaBody> | null = storage.getItem(AvoBatcher.cacheKey);

    expect(events).not.toBeNull();
    if (events != null) {
      expect(events[0]).not.toBe(schemaEvent);
      expect({ ...events[0], messageId: undefined, createdAt: undefined }).toStrictEqual({ ...schemaEvent, messageId: undefined, createdAt: undefined });
      expect(events[1]).not.toBe(sessionEvent);
      expect({ ...events[1], messageId: undefined, createdAt: undefined }).toStrictEqual({ ...sessionEvent, messageId: undefined, createdAt: undefined });
    }
  });

  test("Events are retrieved from Storage on init", () => {
    const getItemAsyncSpy = jest.spyOn(
      AvoStorage.prototype as any,
      "getItemAsync"
    );

    new AvoInspector(defaultOptions);

    expect(getItemAsyncSpy).toHaveBeenCalledTimes(1);
    expect(getItemAsyncSpy).toHaveBeenCalledWith(AvoBatcher.cacheKey);
  });

  test("Batch is not sent with batchSize - 1 events", () => {
    const eventCount = AvoInspector.batchSize - 1;

    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    [...Array(eventCount)].forEach(() => {
      inspector.avoBatcher.handleTrackSchema("event name", [], null, null);
    });

    expect(checkBatchSpy).toHaveBeenCalledTimes(eventCount);
    expect(inspectorCallSpy).not.toHaveBeenCalled();
  });

  test("Batch is sent when event count matches batchSize", () => {
    const eventCount = AvoInspector.batchSize;

    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    [...Array(eventCount)].forEach(() => {
      inspector.avoBatcher.handleTrackSchema("event name", [], null, null);
    });

    const events = storage.getItem(AvoBatcher.cacheKey);

    expect(checkBatchSpy).toHaveBeenCalledTimes(eventCount);
    expect(inspectorCallSpy).toHaveBeenCalledTimes(1);
    expect(inspectorCallSpy).toHaveBeenCalledWith(events, expect.any(Function));
  });

  test("Batch is sent only one time for batchSize + 1 events", () => {
    const eventCount = AvoInspector.batchSize + 1;

    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);
    let events: any = [];

    [...Array(eventCount)].forEach((_, i) => {
      inspector.avoBatcher.handleTrackSchema("event name", [], null, null);

      if (i === AvoInspector.batchSize - 1) {
        events = storage.getItem(AvoBatcher.cacheKey);
      }
    });

    expect(checkBatchSpy).toHaveBeenCalledTimes(eventCount);
    expect(inspectorCallSpy).toHaveBeenCalledTimes(1);
    expect(inspectorCallSpy).toHaveBeenCalledWith(events, expect.any(Function));

    events = storage.getItem(AvoBatcher.cacheKey);

    expect(events.length).toBe(1);
  });

  test("Batch is not sent if batchFlushSeconds not exceeded", () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    const now = new Date();
    const dateNowSpy = jest
      .spyOn(Date, "now")
      .mockImplementation(() =>
        now.setMilliseconds(
          now.getMilliseconds() + (AvoInspector.batchFlushSeconds - 1) * 1000
        )
      );

    inspector.avoBatcher.handleTrackSchema("event name", [], null, null);

    expect(checkBatchSpy).toHaveBeenCalledTimes(1);
    expect(inspectorCallSpy).not.toHaveBeenCalled();

    dateNowSpy.mockRestore();
  });

  test("Batch is sent if batchFlushSeconds exceeded", async () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    const now = new Date();
    const dateNowSpy = jest
      .spyOn(Date, "now")
      .mockImplementation(() =>
        now.setMilliseconds(
          now.getMilliseconds() + AvoInspector.batchFlushSeconds * 1000
        )
      );

    await inspector.avoBatcher.handleTrackSchema("event name", [], null, null);

    const events = storage.getItem(AvoBatcher.cacheKey);

    expect(checkBatchSpy).toHaveBeenCalledTimes(1);
    expect(inspectorCallSpy).toHaveBeenCalledTimes(1);
    expect(inspectorCallSpy).toHaveBeenCalledWith(events, expect.any(Function));

    dateNowSpy.mockRestore();
  });

  test("Only latest 1000 events are stored in the storage", (done) => {
    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);

    const eventLimit = 1000;
    const events: Array<SessionStartedBody | EventSchemaBody> = [];

    for (let i = 0; i < eventLimit + 1; i++) {
      events.push(
        networkHandler.bodyForEventSchemaCall(`event-name-${i}`, [
          { propertyName: "prop0", propertyType: "string" }
        ], null, null)
      );
    }

    AvoInspector.avoStorage.setItem(AvoBatcher.cacheKey, events);

    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    setTimeout(() => {
      const setItemsSpy = jest.spyOn(
        AvoStorage.prototype as any,
        "setItem"
      );

      inspector.avoBatcher.handleSessionStarted();

      const savedEvents = AvoInspector.avoStorage.getItem<Array<EventSchemaBody | SessionStartedBody>>(AvoBatcher.cacheKey);

      expect(savedEvents).not.toBeNull();

      if (savedEvents !== null && savedEvents.length > 0) {
        events.push(savedEvents[savedEvents.length - 1]);
      }
      events.splice(0, 2);

      expect(setItemsSpy).toHaveBeenCalledTimes(1);
      expect(setItemsSpy).toHaveBeenCalledWith(AvoBatcher.cacheKey, events);

      done();
    }, 1000);
  });
});
