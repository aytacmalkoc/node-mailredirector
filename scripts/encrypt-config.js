#!/usr/bin/env node

/**
 * CLI script to encrypt configuration
 * Usage: node scripts/encrypt-config.js [--password <password>] [--key-file <path>]
 */

require('dotenv').config();
const readline = require('readline');
const ConfigManager = require('../app/utils/configManager');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function main() {
    console.log('🔐 Mail Redirector - Configuration Encryption Tool\n');

    const configManager = new ConfigManager();

    // Parse command line arguments
    const args = process.argv.slice(2);
    let password = null;
    let keyFilePath = null;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--password' && args[i + 1]) {
            password = args[i + 1];
            i++;
        } else if (args[i] === '--key-file' && args[i + 1]) {
            keyFilePath = args[i + 1];
            i++;
        } else if (args[i] === '--help' || args[i] === '-h') {
            console.log(`
Usage: node scripts/encrypt-config.js [options]

Options:
  --password <password>    Master password for encryption
  --key-file <path>       Path to save encryption key file
  --help, -h              Show this help message

Examples:
  node scripts/encrypt-config.js
  node scripts/encrypt-config.js --password "my-secure-password"
  node scripts/encrypt-config.js --key-file ./config/.encryption_key
            `);
            process.exit(0);
        }
    }

    try {
        // Check if encryption key exists
        let masterPassword = configManager.getMasterPassword();

        if (!masterPassword) {
            console.log('📝 No encryption key found. Creating new key file...\n');
            
            if (!keyFilePath) {
                keyFilePath = path.join(__dirname, '../app/config/.encryption_key');
            }

            const generatedKey = configManager.createKeyFile(keyFilePath);
            console.log(`✅ Encryption key created: ${keyFilePath}`);
            console.log(`⚠️  IMPORTANT: Save this key securely! You'll need it to decrypt the configuration.\n`);
            
            masterPassword = generatedKey;
        } else {
            console.log('✅ Encryption key found\n');
        }

        // Get password if not provided
        if (!password) {
            password = await question('Enter master password (or press Enter to use key file): ');
            if (!password.trim()) {
                password = masterPassword;
            }
        }

        // Check for sensitive variables
        const sensitiveVars = ['IMAP_PASSWORD', 'SMTP_PASSWORD'];
        const hasSensitiveVars = sensitiveVars.some(key => process.env[key]);

        if (!hasSensitiveVars) {
            console.log('⚠️  No sensitive variables found in environment.');
            console.log('   Make sure IMAP_PASSWORD and SMTP_PASSWORD are set in .env file.\n');
            process.exit(1);
        }

        console.log('\n🔒 Encrypting configuration...\n');

        // Encrypt configuration
        const success = configManager.encryptCurrentConfig(password);

        if (success) {
            console.log('✅ Configuration encrypted successfully!');
            console.log(`📁 Encrypted config saved to: ${configManager.encryptedConfigPath}\n`);
            console.log('📋 Next steps:');
            console.log('   1. Remove sensitive values from .env file (optional but recommended)');
            console.log('   2. Keep the encryption key file secure');
            console.log('   3. Restart the application\n');
        } else {
            console.error('❌ Failed to encrypt configuration');
            process.exit(1);
        }
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

main();

