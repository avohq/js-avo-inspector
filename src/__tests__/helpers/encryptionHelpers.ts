const JSEncrypt = require("jsencrypt");

/**
 * Test helper: Generates a new RSA key pair for testing encryption.
 * This is also available in the CLI tool (bin/avo-inspector.js) for production use.
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
 * Test helper: Decrypts a value that was encrypted using encryptValue.
 * Used for testing purposes only.
 */
export function decryptValue(encryptedValue: string, privateKey: string): any {
  const decrypt = new JSEncrypt();
  decrypt.setPrivateKey(privateKey);

  const decrypted = decrypt.decrypt(encryptedValue);

  if (!decrypted) {
    throw new Error("Failed to decrypt value. Please check that the private key is valid and matches the public key used for encryption.");
  }

  return JSON.parse(decrypted);
}
