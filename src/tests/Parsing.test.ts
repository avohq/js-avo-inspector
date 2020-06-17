import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";

const types = {
  STRING: "string",
  INT: "int",
  OBJECT: "object",
  FLOAT: "float",
  LIST: "list",
  BOOL: "boolean",
  NULL: "null",
  UNKNOWN: "unknown",
};

describe("Schema Parsing", () => {
  process.env.BROWSER = "1";

  const inspector = new AvoInspector({
    apiKey: "apiKey",
    env: AvoInspectorEnv.Dev,
    version: "0",
  });

  test("Empty array returned if eventProperties are not set", () => {
    // TODO: JS specific
    // @ts-ignore
    const schema = inspector.extractSchema();

    expect(schema).toEqual([]);
  });

  test("Property types and names are set", () => {
    // Given
    const eventProperties = {
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
        {
          "obj in list": true,
          "int field": 1,
        },
        ["another", "list"],
        [1, 2],
      ],
    };

    // When
    const res = inspector.extractSchema(eventProperties);

    // Then
    res.forEach(({ propertyName }, index) => {
      expect(propertyName).toBe(`prop${index}`);
    });

    expect(res[0].propertyType).toBe(types.BOOL);
    expect(res[1].propertyType).toBe(types.INT);
    expect(res[2].propertyType).toBe(types.STRING);
    expect(res[3].propertyType).toBe(types.FLOAT);
    expect(res[4].propertyType).toBe(types.NULL);
    expect(res[5].propertyType).toBe(types.NULL);

    expect(res[6].propertyType).toBe(types.OBJECT);
    expect(res[6].children).toMatchObject([
      {
        propertyName: "an",
        propertyType: types.STRING,
      },
    ]);

    expect(res[7].propertyType).toBe(types.LIST);
    expect(res[7].children).toMatchObject([
      types.STRING,
      [
        {
          propertyName: "obj in list",
          propertyType: types.BOOL,
        },
        {
          propertyName: "int field",
          propertyType: types.INT,
        },
      ],
      [types.STRING],
      [types.INT],
    ]);
  });

  test("Duplicated values are removed", () => {
    // Given
    const eventProperties = {
      prop0: ["true", "false", true, 10, "true", true, 11, 10, 0.1, 0.1],
    };

    // When
    const res = inspector.extractSchema(eventProperties);

    // Then
    expect(res[0].propertyType).toBe(types.LIST);
    expect(res[0].children).toMatchObject([
      types.STRING,
      types.BOOL,
      types.INT,
      types.FLOAT,
    ]);
  });

  test("Empty and falsy values are handled", () => {
    // Given
    const eventProperties = {
      prop0: false,
      prop1: 0,
      prop2: "",
      prop3: 0.0,
      prop4: undefined,
      prop5: null,
      prop6: {},
      prop7: [],
    };

    // When
    const res = inspector.extractSchema(eventProperties);

    // Then
    expect(res[0].propertyType).toBe(types.BOOL);
    expect(res[1].propertyType).toBe(types.INT);
    expect(res[2].propertyType).toBe(types.STRING);
    expect(res[3].propertyType).toBe(types.INT); // FIXME: int returned?
    expect(res[4].propertyType).toBe(types.NULL);
    expect(res[5].propertyType).toBe(types.NULL);

    expect(res[6].propertyType).toBe(types.OBJECT);
    expect(res[6].children).toMatchObject([]);

    expect(res[7].propertyType).toBe(types.LIST);
    expect(res[7].children).toMatchObject([]);
  });
});
