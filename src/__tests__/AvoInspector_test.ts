import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoNetworkCallsHandler } from "../AvoNetworkCallsHandler";
import { AvoEventSpecFetcher } from "../eventSpec/AvoEventSpecFetcher";
import { EventSpecCache } from "../eventSpec/AvoEventSpecCache";
import type { EventSpecResponse } from "../eventSpec/AvoEventSpecFetchTypes";

import { error } from "../__tests__/constants";

// Mocked so the validated/immediate-send path (fetchAndValidateEvent) can be
// driven deterministically. Mirrors ValidationIntegration_test.ts's setup.
jest.mock("../AvoStorage", () => ({
  AvoStorage: jest.fn().mockImplementation(() => ({
    isInitialized: jest.fn().mockReturnValue(true),
    getItemAsync: jest.fn().mockResolvedValue(null),
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn()
  }))
}));
jest.mock("../eventSpec/AvoEventSpecFetcher");
jest.mock("../eventSpec/AvoEventSpecCache");

const mockEventSpecResponse: EventSpecResponse = {
  events: [
    {
      branchId: "main",
      baseEventId: "evt_test",
      variantIds: [],
      props: {
        required_prop: {
          type: "string",
          required: true
        }
      }
    }
  ],
  metadata: {
    schemaId: "schema_123",
    branchId: "main",
    latestActionId: "action_456"
  }
};

describe("Initialization", () => {
  test("Api Key is set", () => {
    // Given
    const apiKey = "api-key-xxx";

    // When
    const inspector = new AvoInspector({
      env: AvoInspectorEnv.Prod,
      version: "0",
      apiKey
    });

    // Then
    expect(inspector.apiKey).toBe(apiKey);
  });

  test("Error is thrown when Api Key is not set", () => {
    // Given
    let apiKey;

    // Then
    expect(() => {
      new AvoInspector({
        env: AvoInspectorEnv.Prod,
        version: "0",
        // @ts-expect-error
        apiKey
      });
    }).toThrow(error.API_KEY);
  });

  test("Error is thrown when empty Api Key is used", () => {
    // Given
    const apiKey = " ";

    // Then
    expect(() => {
      new AvoInspector({
        env: AvoInspectorEnv.Prod,
        version: "0",
        apiKey
      });
    }).toThrow(error.API_KEY);
  });

  test("Error is thrown when Api Key is set to null", () => {
    // Given
    const apiKey = null;

    // Then
    expect(() => {
      new AvoInspector({
        env: AvoInspectorEnv.Prod,
        version: "0",
        // @ts-expect-error
        apiKey
      });
    }).toThrow(error.API_KEY);
  });

  test("Dev environment is used when env is not provided", () => {
    // Given
    let env;

    // When
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      version: "0",
      // @ts-expect-error
      env
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Dev environment is used when empty string is used", () => {
    // Given
    const env = "";

    // When
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      version: "0",
      // @ts-expect-error
      env
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Dev env is set using AvoInspectorEnv", () => {
    // When
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Dev,
      version: "0"
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Dev environment is set using string", () => {
    // When
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: "dev",
      version: "0"
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Staging env is set using AvoInspectorEnv", () => {
    // When
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Staging,
      version: "0"
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Staging);
  });

  test("Staging environment is set using string", () => {
    // When
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: "staging",
      version: "0"
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Staging);
  });

  test("Prod env is set using AvoInspectorEnv", () => {
    // When
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Prod,
      version: "0"
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Prod);
  });

  test("Prod environment is set using string", () => {
    // When
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: "prod",
      version: "0"
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Prod);
  });

  test("Environment other than Dev, Staging, Prod falls back to Dev", () => {
    // When
    const env = "test";

    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      version: "0",
      // @ts-expect-error
      env
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Version is set", () => {
    const version = "1";

    // When
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Prod,
      version
    });

    // Then
    expect(inspector.version).toBe(version);
  });

  test("Error is thrown when version is not set", () => {
    // Given
    let version;

    // Then
    expect(() => {
      new AvoInspector({
        apiKey: "api-key-xxx",
        env: AvoInspectorEnv.Prod,
        // @ts-expect-error
        version
      });
    }).toThrow(error.VERSION);
  });

  test("Error is thrown when version is set to empty string", () => {
    // Given
    const version = " ";

    // Then
    expect(() => {
      new AvoInspector({
        apiKey: "api-key-xxx",
        env: AvoInspectorEnv.Prod,
        version
      });
    }).toThrow(error.VERSION);
  });

  test("Error is thrown when version is set to null", () => {
    // Given
    const version = null;

    // Then
    expect(() => {
      new AvoInspector({
        apiKey: "api-key-xxx",
        env: AvoInspectorEnv.Prod,
        // @ts-expect-error
        version
      });
    }).toThrow(error.VERSION);
  });
});

