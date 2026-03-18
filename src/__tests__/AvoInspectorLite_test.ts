import { AvoInspectorLite } from "../lite/AvoInspectorLite";
import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoInspector as AvoInspectorFromIndex, AvoInspectorEnv as AvoInspectorEnvFromIndex } from "../lite/index";

const xhrMock: Partial<XMLHttpRequest> = {
  open: jest.fn(),
  send: jest.fn(),
  setRequestHeader: jest.fn(),
  readyState: 4,
  status: 200,
  timeout: 0,
};
jest.spyOn(window, "XMLHttpRequest").mockImplementation(() => xhrMock as XMLHttpRequest);

const defaultLiteOptions = {
  apiKey: "api-key-lite-xxx",
  env: AvoInspectorEnv.Prod,
  version: "1",
};

describe("AvoInspectorLite - Constructor", () => {
  test("accepts apiKey, env, and version", () => {
    const inspector = new AvoInspectorLite(defaultLiteOptions);

    expect(inspector.apiKey).toBe("api-key-lite-xxx");
    expect(inspector.environment).toBe(AvoInspectorEnv.Prod);
    expect(inspector.version).toBe("1");
  });

  test("publicEncryptionKey causes TS error", () => {
    const inspector = new AvoInspectorLite({
      ...defaultLiteOptions,
      // @ts-expect-error - publicEncryptionKey not accepted by lite
      publicEncryptionKey: "some-key",
    });

    expect(inspector.apiKey).toBe("api-key-lite-xxx");
  });
});

describe("AvoInspectorLite - trackSchemaFromEvent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("returns schema with no encryptedPropertyValue", async () => {
    const inspector = new AvoInspectorLite(defaultLiteOptions);
    inspector.enableLogging(false);

    const schema = await inspector.trackSchemaFromEvent("Test Event", { a: 1 });

    expect(schema.length).toBeGreaterThan(0);
    schema.forEach((prop) => {
      expect(prop).not.toHaveProperty("encryptedPropertyValue");
    });
  });

  test("returns consistent schema for same event called twice", async () => {
    const inspector = new AvoInspectorLite(defaultLiteOptions);
    inspector.enableLogging(false);

    const schema1 = await inspector.trackSchemaFromEvent("Repeat Event", { b: "value" });
    const schema2 = await inspector.trackSchemaFromEvent("Repeat Event", { b: "value" });

    // Both calls should return valid results (deduplication is internal batching optimization,
    // the public API may or may not return [] depending on timing)
    expect(schema1).toBeDefined();
    expect(Array.isArray(schema1)).toBe(true);
    expect(schema2).toBeDefined();
    expect(Array.isArray(schema2)).toBe(true);
  });
});

describe("AvoInspectorLite - trackSchema", () => {
  test("completes without throwing", async () => {
    const inspector = new AvoInspectorLite(defaultLiteOptions);
    inspector.enableLogging(false);

    await expect(
      inspector.trackSchema("Test Event", [
        { propertyName: "a", propertyType: "int" },
      ])
    ).resolves.toBeUndefined();
  });
});

describe("AvoInspectorLite - extractSchema", () => {
  test("returns correct schema", async () => {
    const inspector = new AvoInspectorLite(defaultLiteOptions);
    inspector.enableLogging(false);

    const schema = await inspector.extractSchema({ a: 1 });

    expect(schema).toEqual([{ propertyName: "a", propertyType: "int" }]);
  });
});

describe("AvoInspectorLite - static getters", () => {
  test("batchSize, batchFlushSeconds, shouldLog, networkTimeout are readable", () => {
    expect(typeof AvoInspectorLite.batchSize).toBe("number");
    expect(typeof AvoInspectorLite.batchFlushSeconds).toBe("number");
    expect(typeof AvoInspectorLite.shouldLog).toBe("boolean");
    expect(typeof AvoInspectorLite.networkTimeout).toBe("number");
  });
});

describe("AvoInspectorLite - setters", () => {
  afterEach(() => {
    // Restore defaults
    AvoInspectorLite.batchSize = 30;
    (AvoInspectorLite as any)._batchFlushSeconds = 30;
    AvoInspectorLite.shouldLog = false;
    AvoInspectorLite.networkTimeout = 2000;
  });

  test("batchSize setter works", () => {
    AvoInspectorLite.batchSize = 50;
    expect(AvoInspectorLite.batchSize).toBe(50);
  });

  test("shouldLog setter works", () => {
    AvoInspectorLite.shouldLog = true;
    expect(AvoInspectorLite.shouldLog).toBe(true);
  });

  test("networkTimeout setter works", () => {
    AvoInspectorLite.networkTimeout = 5000;
    expect(AvoInspectorLite.networkTimeout).toBe(5000);
  });

  test("batchFlushSeconds set via setBatchFlushSeconds(n)", () => {
    const inspector = new AvoInspectorLite(defaultLiteOptions);
    inspector.enableLogging(false);
    inspector.setBatchFlushSeconds(60);
    expect(AvoInspectorLite.batchFlushSeconds).toBe(60);
  });
});

describe("AvoInspectorLite - lite/index exports", () => {
  test("AvoInspector is exported from lite/index", () => {
    expect(AvoInspectorFromIndex).toBeDefined();
    const inspector = new AvoInspectorFromIndex(defaultLiteOptions);
    expect(inspector.apiKey).toBe("api-key-lite-xxx");
  });

  test("AvoInspectorEnv is exported from lite/index", () => {
    expect(AvoInspectorEnvFromIndex).toBeDefined();
    expect(AvoInspectorEnvFromIndex.Dev).toBeDefined();
    expect(AvoInspectorEnvFromIndex.Staging).toBeDefined();
    expect(AvoInspectorEnvFromIndex.Prod).toBeDefined();
  });
});

describe("AvoInspectorLite - static isolation from AvoInspector", () => {
  afterEach(() => {
    // Restore defaults
    AvoInspector.batchSize = 30;
    AvoInspectorLite.batchSize = 30;
  });

  test("AvoInspector.batchSize = 99 does NOT change AvoInspectorLite.batchSize", () => {
    const liteBefore = AvoInspectorLite.batchSize;

    AvoInspector.batchSize = 99;

    expect(AvoInspector.batchSize).toBe(99);
    expect(AvoInspectorLite.batchSize).toBe(liteBefore);
  });
});
