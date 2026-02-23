/**
 * Generates a new ECC key pair for encryption/decryption.
 * Uses secp256k1 curve (P-256 family) which provides 128-bit security.
 *
 * @returns An object containing the private and public keys as hex strings
 */
export declare function generateKeyPair(): {
    privateKey: string;
    publicKey: string;
};
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
export declare function encryptValue(value: any, publicKey: string): string;
/**
 * Decrypts a value that was encrypted with encryptValue.
 *
 * @param encryptedValue - The base64-encoded encrypted string
 * @param privateKey - The ECC private key in hex format
 * @returns The original decrypted value (parsed from JSON)
 */
export declare function decryptValue(encryptedValue: string, privateKey: string): any;
