/* eslint-disable @typescript-eslint/no-explicit-any */
import { p256 } from '@noble/curves/p256'

/**
 * Converts bytes (Uint8Array) to hex string
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Converts hex string to bytes (Uint8Array)
 */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

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
  // Generate a new random private key (32 bytes)
  const privateKeyBytes = p256.utils.randomPrivateKey()

  // Get public key (uncompressed format: 65 bytes = 0x04 + 32-byte x + 32-byte y)
  const publicKeyBytes = p256.getPublicKey(privateKeyBytes, false)

  // Convert to hex strings
  const privateKey = bytesToHex(privateKeyBytes).padStart(64, '0')
  const publicKey = bytesToHex(publicKeyBytes)

  return {
    privateKey,
    publicKey
  }
}


/**
 * Derives a key from shared secret using SHA-256
 */
async function deriveKey(sharedSecret: Uint8Array): Promise<ArrayBuffer> {
  const cryptoAPI = getCrypto();
  return await cryptoAPI.subtle.digest('SHA-256', sharedSecret as any)
}

/**
 * Safely converts Uint8Array to base64 string.
 * Uses Buffer in Node.js for efficiency, or chunked conversion in browsers
 * to avoid call stack overflow with large arrays.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  // Check if we're in Node.js and Buffer is available
  if (typeof Buffer !== 'undefined' && Buffer.from) {
    return Buffer.from(bytes).toString('base64')
  }

  // Browser fallback: use chunked conversion to avoid call stack overflow
  // Chunk size of 8192 (8k) is safe for String.fromCharCode.apply
  const CHUNK_SIZE = 8192
  let binaryString = ''

  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE)
    // Convert chunk to array and use apply for this small chunk
    binaryString += String.fromCharCode.apply(null, Array.from(chunk))
  }

  return btoa(binaryString)
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
    // Convert recipient's public key from hex to bytes
    const recipientPublicKeyBytes = hexToBytes(publicKeyStr)

    // 2. Generate Ephemeral Key Pair on P-256
    const ephemeralPrivateKeyBytes = p256.utils.randomPrivateKey()
    const ephemeralPublicKeyBytes = p256.getPublicKey(ephemeralPrivateKeyBytes, false) // Uncompressed format (65 bytes)

    // 3. Derive Shared Secret (ECDH)
    // getSharedSecret returns compressed point (33 bytes: 0x02/0x03 + X-coordinate)
    // Extract X-coordinate (last 32 bytes) to match elliptic's derive().toArray("be", 32)
    const sharedSecretPoint = p256.getSharedSecret(ephemeralPrivateKeyBytes, recipientPublicKeyBytes)
    const sharedSecret = sharedSecretPoint.slice(-32) // Extract X-coordinate (last 32 bytes)

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

    // Convert to base64 using safe conversion that handles large arrays
    return uint8ArrayToBase64(result)
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

    // Minimum size: version(1) + pubkey(33 min) + iv(16) + authTag(16) + ciphertext(1 min) = 67 bytes
    if (encryptedBuffer.length < 67) {
      throw new Error('Invalid encrypted data: payload too short')
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

    // Validate buffer has enough bytes for this key format
    const minRequired = 1 + pubKeySize + 16 + 16 + 1
    if (encryptedBuffer.length < minRequired) {
      throw new Error(`Invalid encrypted data: expected at least ${minRequired} bytes, got ${encryptedBuffer.length}`)
    }

    const ephemeralPublicKey = encryptedBuffer.slice(offset, offset + pubKeySize)
    offset += pubKeySize

    const iv = encryptedBuffer.slice(offset, offset + 16) // IV (16 bytes)
    offset += 16

    const authTag = encryptedBuffer.slice(offset, offset + 16) // Auth tag (16 bytes)
    offset += 16

    const ciphertext = encryptedBuffer.slice(offset) // Remaining bytes are ciphertext

    // 2. Prepare Private Key
    const recipientPrivateKeyBytes = hexToBytes(privateKeyStr)

    // 3. Derive Shared Secret (ECDH)
    // getSharedSecret returns compressed point (33 bytes: 0x02/0x03 + X-coordinate)
    // Extract X-coordinate (last 32 bytes) to match elliptic's derive().toArray("be", 32)
    const sharedSecretPoint = p256.getSharedSecret(recipientPrivateKeyBytes, ephemeralPublicKey)
    const sharedSecret = sharedSecretPoint.slice(-32) // Extract X-coordinate (last 32 bytes)

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
