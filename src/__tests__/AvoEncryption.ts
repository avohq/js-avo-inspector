import { encryptValue, decryptValue } from "../AvoEncryption";
const JSEncrypt = require("jsencrypt");

describe("AvoEncryption", () => {
  // Generate a test RSA key pair (2048-bit to handle larger payloads)
  const keyPair = new JSEncrypt({ default_key_size: "2048" });
  keyPair.getKey();
  const testPublicKey = keyPair.getPublicKey();
  const testPrivateKey = keyPair.getPrivateKey();

  describe("encryptValue", () => {
    test("should encrypt and decrypt a string value", () => {
      const originalValue = "test string";
      const encrypted = encryptValue(originalValue, testPublicKey);
      const decrypted = decryptValue(encrypted, testPrivateKey);

      expect(encrypted).not.toBe(originalValue);
      expect(decrypted).toBe(originalValue);
    });

    test("should encrypt and decrypt a number value", () => {
      const originalValue = 42;
      const encrypted = encryptValue(originalValue, testPublicKey);
      const decrypted = decryptValue(encrypted, testPrivateKey);

      expect(encrypted).not.toBe(originalValue.toString());
      expect(decrypted).toBe(originalValue);
    });

    test("should encrypt and decrypt a boolean value", () => {
      const originalValue = true;
      const encrypted = encryptValue(originalValue, testPublicKey);
      const decrypted = decryptValue(encrypted, testPrivateKey);

      expect(decrypted).toBe(originalValue);
    });

    test("should encrypt and decrypt a null value", () => {
      const originalValue = null;
      const encrypted = encryptValue(originalValue, testPublicKey);
      const decrypted = decryptValue(encrypted, testPrivateKey);

      expect(decrypted).toBe(originalValue);
    });

    test("should encrypt and decrypt an object value", () => {
      const originalValue = { key: "value", nested: { prop: 123 } };
      const encrypted = encryptValue(originalValue, testPublicKey);
      const decrypted = decryptValue(encrypted, testPrivateKey);

      expect(decrypted).toEqual(originalValue);
    });

    test("should encrypt and decrypt an array value", () => {
      const originalValue = [1, 2, "three", { four: 4 }];
      const encrypted = encryptValue(originalValue, testPublicKey);
      const decrypted = decryptValue(encrypted, testPrivateKey);

      expect(decrypted).toEqual(originalValue);
    });

    test("should produce different encrypted values for the same input with different public keys", () => {
      const value = "test";

      // Generate two different key pairs
      const keyPair1 = new JSEncrypt({ default_key_size: "2048" });
      keyPair1.getKey();
      const publicKey1 = keyPair1.getPublicKey();

      const keyPair2 = new JSEncrypt({ default_key_size: "2048" });
      keyPair2.getKey();
      const publicKey2 = keyPair2.getPublicKey();

      const encrypted1 = encryptValue(value, publicKey1);
      const encrypted2 = encryptValue(value, publicKey2);

      expect(encrypted1).not.toBe(encrypted2);
    });

    test("should return a base64 string", () => {
      const value = "test";
      const encrypted = encryptValue(value, testPublicKey);

      // Base64 string should only contain alphanumeric chars, +, /, =, and newlines
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=\n\r]+$/);
    });
  });

  describe("decryptValue", () => {
    test("should fail to decrypt with wrong private key", () => {
      const value = "test";

      // Generate another key pair with different private key
      const wrongKeyPair = new JSEncrypt({ default_key_size: "2048" });
      wrongKeyPair.getKey();
      const wrongPrivateKey = wrongKeyPair.getPrivateKey();

      const encrypted = encryptValue(value, testPublicKey);

      expect(() => {
        decryptValue(encrypted, wrongPrivateKey);
      }).toThrow();
    });

    test("should handle empty string value", () => {
      const originalValue = "";
      const encrypted = encryptValue(originalValue, testPublicKey);
      const decrypted = decryptValue(encrypted, testPrivateKey);

      expect(decrypted).toBe(originalValue);
    });

    test("should handle zero value", () => {
      const originalValue = 0;
      const encrypted = encryptValue(originalValue, testPublicKey);
      const decrypted = decryptValue(encrypted, testPrivateKey);

      expect(decrypted).toBe(originalValue);
    });

    test("should handle false value", () => {
      const originalValue = false;
      const encrypted = encryptValue(originalValue, testPublicKey);
      const decrypted = decryptValue(encrypted, testPrivateKey);

      expect(decrypted).toBe(originalValue);
    });

    test("should handle complex nested objects", () => {
      const originalValue = {
        string: "test",
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, 3],
        nested: {
          deep: {
            value: "deeply nested"
          }
        }
      };
      const encrypted = encryptValue(originalValue, testPublicKey);
      const decrypted = decryptValue(encrypted, testPrivateKey);

      expect(decrypted).toEqual(originalValue);
    });
  });
});
