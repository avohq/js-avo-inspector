const JSEncrypt = require("jsencrypt");

/**
 * Generates a new RSA key pair for encryption.
 *
 * @param keySize - The size of the key in bits (default: 2048)
 * @returns An object containing the public key and private key in PEM format
 *
 * @example
 * const { publicKey, privateKey } = generateKeyPair();
 * // Use publicKey with AvoInspector
 * // Keep privateKey secure for decryption
 */
export function generateKeyPair(keySize: number = 2048): { publicKey: string; privateKey: string } {
  const keyPair = new JSEncrypt({ default_key_size: keySize.toString() });
  keyPair.getKey();

  const publicKey = keyPair.getPublicKey();
  const privateKey = keyPair.getPrivateKey();

  if (!publicKey || !privateKey) {
    throw new Error("Failed to generate RSA key pair");
  }

  return {
    publicKey,
    privateKey
  };
}

/**
 * Encrypts a value using RSA public key encryption.
 * The encrypted output can only be decrypted by the client using their private key.
 * This ensures that we (Avo) cannot decrypt the values on our backend.
 *
 * @param value - The value to encrypt (any type - will be JSON stringified)
 * @param publicKey - The RSA public key in PEM format provided by the client
 * @returns Base64-encoded encrypted string that can only be decrypted with the private key
 */
export function encryptValue(value: any, publicKey: string): string {
  // Convert the value to a JSON string to support all types
  const stringValue = JSON.stringify(value);

  // Create a new JSEncrypt instance
  const encrypt = new JSEncrypt();

  // Set the public key
  encrypt.setPublicKey(publicKey);

  // Encrypt the value
  const encrypted = encrypt.encrypt(stringValue);

  if (!encrypted) {
    throw new Error("Failed to encrypt value. Please check that the public key is valid.");
  }

  // Return the base64-encoded encrypted string
  return encrypted;
}

/**
 * Decrypts a value that was encrypted using encryptValue.
 * This function is provided for testing purposes - clients will use this
 * with their PRIVATE key to decrypt the values.
 *
 * IMPORTANT: This should only be used client-side with the private key.
 * The SDK never has access to the private key.
 *
 * @param encryptedValue - The base64-encoded encrypted string
 * @param privateKey - The RSA private key in PEM format (client-side only)
 * @returns The original value (parsed from JSON)
 */
export function decryptValue(encryptedValue: string, privateKey: string): any {
  // Create a new JSEncrypt instance
  const decrypt = new JSEncrypt();

  // Set the private key
  decrypt.setPrivateKey(privateKey);

  // Decrypt the value
  const decrypted = decrypt.decrypt(encryptedValue);

  if (!decrypted) {
    throw new Error("Failed to decrypt value. Please check that the private key is valid and matches the public key used for encryption.");
  }

  // Parse the JSON string back to the original value
  return JSON.parse(decrypted);
}
