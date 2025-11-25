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
    // Convert encrypted value from base64 to Uint8Array
    // Note: We use Uint8Array directly instead of Buffer because in some environments
    // (like jsdom), Buffer instanceof Uint8Array returns false due to different realms
    const encryptedBuffer = new Uint8Array(Buffer.from(encryptedValue, "base64"));

    // eciesjs decrypt expects a hex string for the private key and a Uint8Array for data
    // Ensure privateKey is a string
    const privateKeyStr = typeof privateKey === "string" ? privateKey : String(privateKey);

    // Decrypt using ECIES (returns Uint8Array)
    const decrypted = eciesDecrypt(privateKeyStr, encryptedBuffer);

    // Convert to string and parse JSON
    // Use Buffer.from() to handle both Buffer and Uint8Array return types across environments
    const stringValue = Buffer.from(decrypted).toString("utf8");
    return JSON.parse(stringValue);
  } catch (error) {
    throw new Error(
      `Failed to decrypt value. Please check that the private key is valid and matches the public key used for encryption. Error: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
