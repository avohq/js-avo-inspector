#!/usr/bin/env node

// Use eciesjs directly for ECC key generation
const { PrivateKey } = require('eciesjs');

function generateKeyPair() {
  // Generate a new random private key (32 bytes / 256 bits)
  const privateKey = new PrivateKey();

  // Derive the public key from the private key
  const publicKey = privateKey.publicKey;

  return {
    publicKey: publicKey.toHex(),
    privateKey: privateKey.toHex()
  };
}

const command = process.argv[2];

function showHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    AVO INSPECTOR CLI                          ║
╚═══════════════════════════════════════════════════════════════╝

Usage:
  npx avo-inspector <command>

Commands:
  generate-keys    Generate ECC key pair for property encryption
  help            Show this help message

Examples:
  npx avo-inspector generate-keys
  `);
}

function generateKeys() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           Generating ECC Key Pair (secp256k1)...             ║
╚═══════════════════════════════════════════════════════════════╝
`);

  try {
    const { publicKey, privateKey } = generateKeyPair();

    console.log('✅ Key pair generated successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📋 PUBLIC KEY (safe to share with Avo SDK):\n');
    console.log(publicKey);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🔐 PRIVATE KEY (⚠️  KEEP SECURE - DO NOT COMMIT TO GIT):\n');
    console.log(privateKey);
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('📝 Next Steps:\n');
    console.log('1. Use the PUBLIC KEY in your SDK initialization:\n');
    console.log('   const inspector = new AvoInspector({');
    console.log('     apiKey: "your-api-key",');
    console.log('     env: AvoInspectorEnv.Dev,');
    console.log('     version: "1.0.0",');
    console.log('     publicKey: "<paste public key above>"');
    console.log('   });\n');
    console.log('   💡 The public key is not a secret - you can hardcode it or use .env\n');
    console.log('2. Save the PRIVATE KEY externally (password manager, secure notes)');
    console.log('   - The SDK never uses the private key');
    console.log('   - You only need it to decrypt values in Avo\'s dashboard\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('ℹ️  Note: Property encryption only works in dev/staging environments.');
    console.log('   Production data is never encrypted for performance.\n');
  } catch (error) {
    console.error('❌ Error generating keys:', error.message);
    process.exit(1);
  }
}

// Main command router
switch (command) {
  case 'generate-keys':
    generateKeys();
    break;
  case 'help':
  case '--help':
  case '-h':
    showHelp();
    break;
  case undefined:
    console.error('❌ No command specified\n');
    showHelp();
    process.exit(1);
    break;
  default:
    console.error(`❌ Unknown command: ${command}\n`);
    showHelp();
    process.exit(1);
}
