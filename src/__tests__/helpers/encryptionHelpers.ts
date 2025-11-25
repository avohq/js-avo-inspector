import { PrivateKey, decrypt as eciesDecrypt } from "eciesjs";

/**
 * Test helper: Generates a new ECC key pair for testing encryption.
 * This is also available in the CLI tool (bin/avo-inspector.js) for production use.
 */
export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const privateKey = new PrivateKey();
  const publicKey = privateKey.publicKey;

  return {
    publicKey: publicKey.toHex(),
    privateKey: privateKey.toHex()
  };
}

/**
 * Test helper: Decrypts a value that was encrypted using encryptValue.
 * Used for testing purposes only.
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
