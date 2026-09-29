/**
 * The public TypeScript surface is 3.2.0's.
 *
 * Web GTM template support (the gateway options and the client that selects the
 * v2 transport) is internal. Nothing about it may appear in the typings either
 * entry point ships: no `TrackOptions` export, no `client` constructor option,
 * no third parameter on `trackSchemaFromEvent` / `trackSchema`.
 *
 * Checked two ways, both with the TypeScript compiler in memory so no build is
 * needed: the declarations `tsc` would emit for each entry, and a consumer that
 * uses each hidden piece and must fail to compile. Each has a positive control
 * — the internal module's declarations do mention the hidden names, and a
 * consumer using only the 3.2.0 API compiles cleanly — so a scan that could not
 * see the names, or a checker that rejects everything, fails here.
 */
import * as path from "path";
import * as ts from "typescript";

const root = path.resolve(__dirname, "..", "..");
const src = path.join(root, "src");

const compilerOptions = (): ts.CompilerOptions => {
  const configFile = ts.readConfigFile(
    path.join(root, "tsconfig.json"),
    ts.sys.readFile
  );
  return ts.parseJsonConfigFileContent(configFile.config, ts.sys, root).options;
};

/** Declaration text `tsc` would emit, keyed by path relative to src/. */
const emittedDeclarations = (() => {
  let cache: Record<string, string> | null = null;
  return (): Record<string, string> => {
    if (cache !== null) return cache;
    const options: ts.CompilerOptions = {
      ...compilerOptions(),
      declaration: true,
      emitDeclarationOnly: true,
      noEmit: false,
      outDir: path.join(root, "__in_memory_dts__")
    };
    const program = ts.createProgram(
      [path.join(src, "index.ts"), path.join(src, "lite", "index.ts")],
      options
    );
    const outputs: Record<string, string> = {};
    program.emit(
      undefined,
      (fileName, text) => {
        outputs[
          path.relative(options.outDir as string, fileName).split(path.sep).join("/")
        ] = text;
      },
      undefined,
      true
    );
    cache = outputs;
    return outputs;
  };
})();

/** Compiles consumer snippets that sit in src/__tests__/ and returns each one's diagnostics. */
const diagnosticsFor = (
  snippets: Record<string, string>
): Record<string, string[]> => {
  const options = { ...compilerOptions(), noEmit: true };
  const host = ts.createCompilerHost(options);
  const files = Object.fromEntries(
    Object.entries(snippets).map(([name, code]) => [
      path.join(__dirname, `__surface_${name}__.ts`),
      code
    ])
  );
  const { getSourceFile, fileExists, readFile } = host;
  host.getSourceFile = (fileName, languageVersion, ...rest) =>
    files[fileName] !== undefined
      ? ts.createSourceFile(fileName, files[fileName], languageVersion)
      : getSourceFile.call(host, fileName, languageVersion, ...rest);
  host.fileExists = (fileName) =>
    files[fileName] !== undefined || fileExists.call(host, fileName);
  host.readFile = (fileName) =>
    files[fileName] !== undefined ? files[fileName] : readFile.call(host, fileName);

  const program = ts.createProgram(Object.keys(files), options, host);
  const result: Record<string, string[]> = {};
  Object.entries(files).forEach(([fileName], index) => {
    const name = Object.keys(snippets)[index];
    result[name] = ts
      .getPreEmitDiagnostics(program, program.getSourceFile(fileName))
      .map((d) => ts.flattenDiagnosticMessageText(d.messageText, "\n"));
  });
  return result;
};

const hiddenNames = /TrackOptions|\bclient\b|outputReference|originHint/;

