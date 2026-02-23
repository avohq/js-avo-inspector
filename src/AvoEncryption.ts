/**
 * AvoEncryption — React Native ECIES encryption using @noble/ciphers.
 *
 * CRITICAL: React Native's Hermes runtime does NOT have crypto.subtle.
 * This module uses @noble/ciphers/aes gcm() for AES-GCM instead — fully synchronous.
 * Ephemeral key generation and ECDH use @noble/curves/p256.
 *
 * Wire format (MUST match all SDKs):
 *   [0x00][65-byte ephemeral pubkey (uncompressed)][16-byte IV][16-byte auth tag][ciphertext]
 *   → base64
 *
 * Algorithm:
 *   1. Generate ephemeral P-256 key pair
 *   2. ECDH: ephemeral private key + recipient public key → shared secret (X-coordinate)
 *   3. KDF: SHA-256(shared secret) → 32-byte AES key
 *   4. AES-256-GCM encrypt with random 16-byte IV
 *   5. Serialize: version(1) + ephemeralPubKey(65) + IV(16) + authTag(16) + ciphertext
 *   6. Base64 encode
 */

import { p256 } from "@noble/curves/p256";
import { gcm } from "@noble/ciphers/aes";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes } from "@noble/ciphers/webcrypto";

/**
 * Converts a hex string to a Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Determines whether encryption should be performed.
 *
 * Truth table:
 *   dev + key → true
 *   staging + key → true
 *   prod + key → false
 *   dev + null → false
 *   dev + empty → false
 */
export function shouldEncrypt(
  env: string,
  publicEncryptionKey: string | null | undefined
): boolean {
  if (env === "prod") return false;
  if (
    publicEncryptionKey === null ||
    publicEncryptionKey === undefined ||
    publicEncryptionKey.trim().length === 0
  ) {
    return false;
  }
  return true;
}

/**
 * Encrypts a value using ECIES (P-256 ECDH + AES-256-GCM).
 * Fully synchronous — no async/await.
 *
 * @param value - The plaintext string to encrypt (already JSON-stringified by caller if needed)
 * @param publicKeyHex - The recipient's P-256 public key as a hex string (uncompressed, 04...)
 * @returns Base64-encoded ciphertext in Avo ECIES wire format
 */
export function encryptValue(value: string, publicKeyHex: string): string {
  // 1. Parse recipient public key from hex
  const recipientPublicKeyBytes = hexToBytes(publicKeyHex);

  // 2. Generate ephemeral P-256 key pair
  const ephemeralPrivateKeyBytes = p256.utils.randomPrivateKey();
  const ephemeralPublicKeyBytes = p256.getPublicKey(
    ephemeralPrivateKeyBytes,
    false // uncompressed = 65 bytes (0x04 + 32-byte X + 32-byte Y)
  );

  // 3. ECDH: compute shared secret
  // getSharedSecret returns the full point; extract X-coordinate (last 32 bytes)
  const sharedSecretPoint = p256.getSharedSecret(
    ephemeralPrivateKeyBytes,
    recipientPublicKeyBytes
  );
  const sharedSecret = sharedSecretPoint.slice(-32);

  // 4. KDF: SHA-256(sharedSecret) → 32-byte AES key
  const aesKey = sha256(sharedSecret);

  // 5. Generate random 16-byte IV
  const iv = randomBytes(16);

  // 6. AES-256-GCM encrypt
  const plaintext = new TextEncoder().encode(value);
  const aes = gcm(aesKey, iv);
  const ciphertextWithTag = aes.encrypt(plaintext);

  // @noble/ciphers gcm() returns ciphertext + authTag concatenated
  // Split the LAST 16 bytes as the auth tag
  const authTagLength = 16;
  const ciphertextLength = ciphertextWithTag.length - authTagLength;
  const ciphertext = ciphertextWithTag.slice(0, ciphertextLength);
  const authTag = ciphertextWithTag.slice(ciphertextLength);

  // 7. Serialize: [Version 0x00 (1B)] + [EphemeralPubKey (65B)] + [IV (16B)] + [AuthTag (16B)] + [Ciphertext]
  const resultLength =
    1 + ephemeralPublicKeyBytes.length + 16 + 16 + ciphertext.length;
  const result = new Uint8Array(resultLength);
  let offset = 0;

  result[0] = 0x00; // Version byte
  offset += 1;

  result.set(ephemeralPublicKeyBytes, offset);
  offset += ephemeralPublicKeyBytes.length;

  result.set(iv, offset);
  offset += 16;

  result.set(authTag, offset);
  offset += 16;

  result.set(ciphertext, offset);

  // 8. Base64 encode
  return Buffer.from(result).toString("base64");
}

/**
 * Encrypts event property values for transmission.
 *
 * Rules:
 * - List-type properties are omitted entirely
 * - On encryption failure: console.warn, omit the property, continue
 * - Returns new array with encryptedPropertyValue set (propertyType/propertyName preserved)
 */
export function encryptEventProperties(
  properties: Array<{
    propertyName: string;
    propertyType: string;
    children?: any;
    failedEventIds?: string[];
    passedEventIds?: string[];
  }>,
  eventProps: Record<string, any>,
  publicKeyHex: string
): Array<{
  propertyName: string;
  propertyType: string;
  encryptedPropertyValue?: string;
  children?: any;
  failedEventIds?: string[];
  passedEventIds?: string[];
}> {
  const result: Array<{
    propertyName: string;
    propertyType: string;
    encryptedPropertyValue?: string;
    children?: any;
    failedEventIds?: string[];
    passedEventIds?: string[];
  }> = [];

  for (const prop of properties) {
    // Omit list-type properties entirely
    if (prop.propertyType === "list") {
      continue;
    }

    try {
      const value = eventProps[prop.propertyName];
      const jsonValue = JSON.stringify(value === undefined ? null : value);
      const encrypted = encryptValue(jsonValue, publicKeyHex);

      const entry: any = {
        propertyName: prop.propertyName,
        propertyType: prop.propertyType,
        encryptedPropertyValue: encrypted,
      };

      // Preserve children if present
      if (prop.children !== undefined) {
        entry.children = prop.children;
      }
      // Preserve validation fields if present
      if (prop.failedEventIds !== undefined) {
        entry.failedEventIds = prop.failedEventIds;
      }
      if (prop.passedEventIds !== undefined) {
        entry.passedEventIds = prop.passedEventIds;
      }

      result.push(entry);
    } catch (e) {
      console.warn(
        `[Avo Inspector] Warning: Failed to encrypt property "${prop.propertyName}". ${
          e instanceof Error ? e.message : String(e)
        }`
      );
      // Omit the property and continue
    }
  }

  return result;
}
