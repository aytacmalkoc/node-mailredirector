const fs = require('fs');
const path = require('path');
const EncryptionService = require('./encryption');
const { logInfo, logError, logWarn } = require('./logger');

/**
 * Configuration Manager for handling encrypted and plain config files
 */
class ConfigManager {
    constructor() {
        this.encryptionService = new EncryptionService();
        this.configDir = path.join(__dirname, '../config');
        this.encryptedConfigPath = path.join(this.configDir, 'config.encrypted.json');
        this.sensitiveVars = [
            'IMAP_PASSWORD',
            'SMTP_PASSWORD',
            'API_KEY', // For future use
            'WEBHOOK_SECRET' // For future use
        ];
    }

    /**
     * Gets master password from environment or generates one
     * @returns {string} Master password
     */
    getMasterPassword() {
        // First, try to get from environment
        if (process.env.ENCRYPTION_KEY) {
            return process.env.ENCRYPTION_KEY;
        }

        // Try to read from key file
        const keyFilePath = path.join(this.configDir, '.encryption_key');
        if (fs.existsSync(keyFilePath)) {
            try {
                const key = fs.readFileSync(keyFilePath, 'utf8').trim();
                if (key) {
                    return key;
                }
            } catch (error) {
                logWarn('Failed to read encryption key file', { error: error.message });
            }
        }

        // If no key found, warn and return empty (will use plain .env)
        logWarn('No encryption key found. Using plain .env file. Set ENCRYPTION_KEY environment variable or create .encryption_key file.');
        return null;
    }

    /**
     * Loads configuration from encrypted file if available, otherwise uses .env
     * @returns {Object} Configuration object
     */
    loadConfig() {
        const masterPassword = this.getMasterPassword();

        // If no encryption key, use plain .env (default behavior)
        if (!masterPassword) {
            logInfo('Using plain .env configuration');
            return {};
        }

        // Try to load encrypted config
        if (fs.existsSync(this.encryptedConfigPath)) {
            try {
                const decryptedConfig = this.encryptionService.loadEncryptedConfig(
                    this.encryptedConfigPath,
                    masterPassword
                );

                // Merge decrypted values into process.env
                for (const [key, value] of Object.entries(decryptedConfig)) {
                    if (!process.env[key] || process.env[key] === '') {
                        process.env[key] = value;
                        logInfo(`Loaded encrypted config: ${key}`);
                    } else {
                        logWarn(`Environment variable ${key} already set, skipping encrypted value`);
                    }
                }

                return decryptedConfig;
            } catch (error) {
                logError('Failed to load encrypted config, falling back to .env', error);
                return {};
            }
        } else {
            logInfo('Encrypted config file not found, using .env');
            return {};
        }
    }

    /**
     * Encrypts current .env sensitive variables and saves to encrypted config
     * @param {string} masterPassword - Master password (optional, will use getMasterPassword if not provided)
     * @returns {boolean} Success status
     */
    encryptCurrentConfig(masterPassword = null) {
        try {
            const password = masterPassword || this.getMasterPassword();
            if (!password) {
                logError('No encryption key available. Set ENCRYPTION_KEY or create .encryption_key file.');
                return false;
            }

            // Collect sensitive variables from process.env
            const sensitiveData = {};
            for (const key of this.sensitiveVars) {
                if (process.env[key]) {
                    sensitiveData[key] = process.env[key];
                }
            }

            if (Object.keys(sensitiveData).length === 0) {
                logWarn('No sensitive variables found to encrypt');
                return false;
            }

            // Encrypt and save
            const success = this.encryptionService.encryptConfig(
                sensitiveData,
                password,
                this.encryptedConfigPath
            );

            if (success) {
                logInfo('Configuration encrypted successfully', {
                    variables: Object.keys(sensitiveData),
                    path: this.encryptedConfigPath
                });
            }

            return success;
        } catch (error) {
            logError('Failed to encrypt configuration', error);
            return false;
        }
    }

    /**
     * Creates encryption key file
     * @param {string} keyPath - Path to save key file
     * @returns {string} Generated key
     */
    createKeyFile(keyPath = null) {
        try {
            const keyPathToUse = keyPath || path.join(this.configDir, '.encryption_key');
            const key = this.encryptionService.generatePassword(32);

            // Ensure config directory exists
            if (!fs.existsSync(this.configDir)) {
                fs.mkdirSync(this.configDir, { recursive: true });
            }

            // Write key file
            fs.writeFileSync(keyPathToUse, key, 'utf8');

            // Set restrictive permissions (Unix-like systems)
            if (process.platform !== 'win32') {
                fs.chmodSync(keyPathToUse, 0o600);
            }

            logInfo('Encryption key file created', { path: keyPathToUse });
            return key;
        } catch (error) {
            logError('Failed to create encryption key file', error);
            throw error;
        }
    }

    /**
     * Validates encrypted config file
     * @returns {boolean} True if valid
     */
    validateEncryptedConfig() {
        try {
            if (!fs.existsSync(this.encryptedConfigPath)) {
                return false;
            }

            const masterPassword = this.getMasterPassword();
            if (!masterPassword) {
                return false;
            }

            // Try to decrypt one variable to validate
            const decrypted = this.encryptionService.loadEncryptedConfig(
                this.encryptedConfigPath,
                masterPassword
            );

            return Object.keys(decrypted).length > 0;
        } catch (error) {
            return false;
        }
    }
}

module.exports = ConfigManager;

