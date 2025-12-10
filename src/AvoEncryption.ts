/* eslint-disable @typescript-eslint/no-explicit-any */
import * as EC from 'elliptic'

// Initialize EC context for P-256 curve
const ec = new EC.ec('p256')

// Get crypto API - works in both browser and Node.js environments
// In browser: window.crypto or globalThis.crypto
// In Node.js: global.crypto or globalThis.crypto (polyfilled in tests)
const getCrypto = (): any => {
  // Try globalThis first (works in both Node.js and browsers)
  if (typeof globalThis !== 'undefined' && globalThis.crypto) {
    const crypto = globalThis.crypto as any;
    if (crypto && crypto.subtle) {
      return crypto;
    }
  }
  // Try window (browser)
  if (typeof window !== 'undefined' && window.crypto) {
    const crypto = window.crypto as any;
    if (crypto && crypto.subtle) {
      return crypto;
    }
  }
  // Try global (Node.js)
  if (typeof global !== 'undefined' && global.crypto) {
    const crypto = global.crypto as any;
    if (crypto && crypto.subtle) {
      return crypto;
    }
  }
  // Fallback - should not happen in proper environments
  const debugInfo = {
    hasGlobalThis: typeof globalThis !== 'undefined',
    hasGlobalThisCrypto: typeof globalThis !== 'undefined' && !!globalThis.crypto,
    hasGlobalThisCryptoSubtle: typeof globalThis !== 'undefined' && !!globalThis.crypto && !!(globalThis.crypto as any).subtle,
    hasWindow: typeof window !== 'undefined',
    hasWindowCrypto: typeof window !== 'undefined' && !!window.crypto,
    hasGlobal: typeof global !== 'undefined',
    hasGlobalCrypto: typeof global !== 'undefined' && !!global.crypto,
    hasGlobalCryptoSubtle: typeof global !== 'undefined' && !!global.crypto && !!(global.crypto as any).subtle
  };
  throw new Error('crypto.subtle not available. Debug: ' + JSON.stringify(debugInfo));
};

/**
 * Generates a new ECC key pair for encryption/decryption.
 * Uses P-256 (prime256v1 / NIST P-256) curve which is standard for Web Crypto API.
 *
 * @returns An object containing the private and public keys as hex strings
 */
export function generateKeyPair(): { privateKey: string; publicKey: string } {
  // Generate a new random key pair
  const keyPair = ec.genKeyPair()

  // Get private key as hex string (64 characters = 32 bytes)
  const privateKey = keyPair.getPrivate('hex').padStart(64, '0')

  // Get public key as hex string (uncompressed format: 130 characters = 65 bytes)
  // Format: '04' + x-coordinate (64 chars) + y-coordinate (64 chars)
  const publicKey = keyPair.getPublic('hex')

  return {
    privateKey,
    publicKey
  }
}

/**
 * Converts a hex string to Uint8Array
 */
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

/**
 * Converts a Uint8Array to hex string
 */
function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Derives a key from shared secret using SHA-256
 */
