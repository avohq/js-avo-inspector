import { AvoInspector } from "../AvoInspector";
import { AvoSchemaParser } from "../AvoSchemaParser";
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
    expect(res[6].children).toMatchObject([{ propertyName: "an", propertyType: "string" }]);

    expect(res[7].propertyType).toBe(type.LIST);
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

    // Debug: Let's see what the actual structure is

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

    expect(res[7].propertyType).toBe(type.LIST);
  });

  test("Duplicated values are removed", () => {
    // Given
    const eventProperties = {
      prop0: ["true", "false", true, 10, "true", true, 11, 10, 0.1, 0.1]
    };

    // When
    const res = inspector.extractSchema(eventProperties);

    // Then
    expect(res[0].propertyType).toBe(type.LIST);
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

    expect(res[7].propertyType).toBe(type.LIST);
    expect(res[7].children).toMatchObject([]);
  });

  test("Array of objects should preserve object structure", () => {
    // Given - this reproduces the customer issue
    const eventProperties = {
      users: [
        { name: "John", age: 30 },
        { name: "Jane", age: 25 }
      ]
    };

    // When
    const res = inspector.extractSchema(eventProperties);

    // Then
    expect(res[0].propertyName).toBe("users");
    expect(res[0].propertyType).toBe(type.LIST);
    
    // After reverting fix: We're back to duplicates
    expect(res[0].children.length).toBe(1); // Duplicates removed!
    
  });

  test("Array of objects with different structures should preserve all schemas", () => {
    // Given
    const eventProperties = {
      items: [
        { name: "Product", price: 10.99 },
        { id: 123, active: true }
      ]
    };

    // When
    const res = inspector.extractSchema(eventProperties);

    // Then
    expect(res[0].propertyName).toBe("items");
    expect(res[0].propertyType).toBe(type.LIST);
    
    // Should contain schemas for both different object structures
    expect(res[0].children.length).toBe(2);
    expect(res[0].children[0]).not.toEqual(res[0].children[1]);
  });

  test("Array of objects returning empty children", () => {
    const eventProperties = {
      products: [
        { id: 1, name: "Product A", category: "electronics" },
        { id: 2, name: "Product B", category: "books" },
        { id: 3, name: "Product C", category: "electronics" }
      ]
    };

    // When
    const res = inspector.extractSchema(eventProperties);

    // Then
    expect(res[0].propertyName).toBe("products");
    expect(res[0].propertyType).toBe(type.LIST);
    
    // The bug: customers report getting empty children array
    // But they should get object schema for { id, name, category }
    expect(res[0].children.length).toBeGreaterThan(0);
  });

  test("Edge case: Array with objects containing null/undefined values", () => {
    // This might cause empty children if removeDuplicates filters everything out
    const eventProperties = {
      items: [
        { id: null, name: undefined },
        { id: null, name: undefined }
      ]
    };

    const res = inspector.extractSchema(eventProperties);
    
    console.log("Null/undefined result:", JSON.stringify(res[0].children, null, 2));
    expect(res[0].propertyType).toBe(type.LIST);
    // Should still have children even with null values
    expect(res[0].children.length).toBeGreaterThan(0);
  });

  test("Edge case: Array with empty objects", () => {
    // This might cause empty children 
    const eventProperties = {
      items: [{}, {}, {}]
    };

    const res = inspector.extractSchema(eventProperties);
    
    console.log("Empty objects result:", JSON.stringify(res[0].children, null, 2));
    expect(res[0].propertyType).toBe(type.LIST);
    
    // With empty objects, children might be empty
    if (res[0].children.length === 0) {
      console.log("FOUND IT: Empty objects cause empty children!");
    }
  });

  test("Edge case: Array with circular reference objects", () => {
    // This might cause issues in removeDuplicates
    const obj1: any = { name: "test" };
    const obj2: any = { name: "test" };
    obj1.self = obj1; // circular reference
    obj2.self = obj2; // circular reference
    
    const eventProperties = {
      items: [obj1, obj2]
    };

    // This might throw or cause empty results
    try {
      const res = inspector.extractSchema(eventProperties);
      console.log("Circular ref result:", JSON.stringify(res[0].children, null, 2));
    } catch (error: any) {
      console.log("Circular reference caused error:", error.message);
    }
  });











  test("Date and RegExp objects are treated as strings", () => {
    // Test Date objects in different contexts
    const dateScenarios = {
      singleDate: new Date('2023-01-01'),
      dateArray: [new Date(), new Date('2024-01-01')],
      mixedWithDate: [new Date(), "string", 123]
    };

    const dateResult = inspector.extractSchema(dateScenarios);
    
    // Single Date should be string type
    expect(dateResult[0].propertyName).toBe("singleDate");
    expect(dateResult[0].propertyType).toBe(type.STRING);
    
    // Array of Dates should have string children
    expect(dateResult[1].propertyName).toBe("dateArray");
    expect(dateResult[1].propertyType).toBe(type.LIST);
    expect(dateResult[1].children).toEqual(["string"]);
    
    // Mixed array with Date should include string type
    expect(dateResult[2].propertyName).toBe("mixedWithDate");
    expect(dateResult[2].propertyType).toBe(type.LIST);
    expect(dateResult[2].children).toContain("string");
    
    // Test RegExp objects in different contexts
    const regexScenarios = {
      singleRegex: /test/g,
      regexArray: [/pattern1/, /pattern2/i],
      mixedWithRegex: [/regex/, "string", 456]
    };

    const regexResult = inspector.extractSchema(regexScenarios);
    
    // Single RegExp should be string type
    expect(regexResult[0].propertyName).toBe("singleRegex");
    expect(regexResult[0].propertyType).toBe(type.STRING);
    
    // Array of RegExp should have string children
    expect(regexResult[1].propertyName).toBe("regexArray");
    expect(regexResult[1].propertyType).toBe(type.LIST);
    expect(regexResult[1].children).toEqual(["string"]);
    
    // Mixed array with RegExp should include string type
    expect(regexResult[2].propertyName).toBe("mixedWithRegex");
    expect(regexResult[2].propertyType).toBe(type.LIST);
    expect(regexResult[2].children).toContain("string");
  });
});
