import { AvoBatcher } from "../AvoBatcher";
import { AvoInspector } from "../AvoInspector";
import { AvoNetworkCallsHandler } from "../AvoNetworkCallsHandler";
import { AvoEventSpecFetcher } from "../eventSpec/AvoEventSpecFetcher";

import { defaultOptions } from "./constants";

const inspectorVersion = process.env.npm_package_version || "";

jest.mock("../AvoBatcher");
jest.mock("../AvoStorage");
jest.mock("../eventSpec/AvoEventSpecFetcher");

describe("Batcher", () => {
  let inspector: AvoInspector;

  const { apiKey, env, version } = defaultOptions;
  const networkHandler = new AvoNetworkCallsHandler(
    apiKey,
    env,
    "",
    version,
    inspectorVersion
  );

  beforeAll(() => {
    // Mock eventSpecFetcher to return null (no spec available)
    // so the batched flow is used
    jest.mocked(AvoEventSpecFetcher).mockImplementation(() => ({
      fetch: jest.fn().mockResolvedValue(null)
    }) as any);

    inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
    // @ts-expect-error
    inspector.avoDeduplicator._clearEvents();
  });

  test("Batcher is initialized on Inspector init", () => {
    expect(AvoBatcher).toHaveBeenCalledTimes(1);
    expect(AvoBatcher).toHaveBeenCalledWith(networkHandler);
  });

  test("handleTrackSchema is called on trackSchema", async () => {
    const eventName = "event name";
    const schema = [
      {
        propertyName: "prop0",
        propertyType: "string"
      },
      {
        propertyName: "prop1",
        propertyType: "string"
      }
    ];

    await inspector.trackSchema(eventName, schema);

    expect(inspector.avoBatcher.handleTrackSchema).toHaveBeenCalledTimes(1);
    expect(inspector.avoBatcher.handleTrackSchema).toBeCalledWith(
      eventName,
      schema,
      null,
      null
    );
  });

  test("handleTrackSchema is called on trackSchemaFromEvent when no spec available", async () => {
    const eventName = "event name";
    const properties = {
      prop0: "",
      prop2: false,
      prop3: 0,
      prop4: 0.0
    };

    const schema = inspector.extractSchema(properties);

    await inspector.trackSchemaFromEvent(eventName, properties);

    expect(inspector.avoBatcher.handleTrackSchema).toHaveBeenCalledTimes(1);
    expect(inspector.avoBatcher.handleTrackSchema).toBeCalledWith(
      eventName,
      schema,
      null,
      null
    );
  });

  test("handleTrackSchema is called on _avoFunctionTrackSchemaFromEvent when no spec available", async () => {
    const eventName = "event name";
    const properties = {
      prop0: "",
      prop2: false,
      prop3: 0,
      prop4: 0.0
    };
    const eventId = "testId";
    const eventHash = "testHash";

    const schema = inspector.extractSchema(properties);

    // @ts-expect-error
    await inspector._avoFunctionTrackSchemaFromEvent(eventName, properties, eventId, eventHash);

    expect(inspector.avoBatcher.handleTrackSchema).toHaveBeenCalledTimes(1);
    expect(inspector.avoBatcher.handleTrackSchema).toBeCalledWith(
      eventName,
      schema,
      eventId,
      eventHash
    );
  });

  test("batchSize is updated", () => {
    const count = 10;

    inspector.setBatchSize(count);

    expect(AvoInspector.batchSize).toBe(count);
  });

  test("batchFlushSeconds is updated", () => {
    const seconds = 10;

    inspector.setBatchFlushSeconds(seconds);

    expect(AvoInspector.batchFlushSeconds).toBe(seconds);
  });
});
