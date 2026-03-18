import { AvoSchemaParser } from "../lite/AvoSchemaParserLite";

describe("AvoSchemaParserLite - property types", () => {
  test("extracts string type", async () => {
    const schema = await AvoSchemaParser.extractSchema({ prop: "hello" });
    expect(schema).toEqual([{ propertyName: "prop", propertyType: "string" }]);
  });

  test("extracts int type", async () => {
    const schema = await AvoSchemaParser.extractSchema({ prop: 42 });
    expect(schema).toEqual([{ propertyName: "prop", propertyType: "int" }]);
  });

  test("extracts float type", async () => {
    const schema = await AvoSchemaParser.extractSchema({ prop: 3.14 });
    expect(schema).toEqual([{ propertyName: "prop", propertyType: "float" }]);
  });

  test("extracts boolean type", async () => {
    const schema = await AvoSchemaParser.extractSchema({ prop: true });
    expect(schema).toEqual([{ propertyName: "prop", propertyType: "boolean" }]);
  });

  test("extracts null type for null value", async () => {
    const schema = await AvoSchemaParser.extractSchema({ prop: null });
    expect(schema).toEqual([{ propertyName: "prop", propertyType: "null" }]);
  });

  test("extracts null type for undefined value", async () => {
    const schema = await AvoSchemaParser.extractSchema({ prop: undefined });
    expect(schema).toEqual([{ propertyName: "prop", propertyType: "null" }]);
  });

  test("extracts list type for array", async () => {
    const schema = await AvoSchemaParser.extractSchema({ prop: [1, 2, 3] });
    expect(schema[0].propertyName).toBe("prop");
    expect(schema[0].propertyType).toBe("list");
  });

  test("extracts object type for plain object", async () => {
    const schema = await AvoSchemaParser.extractSchema({ prop: { key: "val" } });
    expect(schema[0].propertyName).toBe("prop");
    expect(schema[0].propertyType).toBe("object");
  });

  test("returns [] for null eventProperties", async () => {
    // @ts-expect-error
    const schema = await AvoSchemaParser.extractSchema(null);
    expect(schema).toEqual([]);
  });

  test("returns [] for undefined eventProperties", async () => {
    // @ts-expect-error
    const schema = await AvoSchemaParser.extractSchema(undefined);
    expect(schema).toEqual([]);
  });
});

describe("AvoSchemaParserLite - no encryptedPropertyValue", () => {
  test("never sets encryptedPropertyValue", async () => {
    const schema = await AvoSchemaParser.extractSchema(
      { prop: "value" }
    );

    expect(schema.length).toBeGreaterThan(0);
    schema.forEach((entry) => {
      expect(entry).not.toHaveProperty("encryptedPropertyValue");
    });
  });

  test("string prop has no encryptedPropertyValue", async () => {
    const schema = await AvoSchemaParser.extractSchema({ name: "Alice" });
    expect(schema[0]).not.toHaveProperty("encryptedPropertyValue");
  });
});

describe("AvoSchemaParserLite - nested objects", () => {
  test("extracts nested object properties as children", async () => {
    const schema = await AvoSchemaParser.extractSchema({
      parent: { child: "value" },
    });

    expect(schema[0].propertyName).toBe("parent");
    expect(schema[0].propertyType).toBe("object");
    expect(schema[0].children).toBeDefined();
    expect(schema[0].children).toMatchObject([
      { propertyName: "child", propertyType: "string" },
    ]);
  });

  test("extracts deeply nested objects", async () => {
    const schema = await AvoSchemaParser.extractSchema({
      level1: { level2: { level3: 42 } },
    });

    expect(schema[0].propertyType).toBe("object");
    const level2 = (schema[0].children as any[])[0];
    expect(level2.propertyName).toBe("level2");
    expect(level2.propertyType).toBe("object");
    const level3Children = level2.children as any[];
    expect(level3Children[0].propertyName).toBe("level3");
    expect(level3Children[0].propertyType).toBe("int");
  });

  test("empty object has empty children", async () => {
    const schema = await AvoSchemaParser.extractSchema({ obj: {} });
    expect(schema[0].propertyType).toBe("object");
    expect(schema[0].children).toEqual([]);
  });
});

describe("AvoSchemaParserLite - arrays/lists", () => {
  test("extracts list of primitive types as children strings", async () => {
    const schema = await AvoSchemaParser.extractSchema({ items: ["a", "b", "c"] });

    expect(schema[0].propertyName).toBe("items");
    expect(schema[0].propertyType).toBe("list");
    expect(schema[0].children).toContain("string");
  });

  test("deduplicates repeated primitive types in arrays", async () => {
    const schema = await AvoSchemaParser.extractSchema({
      nums: [1, 2, 3, 4],
    });

    expect(schema[0].propertyType).toBe("list");
    // Should only have "int" once (deduplication)
    const children = schema[0].children as string[];
    expect(children.filter((c) => c === "int").length).toBe(1);
  });

  test("extracts list of objects as children arrays", async () => {
    const schema = await AvoSchemaParser.extractSchema({
      items: [
        { name: "Item 1", count: 10 },
        { name: "Item 2", count: 20 },
      ],
    });

    expect(schema[0].propertyType).toBe("list");
    const children = schema[0].children as any[];
    expect(Array.isArray(children)).toBe(true);
    expect(children.length).toBeGreaterThan(0);

    // Each child is an array of EventProperty
    expect(Array.isArray(children[0])).toBe(true);
    const firstObjProps = children[0] as any[];
    const nameProp = firstObjProps.find((p) => p.propertyName === "name");
    expect(nameProp).toBeDefined();
    expect(nameProp.propertyType).toBe("string");
  });

  test("empty array has empty children", async () => {
    const schema = await AvoSchemaParser.extractSchema({ arr: [] });
    expect(schema[0].propertyType).toBe("list");
    expect(schema[0].children).toEqual([]);
  });

  test("mixed-type array contains all distinct types", async () => {
    const schema = await AvoSchemaParser.extractSchema({
      mixed: ["text", 42, true],
    });

    expect(schema[0].propertyType).toBe("list");
    const children = schema[0].children as string[];
    expect(children).toContain("string");
    expect(children).toContain("int");
    expect(children).toContain("boolean");
  });
});
