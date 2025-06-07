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
    expect(res[6].children).toMatchObject([
      {
        propertyName: "an",
        propertyType: type.STRING
      }
    ]);

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
    expect(res[0].children.length).toBe(2); // Duplicates again
    
    // Should contain the correct schema structure (with duplicates)
    expect(res[0].children[0]).toEqual([
      { propertyName: "name", propertyType: type.STRING },
      { propertyName: "age", propertyType: type.INT }
    ]);
    expect(res[0].children[1]).toEqual([
      { propertyName: "name", propertyType: type.STRING },
      { propertyName: "age", propertyType: type.INT }
    ]);
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

  test("REPRODUCE BUG: Array of objects returning empty children", () => {
    // This test should reproduce the customer-reported bug where they get empty children
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

  test("INVESTIGATE: What happens to empty arrays in removeDuplicates", () => {
    // Simulate what happens when we have empty objects that become empty arrays
    const eventProperties = {
      items: [{}, {}, {}] // Empty objects
    };

    const res = inspector.extractSchema(eventProperties);
    
    console.log("Before removeDuplicates logic - what do we get:");
    console.log("res[0].children =", JSON.stringify(res[0].children, null, 2));
    console.log("Length:", res[0].children.length);
    
    // Let's see if removeDuplicates would work correctly on [[], [], []]
    const testArray: any[][] = [[], [], []];
    console.log("Test with includes:");
    console.log("testArray[0] === testArray[1]:", testArray[0] === testArray[1]); // false
    console.log("testArray.includes(testArray[0]):", testArray.includes(testArray[0])); // true
    console.log("Empty array includes test:", [].includes([] as never)); // false - different instances
    
    // The bug: objects.includes(item) for empty arrays fails because [] !== []
    // But objects.push(item) returns the new length (truthy), so filter keeps it
  });

  test("DEBUG: Step through extractSchema mapping logic", () => {
    // Test different scenarios to see where empty children come from
    
    // Scenario 1: Array with actual objects
    console.log("=== Scenario 1: Array with objects ===");
    const scenario1 = { items: [{ name: "test" }] };
    const result1 = inspector.extractSchema(scenario1);
    console.log("Result1 children:", JSON.stringify(result1[0].children, null, 2));
    
    // Scenario 2: Array with empty objects  
    console.log("=== Scenario 2: Array with empty objects ===");
    const scenario2 = { items: [{}] };
    const result2 = inspector.extractSchema(scenario2);
    console.log("Result2 children:", JSON.stringify(result2[0].children, null, 2));
    
    // Scenario 3: Array with objects that have only null/undefined values
    console.log("=== Scenario 3: Array with null/undefined objects ===");
    const scenario3 = { items: [{ prop: null }] };
    const result3 = inspector.extractSchema(scenario3);
    console.log("Result3 children:", JSON.stringify(result3[0].children, null, 2));
    
    // Scenario 4: Array with mixed objects (some empty, some not)
    console.log("=== Scenario 4: Mixed array ===");
    const scenario4 = { items: [{}, { name: "test" }] };
    const result4 = inspector.extractSchema(scenario4);
    console.log("Result4 children:", JSON.stringify(result4[0].children, null, 2));
    
    // Check if any of these result in truly empty children arrays
    const hasEmptyChildren = [result1, result2, result3, result4].some(
      r => r[0].children.length === 0
    );
    
    if (hasEmptyChildren) {
      console.log("FOUND IT: One scenario produces empty children!");
    }
  });

  test("REPRODUCE CUSTOMER BUG: Array of objects with properties that get filtered out", () => {
    // Maybe the issue is with objects that have properties but they get filtered out somehow
    
    // Test case 1: Objects with only non-enumerable properties
    const obj1 = {};
    Object.defineProperty(obj1, 'hiddenProp', {
      value: 'test',
      enumerable: false // This won't show up in for...in loop
    });
    
    const scenario1 = { items: [obj1, obj1] };
    const result1 = inspector.extractSchema(scenario1);
    console.log("=== Non-enumerable properties ===");
    console.log("Result1 children:", JSON.stringify(result1[0].children, null, 2));
    console.log("Length:", result1[0].children.length);
    
    // Test case 2: Multiple empty objects (the removeDuplicates bug scenario)
    const scenario2 = { items: [{}, {}, {}, {}] }; // Multiple empty objects
    const result2 = inspector.extractSchema(scenario2);
    console.log("=== Multiple empty objects ===");
    console.log("Result2 children:", JSON.stringify(result2[0].children, null, 2));
    console.log("Length:", result2[0].children.length);
    
    // The bug might be that removeDuplicates fails on empty arrays
    // and the customer ends up with an array of empty arrays that becomes truly empty
    
    if (result1[0].children.length === 0 || result2[0].children.length === 0) {
      console.log("REPRODUCED: Found empty children scenario!");
    }
  });

  test("DIRECT TEST: removeDuplicates function behavior", () => {
    // Test the removeDuplicates function directly to see the bug
    console.log("=== Testing removeDuplicates directly ===");
    
    // Simulate the array that would be passed to removeDuplicates
    const emptyArrays = [[], [], []];
    console.log("Input to removeDuplicates:", JSON.stringify(emptyArrays));
    
    // Access the private method via any cast for testing
    const result = (AvoSchemaParser as any).removeDuplicates(emptyArrays);
    console.log("Output from removeDuplicates:", JSON.stringify(result));
    console.log("Length after removeDuplicates:", result.length);
    
    // This should show us exactly what removeDuplicates does with empty arrays
    if (result.length === 0) {
      console.log("FOUND IT: removeDuplicates returns empty array!");
    } else if (result.length === emptyArrays.length) {
      console.log("BUG CONFIRMED: removeDuplicates doesn't deduplicate empty arrays");
    } else {
      console.log("UNEXPECTED: removeDuplicates behavior is different than expected");
    }
  });

  test("ACTUAL CUSTOMER BUG: Exception in schema parsing causes empty children", () => {
    // This reproduces the real customer issue - exceptions cause empty arrays
    console.log("=== Testing exception handling in AvoInspector ===");
    
    // Create objects that cause circular reference errors
    const circularObj1: any = { name: "test" };
    circularObj1.self = circularObj1;
    
    const circularObj2: any = { id: 123 };
    circularObj2.ref = circularObj2;
    
    const problematicData = {
      items: [circularObj1, circularObj2]
    };
    
    // This should trigger the exception path in AvoInspector.extractSchema
    const result = inspector.extractSchema(problematicData);
    
    console.log("Result from problematic data:", JSON.stringify(result));
    console.log("Length:", result.length);
    
    // Check if we get empty array due to exception
    if (result.length === 0) {
      console.log("REPRODUCED: Exception causes completely empty result!");
    } else if (result.length > 0 && result[0].children && result[0].children.length === 0) {
      console.log("REPRODUCED: Exception causes empty children array!");
    }
    
    // Also test with very deep nested objects that might cause stack overflow
    const deepObj: any = {};
    let current = deepObj;
    for (let i = 0; i < 1000; i++) {
      current.next = {};
      current = current.next;
    }
    
    const deepData = { items: [deepObj] };
    const deepResult = inspector.extractSchema(deepData);
    
    console.log("Deep nesting result:", JSON.stringify(deepResult));
    
    if (deepResult.length === 0) {
      console.log("REPRODUCED: Deep nesting causes empty result!");
    }
  });
});
