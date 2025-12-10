import { generateKeyPair as generateKeyPairImpl, decryptValue as decryptValueImpl } from "../../AvoEncryption";

/**
 * Test helper: Generates a new ECC key pair for testing encryption.
 * This is also available in the CLI tool (bin/avo-inspector.js) for production use.
 */
export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const keyPair = generateKeyPairImpl();
  return {
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey
  };
}

/**
 * Test helper: Decrypts a value that was encrypted using encryptValue.
 * Used for testing purposes only.
 */
export async function decryptValue(encryptedValue: string, privateKey: string): Promise<any> {
  return await decryptValueImpl(encryptedValue, privateKey);
}
