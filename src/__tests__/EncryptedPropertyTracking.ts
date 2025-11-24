import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { decryptValue } from "../AvoEncryption";
import { type } from "./constants";
const JSEncrypt = require("jsencrypt");

describe("Encrypted Property Tracking", () => {
  // Generate a test RSA key pair (2048-bit to handle larger payloads)
  const keyPair = new JSEncrypt({ default_key_size: "2048" });
  keyPair.getKey();
  const testPublicKey = keyPair.getPublicKey();
  const testPrivateKey = keyPair.getPrivateKey();

  describe("with encryption enabled in dev environment", () => {
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Dev,
      version: "1",
      publicKey: testPublicKey
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

    test("should encrypt nested object properties", () => {
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
      expect(schema[0].encryptedPropertyValue).toBeDefined();

      // Decrypt the top-level object
      const decryptedObject = decryptValue(schema[0].encryptedPropertyValue!, testPrivateKey);
      expect(decryptedObject).toEqual(eventProperties.nestedObject);

      // Check children also have encrypted values
      expect(schema[0].children).toBeDefined();
      expect(schema[0].children.length).toBe(2);
      expect(schema[0].children[0].encryptedPropertyValue).toBeDefined();
      expect(schema[0].children[1].encryptedPropertyValue).toBeDefined();
    });

    test("should encrypt array properties", () => {
      const eventProperties = {
        arrayProp: [1, 2, 3, "four"]
      };

      const schema = inspector.extractSchema(eventProperties);

      expect(schema[0].propertyName).toBe("arrayProp");
      expect(schema[0].propertyType).toBe(type.LIST);
      expect(schema[0].encryptedPropertyValue).toBeDefined();

      const decryptedArray = decryptValue(schema[0].encryptedPropertyValue!, testPrivateKey);
      expect(decryptedArray).toEqual([1, 2, 3, "four"]);
    });
  });

  describe("with encryption enabled in staging environment", () => {
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: AvoInspectorEnv.Staging,
      version: "1",
      publicKey: testPublicKey
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
      publicKey: testPublicKey
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
      publicKey: ""
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
      publicKey: testPublicKey
    });

    beforeAll(() => {
      inspector.enableLogging(false);
    });

    test("should return schema with encrypted values from trackSchemaFromEvent", () => {
      const eventName = "Test Event";
      const eventProperties = {
        prop1: "value1",
        prop2: 42
      };

      const schema = inspector.trackSchemaFromEvent(eventName, eventProperties);

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
