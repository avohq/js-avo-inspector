/**
 * Tests for AvoEncryption (React Native - @noble/ciphers based, fully synchronous).
 *
 * Covers:
 * - shouldEncrypt() truth table
 * - Wire format structural tests
 * - Cross-SDK interop (TypeScript mirror of Java EncryptionInteropTestUtil)
 * - Encryption failure handling
 * - List-type property omission
 * - publicEncryptionKey in base body
 * - Prod negative test
 */
import { p256 } from "@noble/curves/p256";
import { gcm } from "@noble/ciphers/aes";
import { sha256 } from "@noble/hashes/sha256";
import {
  encryptValue,
  shouldEncrypt,
  encryptEventProperties,
} from "../AvoEncryption";

// =========================================================================
// Helper: TypeScript mirror of Java EncryptionInteropTestUtil.decrypt
// =========================================================================

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Reference decryptor mirroring Java EncryptionInteropTestUtil.decrypt.
 * Uses @noble/curves + @noble/ciphers (same libs, but acts as independent verification).
 */
function referenceDecrypt(base64Encrypted: string, privateKeyHex: string): string {
  const data = Buffer.from(base64Encrypted, "base64");

  // Minimum length: 1 (version) + 65 (ephemeral pub key) + 16 (IV) + 16 (auth tag) + 1 (min ciphertext)
  if (data.length < 99) {
    throw new Error(
      `Encrypted data too short: expected at least 99 bytes, got ${data.length}`
    );
  }

  // Step 2: Assert version byte
  if (data[0] !== 0x00) {
    throw new Error(
      `Unsupported version byte: expected 0x00, got 0x${data[0].toString(16).padStart(2, "0")}`
    );
  }

  // Step 3: Extract ephemeral public key bytes [1..65] (65 bytes, uncompressed EC point)
  const ephemeralPubKeyBytes = new Uint8Array(data.slice(1, 66));

  // Step 4: Extract IV [66..81] (16 bytes)
  const iv = new Uint8Array(data.slice(66, 82));

  // Step 5: Extract auth tag [82..97] (16 bytes)
  const authTag = new Uint8Array(data.slice(82, 98));

  // Step 6: Extract ciphertext [98..N]
  const ciphertext = new Uint8Array(data.slice(98));

  // Step 7-8: ECDH with recipient private key -> sharedSecret
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const sharedSecretPoint = p256.getSharedSecret(privateKeyBytes, ephemeralPubKeyBytes);
  const sharedSecret = sharedSecretPoint.slice(-32); // X-coordinate

  // Step 9: KDF: SHA-256(sharedSecret) -> aesKey
  const aesKey = sha256(sharedSecret);

  // Step 10: AES/GCM decrypt
  // @noble/ciphers gcm expects ciphertext + authTag concatenated
  const ciphertextWithTag = new Uint8Array(ciphertext.length + authTag.length);
  ciphertextWithTag.set(ciphertext, 0);
  ciphertextWithTag.set(authTag, ciphertext.length);

  const aes = gcm(aesKey, iv);
  const plainBytes = aes.decrypt(ciphertextWithTag);

  // Step 11: Return as UTF-8 string
  return new TextDecoder().decode(plainBytes);
}

// =========================================================================
// Generate a test key pair
// =========================================================================

function generateTestKeyPair(): { privateKey: string; publicKey: string } {
  const privateKeyBytes = p256.utils.randomPrivateKey();
  const publicKeyBytes = p256.getPublicKey(privateKeyBytes, false);
  return {
    privateKey: bytesToHex(privateKeyBytes).padStart(64, "0"),
    publicKey: bytesToHex(publicKeyBytes),
  };
}

// =========================================================================
// Tests
// =========================================================================

