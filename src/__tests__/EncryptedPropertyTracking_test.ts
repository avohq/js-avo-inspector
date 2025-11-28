import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoEventSpecFetcher } from "../eventSpec/AvoEventSpecFetcher";
import { generateKeyPair, decryptValue } from "./helpers/encryptionHelpers";
import { type } from "./constants";

// Mock eventSpecFetcher to return null so batched flow is used
jest.mock("../eventSpec/AvoEventSpecFetcher");

describe("Encrypted Property Tracking", () => {
  // Generate a test ECC key pair
  const { publicKey: testPublicKey, privateKey: testPrivateKey } = generateKeyPair();

  beforeAll(() => {
    (AvoEventSpecFetcher as jest.Mock).mockImplementation(() => ({
      fetch: jest.fn().mockResolvedValue(null)
    }));
  });

  describe("with encryption enabled in dev environment", () => {
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Dev,
      version: "1",
      publicEncryptionKey: testPublicKey
    });

    beforeAll(() => {
      inspector.enableLogging(false);
    });

    test("should include encryptedPropertyValue for all properties", () => {
      const eventProperties = {
        stringProp: "test",
        numberProp: 42,
        booleanProp: true,
        nullProp: null
      };

      const schema = inspector.extractSchema(eventProperties);

      expect(schema.length).toBe(4);

      schema.forEach((prop) => {
        expect(prop.encryptedPropertyValue).toBeDefined();
        expect(typeof prop.encryptedPropertyValue).toBe("string");
      });
    });

    test("encrypted values should be decryptable", () => {
      const eventProperties = {
        stringProp: "test string",
        numberProp: 123,
        booleanProp: false
      };

      const schema = inspector.extractSchema(eventProperties);

      expect(schema[0].propertyName).toBe("stringProp");
      expect(schema[0].propertyType).toBe(type.STRING);
      expect(schema[0].encryptedPropertyValue).toBeDefined();
      const decrypted0 = decryptValue(schema[0].encryptedPropertyValue!, testPrivateKey);
      expect(decrypted0).toBe("test string");

      expect(schema[1].propertyName).toBe("numberProp");
      expect(schema[1].propertyType).toBe(type.INT);
      expect(schema[1].encryptedPropertyValue).toBeDefined();
      const decrypted1 = decryptValue(schema[1].encryptedPropertyValue!, testPrivateKey);
      expect(decrypted1).toBe(123);

      expect(schema[2].propertyName).toBe("booleanProp");
      expect(schema[2].propertyType).toBe(type.BOOL);
      expect(schema[2].encryptedPropertyValue).toBeDefined();
      const decrypted2 = decryptValue(schema[2].encryptedPropertyValue!, testPrivateKey);
      expect(decrypted2).toBe(false);
    });

    test("should encrypt nested object children but not the parent object", () => {
      const eventProperties = {
        nestedObject: {
          innerProp: "inner value",
          deepNested: {
            deepProp: 456
          }
        }
      };

      const schema = inspector.extractSchema(eventProperties);

      expect(schema[0].propertyName).toBe("nestedObject");
      expect(schema[0].propertyType).toBe(type.OBJECT);
      // Object properties should NOT have encrypted value (children are encrypted individually)
      expect(schema[0].encryptedPropertyValue).toBeUndefined();

      // Check children have encrypted values
      expect(schema[0].children).toBeDefined();
      expect(schema[0].children.length).toBe(2);
      
      // innerProp is a primitive - should be encrypted
      expect(schema[0].children[0].encryptedPropertyValue).toBeDefined();
      const decryptedInner = decryptValue(schema[0].children[0].encryptedPropertyValue!, testPrivateKey);
      expect(decryptedInner).toBe("inner value");
      
      // deepNested is an object - should NOT be encrypted, but its children should be
      expect(schema[0].children[1].encryptedPropertyValue).toBeUndefined();
      expect(schema[0].children[1].children).toBeDefined();
      expect(schema[0].children[1].children[0].encryptedPropertyValue).toBeDefined();
      const decryptedDeep = decryptValue(schema[0].children[1].children[0].encryptedPropertyValue!, testPrivateKey);
      expect(decryptedDeep).toBe(456);
    });

    test("should not encrypt array properties (children are type strings)", () => {
      const eventProperties = {
        arrayProp: [1, 2, 3, "four"]
      };

      const schema = inspector.extractSchema(eventProperties);

      expect(schema[0].propertyName).toBe("arrayProp");
      expect(schema[0].propertyType).toBe(type.LIST);
      // Array properties should NOT have encrypted value
      expect(schema[0].encryptedPropertyValue).toBeUndefined();
      
      // Children of arrays with primitives are type strings (deduplicated)
      expect(schema[0].children).toEqual(["int", "string"]);
    });
  });

  describe("with encryption enabled in staging environment", () => {
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Staging,
      version: "1",
      publicEncryptionKey: testPublicKey
    });

    beforeAll(() => {
      inspector.enableLogging(false);
    });

    test("should include encryptedPropertyValue in staging", () => {
      const eventProperties = {
        prop: "value"
      };

      const schema = inspector.extractSchema(eventProperties);

      expect(schema[0].encryptedPropertyValue).toBeDefined();
      const decrypted = decryptValue(schema[0].encryptedPropertyValue!, testPrivateKey);
      expect(decrypted).toBe("value");
    });
  });

  describe("with encryption disabled in production environment", () => {
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Prod,
      version: "1",
      publicEncryptionKey: testPublicKey
    });

    beforeAll(() => {
      inspector.enableLogging(false);
    });

    test("should NOT include encryptedPropertyValue in production", () => {
      const eventProperties = {
        prop: "value"
      };

      const schema = inspector.extractSchema(eventProperties);

      expect(schema[0].encryptedPropertyValue).toBeUndefined();
    });
  });

  describe("without encryption key", () => {
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Dev,
      version: "1"
    });

    beforeAll(() => {
      inspector.enableLogging(false);
    });

    test("should NOT include encryptedPropertyValue when key not provided", () => {
      const eventProperties = {
        prop: "value"
      };

      const schema = inspector.extractSchema(eventProperties);

      expect(schema[0].encryptedPropertyValue).toBeUndefined();
    });
  });

  describe("with empty public key", () => {
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Dev,
      version: "1",
      publicEncryptionKey: ""
    });

    beforeAll(() => {
      inspector.enableLogging(false);
    });

    test("should NOT include encryptedPropertyValue when key is empty", () => {
      const eventProperties = {
        prop: "value"
      };

      const schema = inspector.extractSchema(eventProperties);

      expect(schema[0].encryptedPropertyValue).toBeUndefined();
    });
  });

  describe("trackSchemaFromEvent integration", () => {
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Dev,
      version: "1",
      publicEncryptionKey: testPublicKey
    });

    beforeAll(() => {
      inspector.enableLogging(false);
    });

    test("should return schema with encrypted values from trackSchemaFromEvent", async () => {
      const eventName = "Test Event";
      const eventProperties = {
        prop1: "value1",
        prop2: 42
      };

      const schema = await inspector.trackSchemaFromEvent(eventName, eventProperties);

      expect(schema.length).toBe(2);
      expect(schema[0].encryptedPropertyValue).toBeDefined();
      expect(schema[1].encryptedPropertyValue).toBeDefined();

      const decrypted0 = decryptValue(schema[0].encryptedPropertyValue!, testPrivateKey);
      const decrypted1 = decryptValue(schema[1].encryptedPropertyValue!, testPrivateKey);

      expect(decrypted0).toBe("value1");
      expect(decrypted1).toBe(42);
    });
  });
});
