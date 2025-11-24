const JSEncrypt = require("jsencrypt");

/**
 * Encrypts a value using RSA public key encryption.
 * The encrypted output can only be decrypted by the client using their private key.
 * This ensures that Avo cannot decrypt the values on the backend.
 *
 * @param value - The value to encrypt (any type - will be JSON stringified)
 * @param publicKey - The RSA public key in PEM format provided by the client
 * @returns Base64-encoded encrypted string that can only be decrypted with the private key
 */
export function encryptValue(value: any, publicKey: string): string {
  const stringValue = JSON.stringify(value);
  const encrypt = new JSEncrypt();
  encrypt.setPublicKey(publicKey);

  const encrypted = encrypt.encrypt(stringValue);

  if (!encrypted) {
    throw new Error("Failed to encrypt value. Please check that the public key is valid.");
  }

  return encrypted;
}