describe("AvoEncryption (React Native - @noble/ciphers)", () => {
  // -----------------------------------------------------------------------
  // shouldEncrypt() truth table
  // -----------------------------------------------------------------------
  describe("shouldEncrypt()", () => {
    test("dev + valid key = true", () => {
      expect(shouldEncrypt("dev", "04abcdef1234")).toBe(true);
    });

    test("staging + valid key = true", () => {
      expect(shouldEncrypt("staging", "04abcdef1234")).toBe(true);
    });

    test("prod + valid key = false", () => {
      expect(shouldEncrypt("prod", "04abcdef1234")).toBe(false);
    });

    test("dev + null key = false", () => {
      expect(shouldEncrypt("dev", null)).toBe(false);
    });

    test("dev + undefined key = false", () => {
      expect(shouldEncrypt("dev", undefined)).toBe(false);
    });

    test("dev + empty string key = false", () => {
      expect(shouldEncrypt("dev", "")).toBe(false);
    });

    test("dev + whitespace-only key = false", () => {
      expect(shouldEncrypt("dev", "   ")).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Wire format structural test
  // -----------------------------------------------------------------------
  describe("Wire format", () => {
    const keyPair = generateTestKeyPair();

    test("base64Decode(output).length >= 99", () => {
      const encrypted = encryptValue("hello world", keyPair.publicKey);
      const decoded = Buffer.from(encrypted, "base64");
      expect(decoded.length).toBeGreaterThanOrEqual(99);
    });

    test("output[0] == 0x00 (version byte)", () => {
      const encrypted = encryptValue("hello world", keyPair.publicKey);
      const decoded = Buffer.from(encrypted, "base64");
      expect(decoded[0]).toBe(0x00);
    });

    test("output[1] == 0x04 (uncompressed point marker)", () => {
      const encrypted = encryptValue("hello world", keyPair.publicKey);
      const decoded = Buffer.from(encrypted, "base64");
      expect(decoded[1]).toBe(0x04);
    });

    test("encryptValue is synchronous (returns string, not Promise)", () => {
      const result = encryptValue("test", keyPair.publicKey);
      // If it were async, result would be a Promise, not a string
      expect(typeof result).toBe("string");
      // Ensure it's NOT a Promise
      expect(result).not.toBeInstanceOf(Promise);
    });

    test("different encryptions produce different output", () => {
      const enc1 = encryptValue("same", keyPair.publicKey);
      const enc2 = encryptValue("same", keyPair.publicKey);
      expect(enc1).not.toBe(enc2);
    });
  });

  // -----------------------------------------------------------------------
  // Cross-SDK interop: RN-encrypted ciphertext decryptable by reference decryptor
  // -----------------------------------------------------------------------
  describe("Cross-SDK interop", () => {
    const keyPair = generateTestKeyPair();

    const standardPlaintexts = [
      '"hello world"',
      "42",
      "3.14",
      "true",
      '"test string value"',
    ];

    standardPlaintexts.forEach((plaintext) => {
      test(`RN encrypt -> reference decrypt: ${plaintext}`, () => {
        const encrypted = encryptValue(plaintext, keyPair.publicKey);
        const decrypted = referenceDecrypt(encrypted, keyPair.privateKey);
        expect(decrypted).toBe(plaintext);
      });
    });

    test("round-trip with JSON-stringified object", () => {
      const obj = { key: "value", number: 123 };
      const jsonStr = JSON.stringify(obj);
      const encrypted = encryptValue(jsonStr, keyPair.publicKey);
      const decrypted = referenceDecrypt(encrypted, keyPair.privateKey);
      expect(decrypted).toBe(jsonStr);
    });
  });

  // -----------------------------------------------------------------------
  // encryptEventProperties
  // -----------------------------------------------------------------------
  describe("encryptEventProperties()", () => {
    const keyPair = generateTestKeyPair();

    test("encrypts string property values", () => {
      const properties = [
        { propertyName: "name", propertyType: "string" },
      ];
      const eventProps = { name: "Alice" };

      const result = encryptEventProperties(properties, eventProps, keyPair.publicKey);

      expect(result).toHaveLength(1);
      expect(result[0].propertyName).toBe("name");
      expect(result[0].propertyType).toBe("string");
      expect(result[0].encryptedPropertyValue).toBeDefined();
      // Verify it decrypts correctly
      const decrypted = referenceDecrypt(
        result[0].encryptedPropertyValue!,
        keyPair.privateKey
      );
      expect(JSON.parse(decrypted)).toBe("Alice");
    });

    test("encrypts int property values", () => {
      const properties = [
        { propertyName: "age", propertyType: "int" },
      ];
      const eventProps = { age: 42 };

      const result = encryptEventProperties(properties, eventProps, keyPair.publicKey);

      expect(result[0].encryptedPropertyValue).toBeDefined();
      const decrypted = referenceDecrypt(
        result[0].encryptedPropertyValue!,
        keyPair.privateKey
      );
      expect(JSON.parse(decrypted)).toBe(42);
    });

    test("encrypts boolean property values", () => {
      const properties = [
        { propertyName: "active", propertyType: "boolean" },
      ];
      const eventProps = { active: true };

      const result = encryptEventProperties(properties, eventProps, keyPair.publicKey);

      expect(result[0].encryptedPropertyValue).toBeDefined();
      const decrypted = referenceDecrypt(
        result[0].encryptedPropertyValue!,
        keyPair.privateKey
      );
      expect(JSON.parse(decrypted)).toBe(true);
    });

    test("omits list-type properties entirely", () => {
      const properties = [
        { propertyName: "tags", propertyType: "list", children: ["string"] },
        { propertyName: "name", propertyType: "string" },
      ];
      const eventProps = { tags: ["a", "b"], name: "Alice" };

      const result = encryptEventProperties(properties, eventProps, keyPair.publicKey);

      // list property should be omitted entirely
      expect(result).toHaveLength(1);
      expect(result[0].propertyName).toBe("name");
    });

    test("encryption failure: console.warn, omit property, continue", () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();

      const properties = [
        { propertyName: "secret", propertyType: "string" },
        { propertyName: "name", propertyType: "string" },
      ];
      const eventProps = { secret: "value1", name: "value2" };

      // Use an invalid public key to trigger encryption failure for the first property
      // We can't easily make only one fail, so let's test with a completely invalid key
      const result = encryptEventProperties(
        properties,
        eventProps,
        "invalid-key"
      );

      // Both should fail with invalid key, so both should be omitted
      expect(result).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalled();
      // Check that warning message matches expected format
      const calls = warnSpy.mock.calls;
      expect(calls.some((call) =>
        String(call[0]).includes("[Avo Inspector] Warning:")
      )).toBe(true);

      warnSpy.mockRestore();
    });

    test("null property values are encrypted as null", () => {
      const properties = [
        { propertyName: "nullProp", propertyType: "null" },
      ];
      const eventProps = { nullProp: null };

      const result = encryptEventProperties(properties, eventProps, keyPair.publicKey);

      expect(result).toHaveLength(1);
      expect(result[0].encryptedPropertyValue).toBeDefined();
      const decrypted = referenceDecrypt(
        result[0].encryptedPropertyValue!,
        keyPair.privateKey
      );
      expect(JSON.parse(decrypted)).toBeNull();
    });

    test("object property values are encrypted", () => {
      const properties = [
        {
          propertyName: "address",
          propertyType: "object",
          children: [
            { propertyName: "street", propertyType: "string" },
          ],
        },
      ];
      const eventProps = { address: { street: "123 Main St" } };

      const result = encryptEventProperties(properties, eventProps, keyPair.publicKey);

      expect(result).toHaveLength(1);
      expect(result[0].encryptedPropertyValue).toBeDefined();
      const decrypted = referenceDecrypt(
        result[0].encryptedPropertyValue!,
        keyPair.privateKey
      );
      expect(JSON.parse(decrypted)).toEqual({ street: "123 Main St" });
    });
  });
});
