import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";

describe("Initialization", () => {

  process.env.BROWSER = "1";

  test("Api Key", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: AvoInspectorEnv.Prod,
      version: "0",
    });

    // Then
    expect(inspector.apiKey).toBe("apiKey");
  });

  // XXX TODO does not compile, make a .js test against this behavior
  // test("Undefined api key", () => {
  //   try {
  //     new AvoInspector(undefined, AvoInspectorEnv.Prod, "0");
  //     throw Error(
  //       "Avo Inspector should throw an error if init without api key"
  //     );
  //   } catch (e) {
  //     expect(e.message).toMatch(
  //       "[Avo Inspector] No API key provided. Inspector can't operate without API key."
  //     );
  //   }
  // });

  test("Empty api key", () => {
    try {
      new AvoInspector({
        apiKey: "   ",
        env: AvoInspectorEnv.Prod,
        version: "0",
      });
      throw Error(
        "Avo Inspector should throw an error if init with empty api key"
      );
    } catch (e) {
      expect(e.message).toMatch(
        "[Avo Inspector] No API key provided. Inspector can't operate without API key."
      );
    }
  });

  // XXX TODO does not compile, make a .js test against this behavior
  // test("Null api key", () => {
  //   try {
  //     new AvoInspector(null, AvoInspectorEnv.Prod, "0");
  //     throw Error(
  //       "Avo Inspector should throw an error if init with null api key"
  //     );
  //   } catch (e) {
  //     expect(e.message).toMatch(
  //       "[Avo Inspector] No API key provided. Inspector can't operate without API key."
  //     );
  //   }
  // });

  // XXX TODO does not compile, make a .js test against this behavior
  // test("No Env", () => {
  //   // When
  //   let inspector = new AvoInspector("apiKey", undefined, "0");
  //   // Then
  //   expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  // });

  test("Prod", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: AvoInspectorEnv.Prod,
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Prod);
  });

  test("Prod string", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: "prod",
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Prod);
  });

  test("Dev", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: AvoInspectorEnv.Dev,
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Dev string", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: "dev",
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Dev);
  });

  test("Staging", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: AvoInspectorEnv.Staging,
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Staging);
  });

  test("Staging string", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: "staging",
      version: "0",
    });

    // Then
    expect(inspector.environment).toBe(AvoInspectorEnv.Staging);
  });

  test("Version", () => {
    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: AvoInspectorEnv.Prod,
      version: "1",
    });

    // Then
    expect(inspector.version).toBe("1");
  });

  // XXX TODO does not compile, make a .js test against this behavior
  // test("Undefined version", () => {
  //   try {
  //     new AvoInspector("api key", AvoInspectorEnv.Prod, undefined);
  //     throw Error(
  //       "Avo Inspector should throw an error if no version is provided"
  //     );
  //   } catch (e) {
  //     expect(e.message).toMatch(
  //       "[Avo Inspector] No version provided. Many features of Inspector rely on versioning. Please provide comparable string version, i.e. integer or semantic."
  //     );
  //   }
  // });

  test("Empty version", () => {
    try {
      new AvoInspector({
        apiKey: "api key",
        env: AvoInspectorEnv.Prod,
        version: " ",
      });
      throw Error(
        "Avo Inspector should throw an error if no version is provided"
      );
    } catch (e) {
      expect(e.message).toMatch(
        "[Avo Inspector] No version provided. Many features of Inspector rely on versioning. Please provide comparable string version, i.e. integer or semantic."
      );
    }
  });

  // XXX TODO does not compile, make a .js test against this behavior
  // test("Null version", () => {
  //   try {
  //     new AvoInspector("api key", AvoInspectorEnv.Prod, null);
  //     throw Error(
  //       "Avo Inspector should throw an error if no version is provided"
  //     );
  //   } catch (e) {
  //     expect(e.message).toMatch(
  //       "[Avo Inspector] No version provided. Many features of Inspector rely on versioning. Please provide comparable string version, i.e. integer or semantic."
  //     );
  //   }
  // });
});
