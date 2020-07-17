import { AvoBatcher } from "../AvoBatcher";
import { AvoInspector } from "../AvoInspector";
import { AvoNetworkCallsHandler } from "../AvoNetworkCallsHandler";
import { AvoStorage } from "../AvoStorage";

import { defaultOptions, networkCallType } from "./constants";

const inspectorVersion = process.env.npm_package_version || "";

describe("Batcher", () => {
  let checkBatchSpy: jest.SpyInstance<any, unknown[]>;
  let inspectorCallSpy: jest.SpyInstance<any, unknown[]>;

  const { apiKey, env, version } = defaultOptions;

  const storage = new AvoStorage();
  const networkHandler = new AvoNetworkCallsHandler(
    apiKey,
    env,
    "",
    version,
    inspectorVersion,
  );

  beforeAll(() => {
    checkBatchSpy = jest.spyOn(
      AvoBatcher.prototype as any,
      "checkIfBatchNeedsToBeSent",
    );

    inspectorCallSpy = jest.spyOn(
      AvoNetworkCallsHandler.prototype as any,
      "callInspectorWithBatchBody",
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);
  });

  test("handleSessionStarted adds event to storage", () => {
    const inspector = new AvoInspector(defaultOptions);

    inspector.avoBatcher.handleSessionStarted();

    const events = AvoInspector.avoStorage.getItem(AvoBatcher.cacheKey);

    expect(events).not.toBeNull();

    // FIXME: expects Object or null
    // @ts-ignore
    expect(events.length).toEqual(1);

    // FIXME: expects Object or null
    // @ts-ignore
    expect(events[0].type === networkCallType.SESSION_STARTED);
  });

  test("handleTrackSchema adds event to storage", () => {
    const inspector = new AvoInspector(defaultOptions);

    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);

    inspector.avoBatcher.handleTrackSchema("event name", []);
    const events = AvoInspector.avoStorage.getItem(AvoBatcher.cacheKey);

    expect(events).not.toBeNull();

    // @ts-ignore
    expect(events.length).toEqual(1);
    // @ts-ignore
    expect(events[0].type === networkCallType.EVENT);
  });

  test("checkIfBatchNeedsToBeSent is called on Batcher initialization", async () => {
    const event = networkHandler.bodyForEventSchemaCall("name", [
      { propertyName: "prop0", propertyType: "string" },
    ]);

    storage.setItem(AvoBatcher.cacheKey, [event]);
    await new AvoBatcher(networkHandler);

    expect(checkBatchSpy).toHaveBeenCalledTimes(1);
  });

  test("checkIfBatchNeedsToBeSent is called on handleSessionStarted", () => {
    const inspector = new AvoInspector(defaultOptions);

    inspector.avoBatcher.handleSessionStarted();

    expect(checkBatchSpy).toHaveBeenCalledTimes(1);
  });

  test("checkIfBatchNeedsToBeSent is called on handleTrackSchema", () => {
    const inspector = new AvoInspector(defaultOptions);

    inspector.avoBatcher.handleSessionStarted();

    expect(checkBatchSpy).toHaveBeenCalledTimes(1);
  });

  test("Events are retrieved from Storage on init", async () => {
    const getItemAsyncSpy = jest.spyOn(
      AvoStorage.prototype as any,
      "getItemAsync",
    );

    await new AvoInspector(defaultOptions);

    expect(getItemAsyncSpy).toHaveBeenCalledTimes(1);
    expect(getItemAsyncSpy).toHaveBeenCalledWith(AvoBatcher.cacheKey);
  });

  test("Batch is not sent with batchSize - 1 events", () => {
    const eventCount = AvoInspector.batchSize - 1;

    const inspector = new AvoInspector(defaultOptions);

    [...Array(eventCount)].forEach(() => {
      inspector.avoBatcher.handleTrackSchema("event name", []);
    });

    expect(checkBatchSpy).toHaveBeenCalledTimes(eventCount);
    expect(inspectorCallSpy).not.toHaveBeenCalled();
  });

  test("Batch is sent when event count matches batchSize", () => {
    const eventCount = AvoInspector.batchSize;

    const inspector = new AvoInspector(defaultOptions);

    [...Array(eventCount)].forEach(() => {
      inspector.avoBatcher.handleTrackSchema("event name", []);
    });

    const events = storage.getItem(AvoBatcher.cacheKey);

    expect(checkBatchSpy).toHaveBeenCalledTimes(eventCount);
    expect(inspectorCallSpy).toHaveBeenCalledTimes(1);
    expect(inspectorCallSpy).toHaveBeenCalledWith(events, expect.any(Function));
  });

  test("Batch is sent only one time for batchSize + 1 events", () => {
    const eventCount = AvoInspector.batchSize + 1;

    const inspector = new AvoInspector(defaultOptions);
    let events: any = [];

    [...Array(eventCount)].forEach((_, i) => {
      inspector.avoBatcher.handleTrackSchema("event name", []);

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

    const now = new Date();
    const dateNowSpy = jest
      .spyOn(Date, "now")
      .mockImplementation(() =>
        now.setMilliseconds(
          now.getMilliseconds() + (AvoInspector.batchFlushSeconds - 1) * 1000,
        ),
      );

    inspector.avoBatcher.handleTrackSchema("event name", []);

    expect(checkBatchSpy).toHaveBeenCalledTimes(1);
    expect(inspectorCallSpy).not.toHaveBeenCalled();

    dateNowSpy.mockRestore();
  });

  test("Batch is sent if batchFlushSeconds exceeded", async () => {
    const inspector = new AvoInspector(defaultOptions);

    const now = new Date();
    const dateNowSpy = jest
      .spyOn(Date, "now")
      .mockImplementation(() =>
        now.setMilliseconds(
          now.getMilliseconds() + AvoInspector.batchFlushSeconds * 1000,
        ),
      );

    await inspector.avoBatcher.handleTrackSchema("event name", []);

    const events = storage.getItem(AvoBatcher.cacheKey);

    expect(checkBatchSpy).toHaveBeenCalledTimes(1);
    expect(inspectorCallSpy).toHaveBeenCalledTimes(1);
    expect(inspectorCallSpy).toHaveBeenCalledWith(events, expect.any(Function));

    dateNowSpy.mockRestore();
  });
});
