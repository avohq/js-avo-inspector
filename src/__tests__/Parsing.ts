import { AvoInspector } from "../AvoInspector";
import { defaultOptions, type } from "../__tests__/constants";

describe("Schema Parsing", () => {
  const inspector = new AvoInspector(defaultOptions);

  beforeAll(() => {
    inspector.enableLogging(false);
  });

  test("Empty array returned if eventProperties are not set", () => {
    // @ts-expect-error
    const schema = inspector.extractSchema();

    expect(schema).toEqual([]);
  });

  test("Record is parsed correctly", () => {
    // Given
    const eventProperrtiesaRecord: Record<string, unknown> = {
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
          "int field": 1
        },
        ["another", "list"],
        [1, 2]
      ]
    };

    // When
    const res = inspector.extractSchema(eventProperrtiesaRecord);

    // Then
    res.forEach(({ propertyName }, index) => {
      expect(propertyName).toBe(`prop${index}`);
    });

    expect(res.length).toBe(8);

    expect(res[0].propertyType).toBe(type.BOOL);
    expect(res[1].propertyType).toBe(type.INT);
    expect(res[2].propertyType).toBe(type.STRING);
    expect(res[3].propertyType).toBe(type.FLOAT);
    expect(res[4].propertyType).toBe(type.NULL);
    expect(res[5].propertyType).toBe(type.NULL);

    expect(res[6].propertyType).toBe(type.OBJECT);
    expect(res[6].children).toMatchObject([
      {
        propertyName: "an",
        propertyType: type.STRING
      }
    ]);

    expect(res[7].propertyType).toBe("list(string)");
    expect(res[7].children).toMatchObject([
      type.STRING,
      [
        {
          propertyName: "obj in list",
          propertyType: type.BOOL
        },
        {
          propertyName: "int field",
          propertyType: type.INT
        }
      ],
      [type.STRING],
      [type.INT]
    ]);
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
          "int field": 1
        },
        ["another", "list"],
        [1, 2]
      ]
    };

    // When
    const res = inspector.extractSchema(eventProperties);

    // Then
    res.forEach(({ propertyName }, index) => {
      expect(propertyName).toBe(`prop${index}`);
    });

    expect(res[0].propertyType).toBe(type.BOOL);
    expect(res[1].propertyType).toBe(type.INT);
    expect(res[2].propertyType).toBe(type.STRING);
    expect(res[3].propertyType).toBe(type.FLOAT);
    expect(res[4].propertyType).toBe(type.NULL);
    expect(res[5].propertyType).toBe(type.NULL);

    expect(res[6].propertyType).toBe(type.OBJECT);
    expect(res[6].children).toMatchObject([
      {
        propertyName: "an",
        propertyType: type.STRING
      }
    ]);

    expect(res[7].propertyType).toBe("list(string)");
    expect(res[7].children).toMatchObject([
      type.STRING,
      [
        {
          propertyName: "obj in list",
          propertyType: type.BOOL
        },
        {
          propertyName: "int field",
          propertyType: type.INT
        }
      ],
      [type.STRING],
      [type.INT]
    ]);
  });

  test("Duplicated values are removed", () => {
    // Given
    const eventProperties = {
      prop0: ["true", "false", true, 10, "true", true, 11, 10, 0.1, 0.1]
    };

    // When
    const res = inspector.extractSchema(eventProperties);

    // Then
    expect(res[0].propertyType).toBe("list(string)");
    expect(res[0].children).toMatchObject([
      type.STRING,
      type.BOOL,
      type.INT,
      type.FLOAT
    ]);
  });

  test("Empty and falsy values are set correctly", () => {
    // Given
    const eventProperties = {
      prop0: false,
      prop1: 0,
      prop2: "",
      prop3: 0.0,
      prop4: undefined,
      prop5: null,
      prop6: {},
      prop7: []
    };

    // When
    const res = inspector.extractSchema(eventProperties);

    // Then
    expect(res[0].propertyType).toBe(type.BOOL);
    expect(res[1].propertyType).toBe(type.INT);
    expect(res[2].propertyType).toBe(type.STRING);
    expect(res[3].propertyType).toBe(type.INT);
    expect(res[4].propertyType).toBe(type.NULL);
    expect(res[5].propertyType).toBe(type.NULL);

    expect(res[6].propertyType).toBe(type.OBJECT);
    expect(res[6].children).toMatchObject([]);

    expect(res[7].propertyType).toBe("list(unknown)");
    expect(res[7].children).toMatchObject([]);
  });

  describe("List Type Detection", () => {
    test("Empty array returns list(unknown)", () => {
      const eventProperties = {
        emptyList: []
      };

      const res = inspector.extractSchema(eventProperties);
      expect(res[0].propertyType).toBe("list(unknown)");
    });

    test("List of primitive types", () => {
      const eventProperties = {
        stringList: ["a", "b", "c"],
        numberList: [1, 2, 3],
        floatList: [1.1, 2.2, 3.3],
        booleanList: [true, false, true],
        mixedPrimitiveList: [1, "string", true, 2.5]
      };

      const res = inspector.extractSchema(eventProperties);
      expect(res[0].propertyType).toBe("list(string)");
      expect(res[1].propertyType).toBe("list(int)");
      expect(res[2].propertyType).toBe("list(float)");
      expect(res[3].propertyType).toBe("list(boolean)");
      expect(res[4].propertyType).toBe("list(int)"); // First element type
    });

    test("List of objects", () => {
      const eventProperties = {
        simpleObjectList: [{ name: "John" }, { name: "Jane" }],
        nestedObjectList: [{ user: { name: "John" } }, { user: { name: "Jane" } }],
        mixedObjectList: [{ name: "John" }, { age: 30 }]
      };

      const res = inspector.extractSchema(eventProperties);
      expect(res[0].propertyType).toBe("list(object)");
      expect(res[1].propertyType).toBe("list(object)");
      expect(res[2].propertyType).toBe("list(object)");
    });

    test("List of lists", () => {
      const eventProperties = {
        stringListList: [["a", "b"], ["c", "d"]],
        numberListList: [[1, 2], [3, 4]],
        mixedListList: [["a", 1], [true, 2.5]]
      };

      const res = inspector.extractSchema(eventProperties);
      expect(res[0].propertyType).toBe("list(list(string))");
      expect(res[1].propertyType).toBe("list(list(int))");
      expect(res[2].propertyType).toBe("list(list(string))");
    });

    test("List with null/undefined values", () => {
      const eventProperties = {
        nullFirst: [null, "string", 1],
        undefinedFirst: [undefined, "string", 1],
        mixedNulls: ["string", null, undefined, 1]
      };

      const res = inspector.extractSchema(eventProperties);
      expect(res[0].propertyType).toBe("list(string)");
      expect(res[1].propertyType).toBe("list(string)");
      expect(res[2].propertyType).toBe("list(string)");
    });

    test("List with empty objects", () => {
      const eventProperties = {
        emptyObjectFirst: [{}, { name: "John" }],
        mixedEmptyObjects: [{ name: "John" }, {}, { age: 30 }]
      };

      const res = inspector.extractSchema(eventProperties);
      expect(res[0].propertyType).toBe("list(object)");
      expect(res[1].propertyType).toBe("list(object)");
    });

    test("List with empty arrays", () => {
      const eventProperties = {
        emptyArrayFirst: [[], [1, 2, 3]],
        mixedEmptyArrays: [[1, 2], [], [3, 4]],
        consistentNestedLists: [[1, 2], [3, 4], [5, 6]],
        mixedNestedLists: [[1, 2], ["a", "b"], [true, false]]
      };

      const res = inspector.extractSchema(eventProperties);
      expect(res[0].propertyType).toBe("list(list(int))");
      expect(res[1].propertyType).toBe("list(list(int))");
      expect(res[2].propertyType).toBe("list(list(int))");
      expect(res[3].propertyType).toBe("list(list(int))"); // First element type
    });

    test("List with complex nested structures", () => {
      const eventProperties = {
        complexList: [
          {
            user: {
              name: "John",
              addresses: [
                { city: "New York", zip: 10001 },
                { city: "Boston", zip: 2108 }
              ]
            }
          },
          {
            user: {
              name: "Jane",
              addresses: [
                { city: "Chicago", zip: 60601 }
              ]
            }
          }
        ]
      };

      const res = inspector.extractSchema(eventProperties);
      expect(res[0].propertyType).toBe("list(object)");
    });

    test("List with special values", () => {
      const eventProperties = {
        specialValues: [
          Number.MAX_SAFE_INTEGER,
          Number.MIN_SAFE_INTEGER,
          Number.MAX_VALUE,
          Number.MIN_VALUE,
          Infinity,
          -Infinity,
          NaN
        ]
      };

      const res = inspector.extractSchema(eventProperties);
      expect(res[0].propertyType).toBe("list(int)");
    });
  });
});
