import { decryptValue as decryptValueImpl } from "../../AvoEncryption";

/**
 * Hardcoded test key pair for consistent test results.
 * Private Key: 94f89e29dd69262a94a43928fdcbc9ecea37984821077c97527cb0155bff6b47
 * Public Key: 03cc229e87bbfed91571a6d995292bd5e4558fef4002a055d063dccafc5bfc3c45
 */
export const TEST_KEY_PAIR = {
  publicKey: "03cc229e87bbfed91571a6d995292bd5e4558fef4002a055d063dccafc5bfc3c45",
  privateKey: "94f89e29dd69262a94a43928fdcbc9ecea37984821077c97527cb0155bff6b47"
};

/**
 * Second hardcoded test key pair for tests that need multiple keys.
 * Generated using: const keyPair = ec.genKeyPair(); keyPair.getPublic('hex')
 * Private Key: 89798bb1bda92fee8c18361bc37d18f0a7f22ed3d67c571e8d23164c284372f6
 * Public Key: 04d89a33fa18d1d9a3a551f558fba7a41c1cb8329084b5b5ebbf359db0eba1b93a036be701bbe8c73402db96bba745854b3c880b87062363c3596625cc4988364c
 */
export const TEST_KEY_PAIR_2 = {
  publicKey: "04d89a33fa18d1d9a3a551f558fba7a41c1cb8329084b5b5ebbf359db0eba1b93a036be701bbe8c73402db96bba745854b3c880b87062363c3596625cc4988364c",
  privateKey: "89798bb1bda92fee8c18361bc37d18f0a7f22ed3d67c571e8d23164c284372f6"
};

/**
 * Test helper: Decrypts a value that was encrypted using encryptValue.
 * Used for testing purposes only.
 */
export function decryptValue(encryptedValue: string, privateKey: string): any {
  return decryptValueImpl(encryptedValue, privateKey);
}

