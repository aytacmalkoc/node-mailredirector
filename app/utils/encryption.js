const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { logInfo, logError, logWarn } = require('./logger');

/**
 * Encryption utility for securing sensitive configuration data
 */
class EncryptionService {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32; // 256 bits
        this.ivLength = 16; // 128 bits
        this.saltLength = 64; // 512 bits
        this.tagLength = 16; // 128 bits
        this.iterations = 100000; // PBKDF2 iterations
    }

    /**
     * Derives encryption key from password using PBKDF2
     * @param {string} password - Master password
     * @param {Buffer} salt - Salt for key derivation
     * @returns {Buffer} Derived key
     */
    deriveKey(password, salt) {
        return crypto.pbkdf2Sync(
            password,
            salt,
            this.iterations,
            this.keyLength,
            'sha256'
        );
    }

    /**
     * Encrypts a string value
     * @param {string} text - Text to encrypt
     * @param {string} password - Master password
     * @returns {string} Encrypted string (base64 encoded)
     */
    encrypt(text, password) {
        try {
            if (!text || !password) {
                throw new Error('Text and password are required');
            }

            // Generate salt and IV
            const salt = crypto.randomBytes(this.saltLength);
            const iv = crypto.randomBytes(this.ivLength);

            // Derive key from password
            const key = this.deriveKey(password, salt);

            // Create cipher
            const cipher = crypto.createCipheriv(this.algorithm, key, iv);

            // Encrypt
            let encrypted = cipher.update(text, 'utf8', 'base64');
            encrypted += cipher.final('base64');

            // Get authentication tag
            const tag = cipher.getAuthTag();

            // Combine salt + iv + tag + encrypted data
            const combined = Buffer.concat([
                salt,
                iv,
                tag,
                Buffer.from(encrypted, 'base64')
            ]);

            return combined.toString('base64');
        } catch (error) {
            logError('Encryption failed', error);
            throw error;
        }
    }

    /**
     * Decrypts an encrypted string
     * @param {string} encryptedText - Encrypted text (base64 encoded)
     * @param {string} password - Master password
     * @returns {string} Decrypted text
     */
    decrypt(encryptedText, password) {
        try {
            if (!encryptedText || !password) {
                throw new Error('Encrypted text and password are required');
            }

            // Decode base64
            const combined = Buffer.from(encryptedText, 'base64');

            // Extract components
            const salt = combined.slice(0, this.saltLength);
            const iv = combined.slice(this.saltLength, this.saltLength + this.ivLength);
            const tag = combined.slice(
                this.saltLength + this.ivLength,
                this.saltLength + this.ivLength + this.tagLength
            );
            const encrypted = combined.slice(this.saltLength + this.ivLength + this.tagLength);

            // Derive key from password
            const key = this.deriveKey(password, salt);

            // Create decipher
            const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
            decipher.setAuthTag(tag);

            // Decrypt
            let decrypted = decipher.update(encrypted, null, 'utf8');
            decrypted += decipher.final('utf8');

            return decrypted;
        } catch (error) {
            logError('Decryption failed', error);
            throw new Error('Failed to decrypt: Invalid password or corrupted data');
        }
    }

    /**
     * Encrypts environment variables and saves to encrypted config file
     * @param {Object} envVars - Environment variables to encrypt
     * @param {string} password - Master password
     * @param {string} outputPath - Output file path
     * @returns {boolean} Success status
     */
    encryptConfig(envVars, password, outputPath) {
        try {
            const encryptedConfig = {};

            // Encrypt each sensitive variable
            for (const [key, value] of Object.entries(envVars)) {
                if (value) {
                    encryptedConfig[key] = this.encrypt(value, password);
                }
            }

            // Save to file
            const configDir = path.dirname(outputPath);
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }

            fs.writeFileSync(
                outputPath,
                JSON.stringify(encryptedConfig, null, 2),
                'utf8'
            );

            // Set restrictive permissions (Unix-like systems)
            if (process.platform !== 'win32') {
                fs.chmodSync(outputPath, 0o600);
            }

            logInfo('Encrypted config file created', { path: outputPath });
            return true;
        } catch (error) {
            logError('Failed to create encrypted config', error);
            return false;
        }
    }

    /**
     * Loads and decrypts configuration from encrypted file
     * @param {string} configPath - Path to encrypted config file
     * @param {string} password - Master password
     * @returns {Object} Decrypted environment variables
     */
    loadEncryptedConfig(configPath, password) {
        try {
            if (!fs.existsSync(configPath)) {
                logWarn('Encrypted config file not found', { path: configPath });
                return {};
            }

            // Read encrypted config
            const encryptedData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const decryptedConfig = {};

            // Decrypt each variable
            for (const [key, encryptedValue] of Object.entries(encryptedData)) {
                try {
                    decryptedConfig[key] = this.decrypt(encryptedValue, password);
                } catch (error) {
                    logWarn(`Failed to decrypt ${key}`, { error: error.message });
                    // Continue with other variables
                }
            }

            logInfo('Encrypted config loaded successfully', {
                variables: Object.keys(decryptedConfig).length
            });

            return decryptedConfig;
        } catch (error) {
            logError('Failed to load encrypted config', error);
            return {};
        }
    }

    /**
     * Generates a secure random password
     * @param {number} length - Password length (default: 32)
     * @returns {string} Random password
     */
    generatePassword(length = 32) {
        return crypto.randomBytes(length).toString('base64');
    }
}

module.exports = EncryptionService;

