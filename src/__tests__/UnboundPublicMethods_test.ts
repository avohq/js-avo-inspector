/**
 * A public track method called without its instance behaves as in 3.2.0.
 *
 * 3.2.0's `trackSchemaFromEvent` and `trackSchema` were async with the whole body
 * in a try/catch, so a call without a receiver (a destructured or passed-around
 * method) logged "something went wrong" and resolved — `[]` and `undefined` —
 * instead of throwing at the call site. The public methods now delegate to the
 * internal gateway methods, and keep that behaviour.
 */
import { AvoInspector } from "../AvoInspector";
import { AvoInspectorLite } from "../lite/AvoInspectorLite";

import "../__mocks__/xhr";

import { defaultOptions } from "./constants";

const somethingWentWrong =
  "Avo Inspector: something went wrong. Please report to support@avo.app.";

let consoleError: jest.SpyInstance;

beforeEach(() => {
  consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  jest.clearAllMocks();
});

describe.each([
  ["AvoInspector", (options: any) => new AvoInspector(options)],
  ["AvoInspectorLite", (options: any) => new AvoInspectorLite(options)]
])("%s", (_name, newInspector) => {
  test("trackSchemaFromEvent without a receiver resolves [] and logs, never throws", async () => {
    const { trackSchemaFromEvent } = newInspector(defaultOptions);

    let result: Promise<any> | undefined;
    expect(() => {
      result = (trackSchemaFromEvent as any)("Ev", { a: 1 });
    }).not.toThrow();

    await expect(result).resolves.toEqual([]);
    expect(consoleError).toHaveBeenCalledWith(somethingWentWrong, expect.any(TypeError));
  });

  test("trackSchema without a receiver resolves undefined and logs, never throws", async () => {
    const { trackSchema } = newInspector(defaultOptions);

    let result: Promise<any> | undefined;
    expect(() => {
      result = (trackSchema as any)("Ev", [{ propertyName: "a", propertyType: "int" }]);
    }).not.toThrow();

    await expect(result).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith(somethingWentWrong, expect.any(TypeError));
  });

  test("control: a bound call returns the schema and logs nothing", async () => {
    const inspector = newInspector(defaultOptions);
    inspector.enableLogging(false);

    await expect(inspector.trackSchemaFromEvent("Ev", { a: 1 })).resolves.toEqual([
      { propertyName: "a", propertyType: "int" }
    ]);
    expect(consoleError).not.toHaveBeenCalled();
  });
});
