import { encrypt as eciesEncrypt, decrypt as eciesDecrypt, PrivateKey } from "eciesjs";

/**
 * Generates a new ECC key pair for encryption/decryption.
 * Uses secp256k1 curve (P-256 family) which provides 128-bit security.
 *
 * @returns An object containing the private and public keys as hex strings
 */
export function generateKeyPair(): { privateKey: string; publicKey: string } {
  // Generate a new random private key (32 bytes)
  const privateKey = new PrivateKey();

  // Derive the public key from the private key
  const publicKey = privateKey.publicKey;

  return {
    privateKey: privateKey.toHex(),
    publicKey: publicKey.toHex()
  };
}

/**
 * Encrypts a value using ECC public key encryption (ECIES).
 * The encrypted output can only be decrypted by the client using their private key.
 * This ensures that Avo cannot decrypt the values on the backend.
 *
 * ECIES uses hybrid encryption (ECDH + AES-256-GCM) which provides:
 * - No message size limitations
 * - Fast encryption even for large values
 * - Strong authentication via GCM
 *
 * @param value - The value to encrypt (any type - will be JSON stringified)
 * @param publicKey - The ECC public key in hex format provided by the client
 * @returns Base64-encoded encrypted string that can only be decrypted with the private key
 */
export function encryptValue(value: any, publicKey: string): string {
  try {
    // Convert the value to a JSON string to support all types
    const stringValue = JSON.stringify(value);

    // eciesjs encrypt expects a hex string for the public key and a Uint8Array for data
    // Ensure publicKey is a string
    const publicKeyStr = typeof publicKey === "string" ? publicKey : String(publicKey);

    // Convert string to Uint8Array (Buffer extends Uint8Array in Node.js)
    const messageBuffer = Buffer.from(stringValue, "utf8");

    // Encrypt using ECIES (returns Buffer)
    const encrypted = eciesEncrypt(publicKeyStr, messageBuffer);

    // Return as base64 for easy transmission
    return encrypted.toString("base64");
  } catch (error) {
    throw new Error(
      `Failed to encrypt value. Please check that the public key is valid. Error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Decrypts a value that was encrypted with encryptValue.
 *
 * @param encryptedValue - The base64-encoded encrypted string
 * @param privateKey - The ECC private key in hex format
 * @returns The original decrypted value (parsed from JSON)
 */
export function decryptValue(encryptedValue: string, privateKey: string): any {
  try {
    // Convert encrypted value from base64 to Buffer
    const encryptedBuffer = Buffer.from(encryptedValue, "base64");

    // eciesjs decrypt expects a hex string for the private key and a Buffer for data
    // Ensure privateKey is a string
    const privateKeyStr = typeof privateKey === "string" ? privateKey : String(privateKey);

    // Decrypt using ECIES (returns Buffer)
    // Note: eciesjs expects hex string directly, not Buffer
    const decrypted = eciesDecrypt(privateKeyStr, encryptedBuffer);

    // Convert to string and parse JSON
    const stringValue = decrypted.toString("utf8");
    return JSON.parse(stringValue);
  } catch (error) {
    throw new Error(
      `Failed to decrypt value. Please check that the private key is valid and matches the public key used for encryption. Error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
