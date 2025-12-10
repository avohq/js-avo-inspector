import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoEventSpecFetcher } from "../eventSpec/AvoEventSpecFetcher";
import { TEST_KEY_PAIR, decryptValue } from "./helpers/encryptionHelpers";
import { type } from "./constants";

// Mock eventSpecFetcher to return null so batched flow is used
jest.mock("../eventSpec/AvoEventSpecFetcher");

describe("Encrypted Property Tracking", () => {
  // Use hardcoded test key pair for consistent test results
  const { publicKey: testPublicKey, privateKey: testPrivateKey } = TEST_KEY_PAIR;

  beforeAll(() => {
    jest.mocked(AvoEventSpecFetcher).mockImplementation(() => ({
      fetch: jest.fn().mockResolvedValue(null)
    }) as any);
  });

  describe("with encryption enabled in dev environment", () => {
    test("should include encryptedPropertyValue for all properties", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0",
        publicEncryptionKey: testPublicKey
      });

      const eventProperties = {
        stringProp: "test",
        numberProp: 42,
        booleanProp: true,
        nullProp: null
      };

      const schema = await inspector.extractSchema(eventProperties);

      expect(schema.length).toBe(4);

      schema.forEach((prop) => {
        expect(prop.encryptedPropertyValue).toBeDefined();
        expect(typeof prop.encryptedPropertyValue).toBe("string");
      });
    });

    test("encrypted values should be decryptable", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0",
        publicEncryptionKey: testPublicKey
      });

      const eventProperties = {
        stringProp: "test value",
        numberProp: 123
      };

      const schema = await inspector.extractSchema(eventProperties);

      const stringProp = schema.find(p => p.propertyName === "stringProp");
      expect(stringProp).toBeDefined();
      expect(stringProp!.encryptedPropertyValue).toBeDefined();

      // Decrypt and verify
      const decrypted = await decryptValue(stringProp!.encryptedPropertyValue!, testPrivateKey);
      expect(decrypted).toBe("test value");
    });

    test("should encrypt different property types correctly", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0",
        publicEncryptionKey: testPublicKey
      });

      const eventProperties = {
        string: "text",
        number: 42,
        boolean: true,
        nullValue: null
        // Note: objects and arrays don't get encrypted at the top level,
        // only their primitive children do
      };

      const schema = await inspector.extractSchema(eventProperties);

      // Verify primitive properties have encrypted values
      const stringProp = schema.find(p => p.propertyName === "string");
      expect(stringProp?.encryptedPropertyValue).toBeDefined();
      const decryptedString = await decryptValue(stringProp!.encryptedPropertyValue!, testPrivateKey);
      expect(decryptedString).toBe("text");

      const numberProp = schema.find(p => p.propertyName === "number");
      expect(numberProp?.encryptedPropertyValue).toBeDefined();
      const decryptedNumber = await decryptValue(numberProp!.encryptedPropertyValue!, testPrivateKey);
      expect(decryptedNumber).toBe(42);

      const booleanProp = schema.find(p => p.propertyName === "boolean");
      expect(booleanProp?.encryptedPropertyValue).toBeDefined();
      const decryptedBoolean = await decryptValue(booleanProp!.encryptedPropertyValue!, testPrivateKey);
      expect(decryptedBoolean).toBe(true);

      const nullProp = schema.find(p => p.propertyName === "nullValue");
      expect(nullProp?.encryptedPropertyValue).toBeDefined();
      const decryptedNull = await decryptValue(nullProp!.encryptedPropertyValue!, testPrivateKey);
      expect(decryptedNull).toBe(null);
    });

    test("should NOT include encryptedPropertyValue in production", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Prod,
        version: "1.0.0",
        publicEncryptionKey: testPublicKey
      });

      const eventProperties = {
        stringProp: "test"
      };

      const schema = await inspector.extractSchema(eventProperties);

      schema.forEach((prop) => {
        expect(prop.encryptedPropertyValue).toBeUndefined();
      });
    });

    test("should NOT include encryptedPropertyValue when no encryption key provided", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
        // No publicEncryptionKey
      });

      const eventProperties = {
        stringProp: "test"
      };

      const schema = await inspector.extractSchema(eventProperties);

      schema.forEach((prop) => {
        expect(prop.encryptedPropertyValue).toBeUndefined();
      });
    });

    test("should handle nested objects in encryption", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0",
        publicEncryptionKey: testPublicKey
      });

      const eventProperties = {
        user: {
          name: "John",
          age: 30
        }
      };

      const schema = await inspector.extractSchema(eventProperties);

      const userProp = schema.find(p => p.propertyName === "user");
      expect(userProp).toBeDefined();
      // Objects don't get encrypted at the top level, only their children do
      expect(userProp!.encryptedPropertyValue).toBeUndefined();
      
      // But children should be encrypted
      expect(userProp!.children).toBeDefined();
      expect(Array.isArray(userProp!.children)).toBe(true);
      
      const nameChild = (userProp!.children as any[]).find((c: any) => c.propertyName === "name");
      expect(nameChild).toBeDefined();
      expect(nameChild!.encryptedPropertyValue).toBeDefined();
      
      // Decrypt and verify
      const decryptedName = await decryptValue(nameChild!.encryptedPropertyValue!, testPrivateKey);
      expect(decryptedName).toBe("John");
    });

    test("should handle arrays in encryption", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0",
        publicEncryptionKey: testPublicKey
      });

      const eventProperties = {
        items: ["item1", "item2", "item3"]
      };

      const schema = await inspector.extractSchema(eventProperties);

      const itemsProp = schema.find(p => p.propertyName === "items");
      expect(itemsProp).toBeDefined();
      // Arrays don't get encrypted at the top level, only their primitive elements do
      expect(itemsProp!.encryptedPropertyValue).toBeUndefined();
      
      // Arrays of primitives are handled differently - the array structure is preserved
      // but individual values would be encrypted if they were objects
      // For arrays of strings, the array itself is the value, not individual items
      expect(itemsProp!.children).toBeDefined();
    });
  });
});

