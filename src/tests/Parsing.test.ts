import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";

describe("Parsing", () => {
  process.env.BROWSER = "1";

  test("Event parsing", () => {
    // Given
    let eventProperties = {
      prop0: true,
      prop1: 1,
      prop2: "str",
      prop3: 0.5,
      prop4: undefined,
      prop5: null,
      prop6: { an: "object" },
      prop7: [
        "a",
        "list",
        { "obj in list": true, "int field": 1 },
        ["another", "list"],
      ],
    };

    // When
    let inspector = new AvoInspector({
      apiKey: "apiKey",
      env: AvoInspectorEnv.Dev,
      version: "0",
    });
    let res = inspector.extractSchema(eventProperties);

    expect(res[0].propertyType).toBe("boolean");
    expect(res[1].propertyType).toBe("int");
    expect(res[2].propertyType).toBe("string");
    expect(res[3].propertyType).toBe("float");
    expect(res[4].propertyType).toBe("null");
    expect(res[5].propertyType).toBe("null");
    expect(res[6].propertyType).toBe("object");
    expect(res[6].children).toMatchObject([
      { propertyName: "an", propertyType: "string" },
    ]);

    expect(res[7].propertyType).toBe("list");
    expect(res[7].children).toMatchObject([
      "string",
      [
        { propertyName: "obj in list", propertyType: "boolean" },
        { propertyName: "int field", propertyType: "int" },
      ],
      ["string"],
    ]);
  });
});
