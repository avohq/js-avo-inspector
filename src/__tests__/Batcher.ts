import { AvoBatcher } from "../AvoBatcher";
import { AvoInspector } from "../AvoInspector";
import { AvoNetworkCallsHandler, EventSchemaBody } from "../AvoNetworkCallsHandler";
import { AvoStorage } from "../AvoStorage";
import { AvoStreamId } from "../AvoStreamId";

import { defaultOptions, mockedReturns, networkCallType } from "./constants";

const inspectorVersion = process.env.npm_package_version || "";

jest.spyOn(AvoStreamId as any, "initialize").mockResolvedValue(mockedReturns.ANONYMOUS_ID);

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

  test("handleTrackSchema adds event to storage", async () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);

    inspector.avoBatcher.handleTrackSchema("event name", [], null, null);

    // Wait for async bodyForEventSchemaCall to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    const events: EventSchemaBody[] | null = AvoInspector.avoStorage.getItem(AvoBatcher.cacheKey);

    expect(events).not.toBeNull();

    if (events !== null) {
      expect(events.length).toEqual(1);
      expect(events[0].type === networkCallType.EVENT);
    }
  });

  test("checkIfBatchNeedsToBeSent is called on Batcher initialization", async () => {
    const event = await networkHandler.bodyForEventSchemaCall("name", [
      { propertyName: "prop0", propertyType: "string" },
    ], "testEventId", "testEventHash");

    storage.setItem(AvoBatcher.cacheKey, [event]);
    await new AvoBatcher(networkHandler);

    expect(checkBatchSpy).toHaveBeenCalledTimes(1);
  });

  test("checkIfBatchNeedsToBeSent is called on handleTrackSchema", async () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    inspector.avoBatcher.handleTrackSchema("event name", [], null, null);

    // Wait for async bodyForEventSchemaCall to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(checkBatchSpy).toHaveBeenCalledTimes(1);
  });

  test("Batcher saves events produced by AvoNetworkCallsHandler", async () => {
    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);

    const schemaEvent = await networkHandler.bodyForEventSchemaCall("name", [
      { propertyName: "prop0", propertyType: "string" },
    ], "testEventId", "testEventHash");

    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    inspector.avoBatcher.handleTrackSchema("name", [
      { propertyName: "prop0", propertyType: "string" },
    ], "testEventId", "testEventHash");

    // Wait for async bodyForEventSchemaCall to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    const events: EventSchemaBody[] | null = storage.getItem(AvoBatcher.cacheKey);

    expect(events).not.toBeNull();
    if (events != null) {
      expect(events[0]).not.toBe(schemaEvent);
      expect({...events[0], messageId: undefined, createdAt:undefined}).toStrictEqual({...schemaEvent, messageId: undefined, createdAt:undefined});
    }
  });

  test("Events are retrieved from Storage on init", () => {
    const getItemAsyncSpy = jest.spyOn(
      AvoStorage.prototype as any,
      "getItemAsync",
    );

    new AvoInspector(defaultOptions);

    expect(getItemAsyncSpy).toHaveBeenCalledTimes(1);
    expect(getItemAsyncSpy).toHaveBeenCalledWith(AvoBatcher.cacheKey);
  });

  test("Only latest 1000 events are stored in the storage", async () => {
    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);

    const eventLimit = 1000;
    let events: EventSchemaBody[] = [];

    for (let i = 0; i < eventLimit + 1; i++) {
      events.push(
        await networkHandler.bodyForEventSchemaCall(`event-name-${i}`, [
          { propertyName: `prop0`, propertyType: "string" },
        ], null, null)
      );
    }

    AvoInspector.avoStorage.setItem(AvoBatcher.cacheKey, events);

    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);

    await new Promise(resolve => setTimeout(resolve, 100));

    const setItemsSpy = jest.spyOn(
      AvoStorage.prototype as any,
      "setItem",
    );

    inspector.avoBatcher.handleTrackSchema("extra event", [], null, null);

    // Wait for async bodyForEventSchemaCall to resolve
    await new Promise(resolve => setTimeout(resolve, 50));

    const savedEvents = AvoInspector.avoStorage.getItem<EventSchemaBody[]>(AvoBatcher.cacheKey);

    expect(savedEvents).not.toBeNull();

    if (savedEvents !== null) {
      expect(savedEvents.length).toBeLessThanOrEqual(1000);
    }
  });
});
