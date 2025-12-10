import { AvoInspector } from "../AvoInspector";
import { defaultOptions, type } from "../__tests__/constants";

describe("Schema Parsing", () => {
  const inspector = new AvoInspector(defaultOptions);

  beforeAll(() => {
    inspector.enableLogging(false);
  });

  test("Empty array returned if eventProperties are not set", async () => {
    // @ts-expect-error
    const schema = await inspector.extractSchema();

    expect(schema).toEqual([]);
  });

  test("Record is parsed correctly", async () => {
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
    const res = await inspector.extractSchema(eventProperrtiesaRecord);

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

  test("Property types and names are set", async () => {
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
    const res = await inspector.extractSchema(eventProperties);

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

  test("Duplicated values are removed", async () => {
    // Given
    const eventProperties = {
      prop0: ["true", "false", true, 10, "true", true, 11, 10, 0.1, 0.1]
    };

    // When
    const res = await inspector.extractSchema(eventProperties);

    // Then
    expect(res[0].propertyType).toBe(type.LIST);
    expect(res[0].children).toMatchObject([
      type.STRING,
      type.BOOL,
      type.INT,
      type.FLOAT
    ]);
  });

  test("Empty and falsy values are set correctly", async () => {
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
    const res = await inspector.extractSchema(eventProperties);

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

  test("List of nested objects (like Cmd Palette Results) is parsed correctly", async () => {
    // Given - event structure matching real Avo event "Cmd Palette Results Received"
    const eventProperties = {
      "Schema Id": "schema-123",
      "Schema Name": "My Schema",
      "Schema Billing Status": "Team",
      "Branch Id": "branch-456",
      "Branch Name": "main",
      "Schema Subscription Plan": "Growth",
      "Schema Trial Plan": null,
      "Authentication Config": "Default",
      "Schema Subscription Plan Slug": "growthv2",
      "Schema Trial Plan Slug": null,
      "Schema Type": "Regular",
      "Visible Fuzzy Match Count": 5,
      "Visible Smart Result Count": 3,
      "Visible Fuzzy Match Names": ["Event A", "Event B", "Property C"],
      "Visible Smart Result Names": ["Result 1", "Result 2"],
      // This is the key property - list of nested objects
      "Visible Smart Results": [
        {
          itemName: "User Signed Up",
          itemType: "Event",
          searchResultPosition: 1,
          searchResultRanking: 0.95,
          searchTerm: "sign"
        },
        {
          itemName: "User ID",
          itemType: "Property",
          searchResultPosition: 2,
          searchResultRanking: 0.87,
          searchTerm: "sign"
        },
        {
          itemName: "Sign Out",
          itemType: null,
          searchResultPosition: 3,
          searchResultRanking: null,
          searchTerm: "sign"
        }
      ],
      // Another list of nested objects
      "Visible Fuzzy Matches": [
        {
          itemName: "Signup Flow",
          itemType: "Event",
          searchResultPosition: 1,
          searchResultRanking: 0.75,
          searchTerm: "sign"
        }
      ],
      "Cmd Palette Results Type": "Tracking plan items",
      "Client": "web",
      "Version": "2.0.0"
    };

    // When
    const res = await inspector.extractSchema(eventProperties);

    // Then - verify all properties are extracted
    expect(res.length).toBe(20);

    // Find the nested object list properties
    const visibleSmartResults = res.find(p => p.propertyName === "Visible Smart Results");
    const visibleFuzzyMatches = res.find(p => p.propertyName === "Visible Fuzzy Matches");

    // Verify they're recognized as lists
    expect(visibleSmartResults).toBeDefined();
    expect(visibleSmartResults!.propertyType).toBe(type.LIST);
    expect(visibleSmartResults!.children).toBeDefined();

    expect(visibleFuzzyMatches).toBeDefined();
    expect(visibleFuzzyMatches!.propertyType).toBe(type.LIST);
    expect(visibleFuzzyMatches!.children).toBeDefined();

    // Verify the children contain the nested object structure
    // For a list of objects, children should be an array containing
    // arrays of EventProperty objects (one for each object in the list)
    const smartResultChildren = visibleSmartResults!.children!;

    // The first object should have its properties extracted
    // Each object in the array becomes an array of EventProperty objects
    expect(smartResultChildren.length).toBeGreaterThan(0);

    // Check that we have an array of property objects for the first item
    const firstObjectProps = smartResultChildren[0];
    expect(Array.isArray(firstObjectProps)).toBe(true);

    // The array should contain the object's properties
    if (Array.isArray(firstObjectProps)) {
      expect(firstObjectProps.length).toBe(5); // itemName, itemType, searchResultPosition, searchResultRanking, searchTerm

      // Verify one of the nested properties
      const itemNameProp = firstObjectProps.find((p: any) => p.propertyName === "itemName");
      expect(itemNameProp).toBeDefined();
      expect((itemNameProp as any).propertyType).toBe(type.STRING);

      const positionProp = firstObjectProps.find((p: any) => p.propertyName === "searchResultPosition");
      expect(positionProp).toBeDefined();
      expect((positionProp as any).propertyType).toBe(type.INT);

      const rankingProp = firstObjectProps.find((p: any) => p.propertyName === "searchResultRanking");
      expect(rankingProp).toBeDefined();
      expect((rankingProp as any).propertyType).toBe(type.FLOAT);
    }
  });

  test("List of nested objects serializes correctly for API", async () => {
    // Given - simpler example focusing on the nested structure
    const eventProperties = {
      "Items": [
        { name: "Item 1", count: 10, active: true },
        { name: "Item 2", count: 20, active: false }
      ]
    };

    // When
    const res = await inspector.extractSchema(eventProperties);

    // Then
    expect(res.length).toBe(1);
    expect(res[0].propertyName).toBe("Items");
    expect(res[0].propertyType).toBe(type.LIST);

    // Verify the structure can be JSON serialized (this is what gets sent to API)
    const serialized = JSON.stringify(res);
    expect(() => JSON.parse(serialized)).not.toThrow();

    // Parse and verify structure is preserved
    const parsed = JSON.parse(serialized);
    expect(parsed[0].children).toBeDefined();
    expect(Array.isArray(parsed[0].children)).toBe(true);

    // Each child should be an array of property objects
    expect(Array.isArray(parsed[0].children[0])).toBe(true);
    expect(parsed[0].children[0].length).toBe(3); // name, count, active
  });

  test("Full Cmd Palette event JSON structure is correct for API", async () => {
    // Given - the exact structure from the bug report
    const eventProperties = {
      "Schema Id": "schema-123",
      "Schema Name": "My Schema",
      "Schema Billing Status": "Team",
      "Branch Id": "branch-456",
      "Branch Name": "main",
      "Visible Smart Results": [
        {
          itemName: "User Signed Up",
          itemType: "Event",
          searchResultPosition: 1,
          searchResultRanking: 0.95,
          searchTerm: "sign"
        }
      ],
      "Visible Fuzzy Matches": [
        {
          itemName: "Signup Flow",
          itemType: "Event",
          searchResultPosition: 1,
          searchResultRanking: 0.75,
          searchTerm: "sign"
        }
      ],
      "Client": "web",
      "Version": "2.0.0"
    };

    // When
    const schema = await inspector.extractSchema(eventProperties);
    const jsonPayload = JSON.stringify(schema, null, 2);

    // Log the full JSON for debugging
    // console.log("Full schema JSON:", jsonPayload);

    // Then - verify the schema contains all expected properties
    expect(schema.length).toBe(9);

    // Find the nested properties
    const visibleSmartResults = schema.find((p: any) => p.propertyName === "Visible Smart Results");
    const visibleFuzzyMatches = schema.find((p: any) => p.propertyName === "Visible Fuzzy Matches");

    expect(visibleSmartResults).toBeDefined();
    expect(visibleFuzzyMatches).toBeDefined();

    // Verify children are present and correctly structured
    expect(visibleSmartResults!.children).toBeDefined();
    expect(visibleSmartResults!.children!.length).toBe(1);

    // The first child should be an array of EventProperty objects
    const firstChild = visibleSmartResults!.children![0];
    expect(Array.isArray(firstChild)).toBe(true);

    // Verify the nested properties inside the first object
    if (Array.isArray(firstChild)) {
      const itemNameProp = firstChild.find((p: any) => p.propertyName === "itemName");
      expect(itemNameProp).toBeDefined();
      expect((itemNameProp as any).propertyName).toBe("itemName");
      expect((itemNameProp as any).propertyType).toBe("string");
    }

    // Verify JSON serialization is correct
    const parsed = JSON.parse(jsonPayload);
    const parsedSmartResults = parsed.find((p: any) => p.propertyName === "Visible Smart Results");

    // This is what should be sent to the API
    expect(parsedSmartResults.propertyType).toBe("list");
    expect(parsedSmartResults.children).toBeDefined();
    expect(parsedSmartResults.children.length).toBe(1);
    expect(Array.isArray(parsedSmartResults.children[0])).toBe(true);
    expect(parsedSmartResults.children[0].length).toBe(5);

    // Verify the structure of nested properties
    const nestedItemName = parsedSmartResults.children[0].find((p: any) => p.propertyName === "itemName");
    expect(nestedItemName).toEqual({
      propertyName: "itemName",
      propertyType: "string"
    });
  });
});