describe("TrackOptions argument acceptance", () => {
  test("trackSchemaFromEvent accepts a 3rd TrackOptions argument without throwing", async () => {
    const inspector = new AvoInspector({
      apiKey: "test-key",
      env: AvoInspectorEnv.Prod,
      version: "1.0.0"
    });

    const schema = await inspector.trackSchemaFromEvent(
      "test_event",
      { a: 1 },
      { outputReference: "meta-x7k2q", originHint: "web" }
    );

    expect(Array.isArray(schema)).toBe(true);
  });

  test("trackSchema accepts a 3rd TrackOptions argument without throwing", async () => {
    const inspector = new AvoInspector({
      apiKey: "test-key",
      env: AvoInspectorEnv.Prod,
      version: "1.0.0"
    });

    await expect(
      inspector.trackSchema(
        "test_event",
        [{ propertyName: "a", propertyType: "int" }],
        { outputReference: "meta-x7k2q", originHint: "web" }
      )
    ).resolves.toBeUndefined();
  });
});

describe("TrackOptions on the validated/immediate-send path", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (EventSpecCache as jest.Mock).mockImplementation(() => ({
      contains: jest.fn().mockReturnValue(true),
      get: jest.fn().mockReturnValue(mockEventSpecResponse),
      set: jest.fn()
    }));

    jest.mocked(AvoEventSpecFetcher).mockImplementation(() => ({
      fetch: jest.fn().mockResolvedValue(mockEventSpecResponse)
    }) as any);
  });

  test("bodyForEventSchemaCall is called with options as the 7th arg and the immediately-sent body carries the hint fields", async () => {
    const inspector = new AvoInspector({
      apiKey: "test-key",
      env: AvoInspectorEnv.Dev,
      version: "1.0.0"
    });

    const bodyForEventSchemaCallSpy = jest.spyOn(
      AvoNetworkCallsHandler.prototype as any,
      "bodyForEventSchemaCall"
    );

    const callInspectorImmediatelySpy = jest
      .spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      )
      .mockImplementation((...args: any[]) => {
        args[1](null);
      });

    const options = { outputReference: "meta-x7k2q", originHint: "web" };

    await inspector.trackSchemaFromEvent(
      "test_event",
      { required_prop: "test_value" },
      options
    );

    // options forwarded as the 7th positional arg to bodyForEventSchemaCall
    expect(bodyForEventSchemaCallSpy).toHaveBeenCalledTimes(1);
    expect(bodyForEventSchemaCallSpy.mock.calls[0][6]).toEqual(options);

    // ...and the body that was actually sent immediately carries the hints
    expect(callInspectorImmediatelySpy).toHaveBeenCalledTimes(1);
    const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;
    expect(eventBody.outputReference).toBe("meta-x7k2q");
    expect(eventBody.originHint).toBe("web");

    bodyForEventSchemaCallSpy.mockRestore();
  });

  test("when the immediate send fails, the fallback avoBatcher.handleTrackSchema is called with options as the 6th arg and undefined eventSpecMetadata", async () => {
    const inspector = new AvoInspector({
      apiKey: "test-key",
      env: AvoInspectorEnv.Dev,
      version: "1.0.0"
    });

    jest
      .spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      )
      .mockImplementation((...args: any[]) => {
        args[1](new Error("Network error"));
      });

    const batcherHandleTrackSchemaSpy = jest.spyOn(
      inspector.avoBatcher,
      "handleTrackSchema"
    );

    const options = { outputReference: "meta-x7k2q", originHint: "web" };

    await inspector.trackSchemaFromEvent(
      "test_event",
      { required_prop: "test_value" },
      options
    );

    expect(batcherHandleTrackSchemaSpy).toHaveBeenCalledTimes(1);
    const call = batcherHandleTrackSchemaSpy.mock.calls[0];
    // eventSpecMetadata slot (5th arg, index 4) stays undefined on this fallback
    expect(call[4]).toBeUndefined();
    // options threaded as the 6th arg (index 5) so the hints aren't dropped
    expect(call[5]).toEqual(options);
  });
});
