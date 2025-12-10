import { encryptValue, generateKeyPair } from "../AvoEncryption";
import { TEST_KEY_PAIR, TEST_KEY_PAIR_2, decryptValue } from "./helpers/encryptionHelpers";

describe("AvoEncryption", () => {
  // Use hardcoded test key pair for consistent test results
  const { publicKey: testPublicKey, privateKey: testPrivateKey } = TEST_KEY_PAIR;

  describe("encryptValue", () => {
    test("should encrypt and decrypt a string value", async () => {
      const originalValue = "test string";
      const encrypted = await encryptValue(originalValue, testPublicKey);
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe("string");
      expect(encrypted.length).toBeGreaterThan(0);

      const decrypted = await decryptValue(encrypted, testPrivateKey);
      expect(decrypted).toBe(originalValue);
    });

    test("should encrypt and decrypt a number value", async () => {
      const originalValue = 42;
      const encrypted = await encryptValue(originalValue, testPublicKey);
      const decrypted = await decryptValue(encrypted, testPrivateKey);
      expect(decrypted).toBe(originalValue);
    });

    test("should encrypt and decrypt a boolean value", async () => {
      const originalValue = true;
      const encrypted = await encryptValue(originalValue, testPublicKey);
      const decrypted = await decryptValue(encrypted, testPrivateKey);
      expect(decrypted).toBe(originalValue);
    });

    test("should encrypt and decrypt a null value", async () => {
      const originalValue = null;
      const encrypted = await encryptValue(originalValue, testPublicKey);
      const decrypted = await decryptValue(encrypted, testPrivateKey);
      expect(decrypted).toBe(originalValue);
    });

    test("should encrypt and decrypt an object value", async () => {
      const originalValue = { key: "value", number: 123 };
      const encrypted = await encryptValue(originalValue, testPublicKey);
      const decrypted = await decryptValue(encrypted, testPrivateKey);
      expect(decrypted).toEqual(originalValue);
    });

    test("should encrypt and decrypt an array value", async () => {
      const originalValue = [1, 2, 3, "test"];
      const encrypted = await encryptValue(originalValue, testPublicKey);
      const decrypted = await decryptValue(encrypted, testPrivateKey);
      expect(decrypted).toEqual(originalValue);
    });

    test("should produce different encrypted values for the same input with different public keys", async () => {
      const value = "test";

      // Use two different hardcoded key pairs
      const { publicKey: publicKey1 } = TEST_KEY_PAIR;
      const { publicKey: publicKey2 } = TEST_KEY_PAIR_2;

      const encrypted1 = await encryptValue(value, publicKey1);
      const encrypted2 = await encryptValue(value, publicKey2);

      expect(encrypted1).not.toBe(encrypted2);
    });

    test("should return a base64 string", async () => {
      const encrypted = await encryptValue("test", testPublicKey);
      // Base64 strings contain only A-Z, a-z, 0-9, +, /, and = (padding)
      expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    test("should encrypt and decrypt large payloads (1KB+)", async () => {
      const largeValue = "x".repeat(1024);
      const encrypted = await encryptValue(largeValue, testPublicKey);
      const decrypted = await decryptValue(encrypted, testPrivateKey);
      expect(decrypted).toBe(largeValue);
    });

    test("should encrypt and decrypt very large payloads (5KB+)", async () => {
      const veryLargeValue = "x".repeat(5 * 1024);
      const encrypted = await encryptValue(veryLargeValue, testPublicKey);
      const decrypted = await decryptValue(encrypted, testPrivateKey);
      expect(decrypted).toBe(veryLargeValue);
    });

    test("should produce different ciphertexts for the same plaintext (ephemeral keys)", async () => {
      const value = "same value";
      const encrypted1 = await encryptValue(value, testPublicKey);
      const encrypted2 = await encryptValue(value, testPublicKey);

      // Should be different due to ephemeral key generation
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      const decrypted1 = await decryptValue(encrypted1, testPrivateKey);
      const decrypted2 = await decryptValue(encrypted2, testPrivateKey);
      expect(decrypted1).toBe(value);
      expect(decrypted2).toBe(value);
    });
  });

  describe("decryptValue", () => {
    test("should fail to decrypt with wrong private key", async () => {
      const value = "test";
      const encrypted = await encryptValue(value, testPublicKey);

      const { privateKey: wrongPrivateKey } = TEST_KEY_PAIR_2;

      await expect(decryptValue(encrypted, wrongPrivateKey)).rejects.toThrow();
    });

    test("should handle empty string value", async () => {
      const encrypted = await encryptValue("", testPublicKey);
      const decrypted = await decryptValue(encrypted, testPrivateKey);
      expect(decrypted).toBe("");
    });

    test("should handle zero value", async () => {
      const encrypted = await encryptValue(0, testPublicKey);
      const decrypted = await decryptValue(encrypted, testPrivateKey);
      expect(decrypted).toBe(0);
    });

    test("should handle false value", async () => {
      const encrypted = await encryptValue(false, testPublicKey);
      const decrypted = await decryptValue(encrypted, testPrivateKey);
      expect(decrypted).toBe(false);
    });

    test("should handle complex nested objects", async () => {
      const complexValue = {
        string: "test",
        number: 42,
        boolean: true,
        null: null,
        array: [1, 2, { nested: "value" }],
        object: { key: "value", nested: { deep: "value" } }
      };

      const encrypted = await encryptValue(complexValue, testPublicKey);
      const decrypted = await decryptValue(encrypted, testPrivateKey);
      expect(decrypted).toEqual(complexValue);
    });
  });

  describe("generateKeyPair", () => {
    test("should generate a valid key pair", () => {
      const keyPair = generateKeyPair();
      expect(keyPair).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(typeof keyPair.privateKey).toBe("string");
      expect(typeof keyPair.publicKey).toBe("string");
      // Private key should be 64 hex characters (32 bytes)
      expect(keyPair.privateKey.length).toBe(64);
      // Public key should be 130 hex characters (65 bytes uncompressed) or 66 (with 0x04 prefix)
      expect(keyPair.publicKey.length).toBeGreaterThanOrEqual(130);
    });

    test("should generate different key pairs each time", () => {
      const keyPair1 = generateKeyPair();
      const keyPair2 = generateKeyPair();
      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
    });
  });
});

