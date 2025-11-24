#!/usr/bin/env node

// Use jsencrypt directly since the dist bundle is webpack-minified
const JSEncrypt = require('jsencrypt');

function generateKeyPair(keySize = 2048) {
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

const command = process.argv[2];

function showHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    AVO INSPECTOR CLI                          ║
╚═══════════════════════════════════════════════════════════════╝

Usage:
  npx avo-inspector <command>

Commands:
  generate-keys    Generate RSA key pair for property encryption
  help            Show this help message

Examples:
  npx avo-inspector generate-keys
  `);
}

function generateKeys() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           Generating RSA Key Pair (2048-bit)...              ║
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
    console.log('1. Add these keys to your .env file:\n');
    console.log('   AVO_PUBLIC_KEY="<paste public key above>"');
    console.log('   AVO_PRIVATE_KEY="<paste private key above>"\n');
    console.log('2. Add .env to .gitignore (if not already)\n');
    console.log('3. Use in your code:\n');
    console.log('   const inspector = new AvoInspector({');
    console.log('     apiKey: process.env.AVO_API_KEY,');
    console.log('     env: AvoInspectorEnv.Dev,');
    console.log('     version: "1.0.0",');
    console.log('     publicKey: process.env.AVO_PUBLIC_KEY');
    console.log('   });\n');
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