async function deriveKey(sharedSecret: Uint8Array): Promise<ArrayBuffer> {
  const cryptoAPI = getCrypto();
  return await cryptoAPI.subtle.digest('SHA-256', sharedSecret as any)
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
 * SPECIFICATION (Standard Web Crypto Profile):
 * 1. Curve: P-256 (prime256v1 / NIST P-256)
 * 2. Key Derivation (KDF): SHA-256(SharedSecret)
 * 3. Cipher: AES-256-GCM
 * 4. Serialization: [Version(1b)] + [EphemeralPubKey(33 or 65b)] + [IV(16b)] + [AuthTag(16b)] + [Ciphertext]
 *    Version 0x00 = Standard Web Profile
 *    EphemeralPubKey: 0x04 (uncompressed) + 64 bytes = 65 bytes total, or compressed format (33 bytes)
 *
 * @param value - The value to encrypt (any type - will be JSON stringified)
 * @param publicKey - The ECC public key in hex format provided by the client
 * @returns Promise resolving to base64-encoded encrypted string that can only be decrypted with the private key
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function encryptValue(value: any, publicKey: string): Promise<string> {
  try {
    // Convert the value to a JSON string to support all types
    // Note: JSON.stringify(undefined) returns undefined (not a string), so handle it explicitly
    const stringValue = value === undefined ? 'null' : JSON.stringify(value)

    if (stringValue === undefined) {
      throw new Error('Cannot encrypt undefined value')
    }

    // 1. Prepare Public Key
    // Ensure publicKey is a string
    const publicKeyStr = typeof publicKey === 'string' ? publicKey : String(publicKey)
    // Parse the recipient's public key
    const recipientPublicKey = ec.keyFromPublic(publicKeyStr, 'hex')

    // 2. Generate Ephemeral Key Pair on P-256
    const ephemeralKeyPair = ec.genKeyPair()
    const ephemeralPublicKeyHex = ephemeralKeyPair.getPublic('hex') // Uncompressed format (130 chars = 65 bytes)
    const ephemeralPublicKeyBytes = hexToUint8Array(ephemeralPublicKeyHex)

    // 3. Derive Shared Secret (ECDH)
    // Get the public key point from recipient's key
    const recipientPublicPoint = recipientPublicKey.getPublic()
    // Derive shared secret (returns a BN - BigNumber)
    const sharedSecretBN = ephemeralKeyPair.derive(recipientPublicPoint)
    // Convert BigNumber to Uint8Array (32 bytes, big-endian)
    const sharedSecretArray = sharedSecretBN.toArray('be', 32)
    const sharedSecret = new Uint8Array(sharedSecretArray)

    // 4. Key Derivation (Hash with SHA-256)
    const derivedKeyBuffer = await deriveKey(sharedSecret)

    // 5. Import Key for Web Crypto AES-GCM
    const cryptoAPI = getCrypto();
    const keyMaterial = await cryptoAPI.subtle.importKey(
      'raw',
      derivedKeyBuffer,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    )

    // 6. Generate random IV (16 bytes)
    const iv = cryptoAPI.getRandomValues(new Uint8Array(16))

    // 7. Encrypt using AES-256-GCM
    // Convert string to Uint8Array
    const plaintext = new TextEncoder().encode(stringValue)
    const encryptedData = await cryptoAPI.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128 // 16 bytes = 128 bits
      },
      keyMaterial,
      plaintext
    )

    // Web Crypto API appends the auth tag to the ciphertext
    // We need to extract it separately for our format
    const encryptedArray = new Uint8Array(encryptedData)
    const authTagLength = 16 // 128 bits = 16 bytes
    const ciphertextLength = encryptedArray.length - authTagLength
    const ciphertext = encryptedArray.slice(0, ciphertextLength)
    const authTag = encryptedArray.slice(ciphertextLength)

    // 8. Serialize Output
    // Format: [Version(1)] + [Ephemeral Public Key(65)] + [IV(16)] + [AuthTag(16)] + [Ciphertext]
    const version = new Uint8Array([0x00]) // Version 0: Standard Web Profile

    // Combine all parts
    const resultLength = 1 + ephemeralPublicKeyBytes.length + 16 + 16 + ciphertext.length
    const result = new Uint8Array(resultLength)
    let offset = 0

    result.set(version, offset)
    offset += 1

    result.set(ephemeralPublicKeyBytes, offset)
    offset += ephemeralPublicKeyBytes.length

    result.set(iv, offset)
    offset += 16

    result.set(authTag, offset)
    offset += 16

    result.set(ciphertext, offset)

    // Convert to base64
    // Use Array.from to avoid downlevelIteration issue
    return btoa(String.fromCharCode.apply(null, Array.from(result)))
  } catch (error) {
    throw new Error(
      `Failed to encrypt value. Please check that the public key is valid. Error: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

/**
 * Decrypts a value that was encrypted with encryptValue.
 *
 * SPECIFICATION (Standard Web Crypto Profile):
 * 1. Curve: P-256 (prime256v1 / NIST P-256)
 * 2. Key Derivation (KDF): SHA-256(SharedSecret)
 * 3. Cipher: AES-256-GCM
 * 4. Deserialization: [Version(1b)] + [EphemeralPubKey(33 or 65b)] + [IV(16b)] + [AuthTag(16b)] + [Ciphertext]
 *
 * @param encryptedValue - The base64-encoded encrypted string
 * @param privateKey - The ECC private key in hex format
 * @returns Promise resolving to the original decrypted value (parsed from JSON)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function decryptValue(encryptedValue: string, privateKey: string): Promise<any> {
  try {
    // Convert encrypted value from base64 to Uint8Array
    const binaryString = atob(encryptedValue)
    const encryptedBuffer = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      encryptedBuffer[i] = binaryString.charCodeAt(i)
    }

    // Ensure privateKey is a string
    const privateKeyStr = typeof privateKey === 'string' ? privateKey : String(privateKey)

    // 1. Deserialize Input
    // Format: [Version(1)] + [Ephemeral Public Key(33 or 65)] + [IV(16)] + [AuthTag(16)] + [Ciphertext]
    let offset = 0
    const version = encryptedBuffer[offset]
    offset += 1

    if (version !== 0x00) {
      throw new Error(`Unsupported encryption version: ${version}`)
    }

    // Check header to determine public key size (0x02/0x03 = 33 bytes compressed, 0x04 = 65 bytes uncompressed)
    const keyHeader = encryptedBuffer[offset]
    const pubKeySize = keyHeader === 0x02 || keyHeader === 0x03 ? 33 : 65

    const ephemeralPublicKey = encryptedBuffer.slice(offset, offset + pubKeySize)
    offset += pubKeySize

    const iv = encryptedBuffer.slice(offset, offset + 16) // IV (16 bytes)
    offset += 16

    const authTag = encryptedBuffer.slice(offset, offset + 16) // Auth tag (16 bytes)
    offset += 16

    const ciphertext = encryptedBuffer.slice(offset) // Remaining bytes are ciphertext

    // 2. Prepare Private Key
    const recipientKey = ec.keyFromPrivate(privateKeyStr, 'hex')

    // 3. Derive Shared Secret (ECDH)
    const ephemeralKey = ec.keyFromPublic(ephemeralPublicKey)
    const ephemeralPublicPoint = ephemeralKey.getPublic()
    const sharedSecretBN = recipientKey.derive(ephemeralPublicPoint)

    // Convert BigNumber to Uint8Array (32 bytes, big-endian)
    const sharedSecretArray = sharedSecretBN.toArray('be', 32)
    const sharedSecret = new Uint8Array(sharedSecretArray)

    // 4. Key Derivation (Hash with SHA-256)
    const derivedKeyBuffer = await deriveKey(sharedSecret)

    // 5. Import Key for Web Crypto AES-GCM
    const cryptoAPI = getCrypto();
    const keyMaterial = await cryptoAPI.subtle.importKey(
      'raw',
      derivedKeyBuffer,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    )

    // 6. Decrypt using AES-256-GCM
    // Web Crypto API expects the auth tag appended to ciphertext
    const combinedLength = ciphertext.length + authTag.length
    const data = new Uint8Array(combinedLength)
    data.set(ciphertext, 0)
    data.set(authTag, ciphertext.length)

    const decryptedBuffer = await cryptoAPI.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
        tagLength: 128 // 16 bytes = 128 bits
      },
      keyMaterial,
      data
    )

    // 7. Convert to string and parse JSON
    const decoder = new TextDecoder()
    const stringValue = decoder.decode(decryptedBuffer)
    return JSON.parse(stringValue)
  } catch (error) {
    throw new Error(
      `Failed to decrypt value. Please check that the private key is valid and matches the public key used for encryption. Error: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}
