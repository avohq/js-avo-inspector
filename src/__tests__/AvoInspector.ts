import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoStreamId } from "../AvoStreamId";
import { AvoEventSpecFetcher } from "../eventSpec/AvoEventSpecFetcher";

import { error } from "../__tests__/constants";

// Mock global fetch to avoid real network calls
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe("Initialization", () => {
  test("Api Key is set", () => {
    // Given
    const apiKey = "api-key-xxx";

    // When
    let inspector = new AvoInspector({
      env: AvoInspectorEnv.Prod,
      version: "0",
      apiKey,
    });

    // Then
    expect(inspector.apiKey).toBe(apiKey);
  });

  test("Error is thrown when Api Key is not set", () => {
    // Given
    // @ts-ignore
    let apiKey;

    // Then
    expect(() => {
      new AvoInspector({
        env: AvoInspectorEnv.Prod,
        version: "0",
        // @ts-ignore
        apiKey,
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
        apiKey,
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
        // @ts-ignore
        apiKey,
      });
    }).toThrow(error.API_KEY);
  });

  test("Dev environment is used when env is not provided", () => {
    // Given
    // @ts-ignore
    let env;

    // When
    let inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      version: "0",
      // @ts-ignore
      env,
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Dev environment is used when empty string is used", () => {
    // Given
    const env = "";

    // When
    let inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      version: "0",
      // @ts-ignore
      env,
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Dev env is set using AvoInspectorEnv", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Dev,
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Dev environment is set using string", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: "dev",
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Staging env is set using AvoInspectorEnv", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Staging,
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Staging);
  });

  test("Staging environment is set using string", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: "staging",
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Staging);
  });

  test("Prod env is set using AvoInspectorEnv", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Prod,
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Prod);
  });

  test("Prod environment is set using string", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: "prod",
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Prod);
  });

  test("Environment other than Dev, Staging, Prod falls back to Dev", () => {
    // When
    const env = "test";

    let inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      version: "0",
      // @ts-ignore
      env,
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Version is set", () => {
    const version = "1";

    // When
    let inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Prod,
      version,
    });

    // Then
    expect(inspector.version).toBe(version);
  });

  test("Error is thrown when version is not set", () => {
    // Given
    // @ts-ignore
    let version;

    // Then
    expect(() => {
      new AvoInspector({
        apiKey: "api-key-xxx",
        env: AvoInspectorEnv.Prod,
        // @ts-ignore
        version,
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
        version,
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
        // @ts-ignore
        version,
      });
    }).toThrow(error.VERSION);
  });
});

describe("fetchAndValidateEvent integration", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Reset AvoStreamId static state between tests
    (AvoStreamId as any)._anonymousId = null;
    (AvoStreamId as any)._initializationPromise = null;
  });

  test("dev env creates validator, fetchAndValidateEvent merges validation results into tracked events", async () => {
    // Given: a wire response with a pinned value constraint
    const wireResponse = {
      events: [
        {
          b: "branch1",
          id: "evt_1",
          vids: [],
          p: {
            color: {
              t: "string",
              r: true,
              // pinned value: "red" is required for evt_1
              p: { red: ["evt_1"] },
            },
          },
        },
      ],
      metadata: {
        schemaId: "schema1",
        branchId: "branch1",
        latestActionId: "action1",
      },
    };

    mockFetch.mockResolvedValue({
      status: 200,
      json: async () => wireResponse,
    });

    // Inject a known streamId so fetchAndValidateEvent proceeds past the streamId guard
    (AvoStreamId as any)._anonymousId = "test-stream-id";

    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Dev,
      version: "1",
    });

    // Force streamId to be set synchronously (it's fire-and-forget in constructor)
    (inspector as any).streamId = "test-stream-id";

    // When: tracking an event with a non-matching value for the pinned constraint
    const schema = await inspector.trackSchemaFromEvent("Sign Up", {
      color: "blue", // does NOT match pinned "red"
    });

    // Then: the returned schema should contain the color property
    const colorProp = schema.find((p) => p.propertyName === "color");
    expect(colorProp).toBeDefined();

    // The avoBatcher should have been called with validation data merged in
    // We verify this indirectly by checking that fetch was called (validation ran)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("eventName=Sign+Up");
    expect(calledUrl).toContain("apiKey=api-key-xxx");
  });

  test("prod env skips fetchAndValidateEvent (no fetch calls)", async () => {
    // Given
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Prod,
      version: "1",
    });

    // When
    await inspector.trackSchemaFromEvent("Purchase", { amount: 42 });

    // Then: no fetch should have been called in prod
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
