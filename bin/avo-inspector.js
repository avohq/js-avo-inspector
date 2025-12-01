#!/usr/bin/env node

// Use eciesjs directly for ECC key generation
const { PrivateKey } = require('eciesjs');
const fs = require('fs');
const path = require('path');

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
const outputFlag = process.argv[3];

function showHelp() {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                    AVO INSPECTOR CLI                          ║
╚═══════════════════════════════════════════════════════════════╝

Usage:
  npx avo-inspector <command> [options]

Commands:
  generate-keys           Generate ECC key pair for property encryption
  help                   Show this help message

Options:
  --output, -o           Write keys to files instead of stdout
                         Creates: avo-public.key and avo-private.key

Examples:
  npx avo-inspector generate-keys           # Print keys to console
  npx avo-inspector generate-keys --output  # Write keys to files
  npx avo-inspector generate-keys -o        # Write keys to files (short form)
  `);
}

function generateKeys(writeToFiles = false) {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║           Generating ECC Key Pair (secp256k1)...             ║
╚═══════════════════════════════════════════════════════════════╝
`);

  try {
    const { publicKey, privateKey } = generateKeyPair();

    if (writeToFiles) {
      // Write keys to files instead of printing to console
      const publicKeyPath = path.join(process.cwd(), 'avo-public.key');
      const privateKeyPath = path.join(process.cwd(), 'avo-private.key');

      // Check if files already exist
      if (fs.existsSync(publicKeyPath) || fs.existsSync(privateKeyPath)) {
        console.error('❌ Error: Key files already exist in current directory.');
        console.error('   Delete avo-public.key and avo-private.key first, or use a different directory.\n');
        process.exit(1);
      }

      // Write public key
      fs.writeFileSync(publicKeyPath, publicKey + '\n', { mode: 0o644 });
      console.log(`✅ Public key written to:  ${publicKeyPath}`);

      // Write private key with restrictive permissions (owner read/write only)
      fs.writeFileSync(privateKeyPath, privateKey + '\n', { mode: 0o600 });
      console.log(`✅ Private key written to: ${privateKeyPath}`);

      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('⚠️  IMPORTANT: Add avo-private.key to your .gitignore!\n');
      console.log('   echo "avo-private.key" >> .gitignore\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('📝 Next Steps:\n');
      console.log('1. Use the PUBLIC KEY in your SDK initialization:\n');
      console.log('   const inspector = new AvoInspector({');
      console.log('     apiKey: "your-api-key",');
      console.log('     env: AvoInspectorEnv.Dev,');
      console.log('     version: "1.0.0",');
      console.log('     publicKey: fs.readFileSync("avo-public.key", "utf8").trim()');
      console.log('   });\n');
      console.log('2. Store avo-private.key securely (password manager, vault, etc.)');
      console.log('   - The SDK never uses the private key');
      console.log('   - You only need it to decrypt values in Avo\'s dashboard\n');
    } else {
      // Print keys to console (original behavior)
      console.log('✅ Key pair generated successfully!\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('📋 PUBLIC KEY (safe to share with Avo SDK):\n');
      console.log(publicKey);
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('🔐 PRIVATE KEY (⚠️  KEEP SECURE - DO NOT COMMIT TO GIT):\n');
      console.log(privateKey);
      console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('💡 TIP: Use --output flag to write keys to files instead:\n');
      console.log('   npx avo-inspector generate-keys --output\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
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
    }

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
    const writeToFiles = outputFlag === '--output' || outputFlag === '-o';
    generateKeys(writeToFiles);
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
