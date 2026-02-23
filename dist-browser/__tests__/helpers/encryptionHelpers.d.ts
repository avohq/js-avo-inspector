/**
 * Test helper: Generates a new ECC key pair for testing encryption.
 * This is also available in the CLI tool (bin/avo-inspector.js) for production use.
 */
export declare function generateKeyPair(): {
    publicKey: string;
    privateKey: string;
};
/**
 * Test helper: Decrypts a value that was encrypted using encryptValue.
 * Used for testing purposes only.
 */
export declare function decryptValue(encryptedValue: string, privateKey: string): any;
