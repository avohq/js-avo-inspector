import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";

const error = {
  API_KEY:
    "[Avo Inspector] No API key provided. Inspector can't operate without API key.",
  VERSION:
    "[Avo Inspector] No version provided. Many features of Inspector rely on versioning. Please provide comparable string version, i.e. integer or semantic.",
};

describe("Initialization", () => {
  process.env.BROWSER = "1";

  test("Api Key", () => {
    const apiKey = "apiKey";

    // When
    let inspector = new AvoInspector({
      env: AvoInspectorEnv.Prod,
      version: "0",
      apiKey,
    });

    // Then
    expect(inspector.apiKey).toBe(apiKey);
  });

  // TODO: does not compile, make a .js test against this behavior
  test("Error is thrown when Api Key is not set", () => {
    expect(() => {
      // @ts-ignore
      new AvoInspector({
        env: AvoInspectorEnv.Prod,
        version: "0",
      });
    }).toThrow(error.API_KEY);
  });

  test("Error is thrown when empty Api Key is used", () => {
    expect(() => {
      new AvoInspector({
        apiKey: " ",
        env: AvoInspectorEnv.Prod,
        version: "0",
      });
    }).toThrow(error.API_KEY);
  });

  // TODO: does not compile, make a .js test against this behavior
  test("Error is thrown when Api Key is set to null", () => {
    expect(() => {
      new AvoInspector({
        // @ts-ignore
        apiKey: null,
        env: AvoInspectorEnv.Prod,
        version: "0",
      });
    }).toThrow(error.API_KEY);
  });

  // TODO: does not compile, make a .js test against this behavior
  test("Dev environment is used when env is not provided", () => {
    // When
    // @ts-ignore
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  // TODO: does not compile, make a .js test against this behavior
  test("Dev environment is used when empty string is used", () => {
    // FIXME: empty string is set as env
    return;

    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      // @ts-ignore
      env: "",
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Dev env is set using AvoInspectorEnv", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: AvoInspectorEnv.Dev,
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Dev environment is set using string", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: "dev",
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Staging env is set using AvoInspectorEnv", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: AvoInspectorEnv.Staging,
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Staging);
  });

  test("Staging environment is set using string", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: "staging",
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Staging);
  });

  test("Prod env is set using AvoInspectorEnv", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: AvoInspectorEnv.Prod,
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Prod);
  });

  test("Prod environment is set using string", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: "prod",
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Prod);
  });

  // TODO: does not compile, make a .js test against this behavior
  // TODO: is other environmets supported
  test("Other environment is set", () => {
    // When
    const env = "test";

    let inspector = new AvoInspector({
      apiKey: "apiKey",
      version: "0",
      // @ts-ignore
      env,
    });

    // Then
    expect(inspector.environment).toBe(env);
  });

  test("Version is set", () => {
    const version = "1";

    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: AvoInspectorEnv.Prod,
      version,
    });

    // Then
    expect(inspector.version).toBe(version);
  });

  // TODO: does not compile, make a .js test against this behavior
  test("Error is thrown when version is not set", () => {
    expect(() => {
      // @ts-ignore
      new AvoInspector({
        apiKey: "api key",
        env: AvoInspectorEnv.Prod,
      });
    }).toThrow(error.VERSION);
  });

  test("Error is thrown when version is set to empty string", () => {
    expect(() => {
      new AvoInspector({
        apiKey: "api key",
        env: AvoInspectorEnv.Prod,
        version: " ",
      });
    }).toThrow(error.VERSION);
  });

  // TODO: does not compile, make a .js test against this behavior
  test("Error is thrown when version is set to null", () => {
    expect(() => {
      // @ts-ignore
      new AvoInspector({
        apiKey: "api key",
        env: AvoInspectorEnv.Prod,
        // @ts-ignore
        version: null,
      });
    }).toThrow(error.VERSION);
  });
});
