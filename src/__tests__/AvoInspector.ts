import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";

import { error } from "../__tests__/constants";

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
    // @ts-expect-error
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
    // @ts-expect-error
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