describe("emitted declarations", () => {
  test.each([
    ["index.d.ts"],
    ["AvoInspector.d.ts"],
    ["lite/index.d.ts"],
    ["lite/AvoInspectorLite.d.ts"]
  ])("%s mentions none of the internal gateway names", (file) => {
    const dts = emittedDeclarations()[file];

    expect(dts).toBeDefined();
    expect(dts).not.toMatch(hiddenNames);
  });

  test("positive control: the internal handler's declarations do mention them", () => {
    const dts = emittedDeclarations()["AvoNetworkCallsHandler.d.ts"];

    expect(dts).toMatch(/export interface TrackOptions/);
    expect(dts).toMatch(/outputReference/);
  });

  test.each([["AvoInspector.d.ts"], ["lite/AvoInspectorLite.d.ts"]])(
    "%s declares the public track methods with 3.2.0's two parameters",
    (file) => {
      const dts = emittedDeclarations()[file];

      expect(dts).toContain(
        "trackSchemaFromEvent(eventName: string, eventProperties: Record<string, any>): Promise<EventProperty[]>;"
      );
      expect(dts).toMatch(
        /trackSchema\(eventName: string, eventSchema: Array<\{[^}]*\}>\): Promise<void>;/
      );
      // The constructor options are exactly 3.2.0's keys.
      expect(dts).not.toMatch(/constructor\(options: \{[^}]*client/);
    }
  );

  test.each([["index.d.ts"], ["lite/index.d.ts"]])(
    "%s exports only what 3.2.0 exported",
    (file) => {
      const exported = emittedDeclarations()
        [file].split("\n")
        .filter((line) => line.startsWith("export"));

      expect(exported).toEqual([
        expect.stringMatching(/^export \{ (AvoInspector|AvoInspectorLite as AvoInspector) \} from/),
        expect.stringMatching(
          /^export \{ AvoInspectorEnv, type AvoInspectorEnvType, type AvoInspectorEnvValueType \} from/
        )
      ]);
    }
  );
});

describe("a TypeScript consumer", () => {
  const preamble = `
import { AvoInspector, AvoInspectorEnv } from "../index";
import { AvoInspector as AvoInspectorLite } from "../lite/index";
const base = { apiKey: "key", env: AvoInspectorEnv.Prod, version: "1" };
const full = new AvoInspector(base);
const lite = new AvoInspectorLite(base);
`;

  const results = (() => {
    let cache: Record<string, string[]> | null = null;
    return () =>
      (cache ??= diagnosticsFor({
        control: `${preamble}
full.trackSchemaFromEvent("e", { a: 1 });
full.trackSchema("e", [{ propertyName: "a", propertyType: "int" }]);
lite.trackSchemaFromEvent("e", { a: 1 });
lite.trackSchema("e", [{ propertyName: "a", propertyType: "int" }]);
export {};`,
        fullThirdArgument: `${preamble}
full.trackSchemaFromEvent("e", { a: 1 }, { originHint: "web" });
export {};`,
        fullTrackSchemaThirdArgument: `${preamble}
full.trackSchema("e", [], { outputReference: "x" });
export {};`,
        liteThirdArgument: `${preamble}
lite.trackSchemaFromEvent("e", { a: 1 }, { originHint: "web" });
export {};`,
        liteTrackSchemaThirdArgument: `${preamble}
lite.trackSchema("e", [], { outputReference: "x" });
export {};`,
        fullClientOption: `${preamble}
new AvoInspector({ ...base, client: "gtm-web" });
export {};`,
        liteClientOption: `${preamble}
new AvoInspectorLite({ ...base, client: "gtm-web" });
export {};`,
        fullTrackOptionsType: `import type { TrackOptions } from "../index";
export type T = TrackOptions;`,
        liteTrackOptionsType: `import type { TrackOptions } from "../lite/index";
export type T = TrackOptions;`,
        fullInternalMethod: `${preamble}
full._trackSchemaFromEventWithOptions("e", {}, {});
export {};`,
        liteInternalMethod: `${preamble}
lite._trackSchemaWithOptions("e", [], {});
export {};`
      }));
  })();

  test("positive control: the 3.2.0 API compiles cleanly on both builds", () => {
    expect(results().control).toEqual([]);
  });

  test.each([
    ["a third argument to trackSchemaFromEvent (full)", "fullThirdArgument"],
    ["a third argument to trackSchema (full)", "fullTrackSchemaThirdArgument"],
    ["a third argument to trackSchemaFromEvent (lite)", "liteThirdArgument"],
    ["a third argument to trackSchema (lite)", "liteTrackSchemaThirdArgument"],
    ["a client constructor option (full)", "fullClientOption"],
    ["a client constructor option (lite)", "liteClientOption"],
    ["importing TrackOptions from avo-inspector", "fullTrackOptionsType"],
    ["importing TrackOptions from avo-inspector/lite", "liteTrackOptionsType"],
    ["calling the internal method (full)", "fullInternalMethod"],
    ["calling the internal method (lite)", "liteInternalMethod"]
  ])("%s does not compile", (_description, snippet) => {
    expect(results()[snippet].length).toBeGreaterThan(0);
  });
});
