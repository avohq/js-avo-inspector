import { encryptValue } from "../AvoEncryption";
import { generateKeyPair, decryptValue } from "./helpers/encryptionHelpers";

describe("AvoEncryption", () => {
  // Generate a test ECC key pair
  const { publicKey: testPublicKey, privateKey: testPrivateKey } = generateKeyPair();

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
      const { publicKey: publicKey1 } = generateKeyPair();
      const { publicKey: publicKey2 } = generateKeyPair();

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

    test("should encrypt and decrypt large payloads (1KB+)", () => {
      // Create a large object that would exceed RSA-2048's ~245 byte limit
      const largeObject = {
        description: "A".repeat(500), // 500 character string
        metadata: {
          tags: Array(50).fill("tag"),
          properties: Array(20).fill({ key: "value", count: 123 })
        },
        items: Array(30).fill({
          id: "item-12345",
          name: "Test Item",
          price: 99.99,
          inStock: true
        })
      };

      // This should be well over 1KB when JSON stringified
      const jsonSize = JSON.stringify(largeObject).length;
      expect(jsonSize).toBeGreaterThan(1000);

      // Should successfully encrypt and decrypt without errors
      const encrypted = encryptValue(largeObject, testPublicKey);
      const decrypted = decryptValue(encrypted, testPrivateKey);

      expect(decrypted).toEqual(largeObject);
    });

    test("should encrypt and decrypt very large payloads (5KB+)", () => {
      // Create an even larger object
      const veryLargeObject = {
        data: "X".repeat(5000), // 5000 character string
        list: Array(100).fill({
          id: "item-123456789",
          description: "Long description text here",
          metadata: { a: 1, b: 2, c: 3, d: 4, e: 5 }
        })
      };

      const jsonSize = JSON.stringify(veryLargeObject).length;
      expect(jsonSize).toBeGreaterThan(5000);

      // ECIES should handle this without any issues
      const encrypted = encryptValue(veryLargeObject, testPublicKey);
      const decrypted = decryptValue(encrypted, testPrivateKey);

      expect(decrypted).toEqual(veryLargeObject);
    });

    test("should produce different ciphertexts for the same plaintext (ephemeral keys)", () => {
      const value = "test";

      // Encrypt the same value twice with the same public key
      // ECIES uses ephemeral keys, so the ciphertext should be different each time
      const encrypted1 = encryptValue(value, testPublicKey);
      const encrypted2 = encryptValue(value, testPublicKey);

      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      const decrypted1 = decryptValue(encrypted1, testPrivateKey);
      const decrypted2 = decryptValue(encrypted2, testPrivateKey);

      expect(decrypted1).toBe(value);
      expect(decrypted2).toBe(value);
    });
  });

  describe("decryptValue", () => {
    test("should fail to decrypt with wrong private key", () => {
      const value = "test";

      // Generate another key pair with different private key
      const { privateKey: wrongPrivateKey } = generateKeyPair();

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
