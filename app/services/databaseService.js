const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { logInfo, logError, logDebug } = require('../utils/logger');
const { MESSAGES } = require('../constants/messages');

class DatabaseService {
    constructor() {
        this.db = null;
        this.dbPath = path.join(__dirname, '../../data/processed_emails.db');
        this.isInitialized = false;
    }

    /**
     * Initializes database and creates tables
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            try {
                // Create database directory
                const fs = require('fs');
                const dbDir = path.dirname(this.dbPath);
                if (!fs.existsSync(dbDir)) {
                    fs.mkdirSync(dbDir, { recursive: true });
                }

                this.db = new sqlite3.Database(this.dbPath, (err) => {
                    if (err) {
                        logError(MESSAGES.DATABASE_CONNECTION_FAILED, err);
                        reject(err);
                        return;
                    }

                    logInfo(MESSAGES.DATABASE_CONNECTION_ESTABLISHED, {
                        dbPath: this.dbPath
                    });

                    this.createTables()
                        .then(() => {
                            this.isInitialized = true;
                            logInfo(MESSAGES.DATABASE_TABLES_CREATED);
                            resolve();
                        })
                        .catch(reject);
                });
            } catch (error) {
                logError(MESSAGES.DATABASE_CONNECTION_FAILED, error);
                reject(error);
            }
        });
    }

    /**
     * Creates required tables
     */
    async createTables() {
        return new Promise((resolve, reject) => {
            const createProcessedEmailsTable = `
                CREATE TABLE IF NOT EXISTS processed_emails (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    message_id TEXT UNIQUE NOT NULL,
                    uid TEXT,
                    from_email TEXT,
                    subject TEXT,
                    processed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    forwarded BOOLEAN DEFAULT 0,
                    forward_recipients TEXT,
                    error_message TEXT,
                    email_size INTEGER,
                    flags TEXT
                )
            `;

            const createIndexes = `
                CREATE INDEX IF NOT EXISTS idx_message_id ON processed_emails(message_id);
                CREATE INDEX IF NOT EXISTS idx_processed_at ON processed_emails(processed_at);
                CREATE INDEX IF NOT EXISTS idx_uid ON processed_emails(uid);
            `;

            this.db.serialize(() => {
                this.db.run(createProcessedEmailsTable, (err) => {
                    if (err) {
                        logError(MESSAGES.DATABASE_TABLE_CREATION_FAILED, err);
                        reject(err);
                        return;
                    }

                    this.db.run(createIndexes, (err) => {
                        if (err) {
                            logError(MESSAGES.DATABASE_INDEX_CREATION_FAILED, err);
                            reject(err);
                            return;
                        }

                        resolve();
                    });
                });
            });
        });
    }

    /**
     * Checks if the email has already been processed
     * @param {string} messageId - Email message ID
     * @param {string} uid - Email UID
     * @returns {Promise<boolean>} True if processed
     */
    async isEmailProcessed(messageId, uid = null) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized) {
                resolve(false);
                return;
            }

            let query = 'SELECT id FROM processed_emails WHERE message_id = ?';
            let params = [messageId];

            if (uid) {
                query += ' OR uid = ?';
                params.push(uid);
            }

            this.db.get(query, params, (err, row) => {
                if (err) {
                    logError('Error checking email processed status', err);
                    reject(err);
                    return;
                }

                const isProcessed = !!row;
                logDebug('Checked email processed status', {
                    messageId,
                    uid,
                    isProcessed
                });

                resolve(isProcessed);
            });
        });
    }

    /**
     * Saves the processed email
     * @param {Object} emailData - Email data
     * @param {boolean} forwarded - Forwarded?
     * @param {Array} recipients - Recipients
     * @param {string} errorMessage - Error message
     */
    async saveProcessedEmail(emailData, forwarded = false, recipients = [], errorMessage = null) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized) {
                resolve();
                return;
            }

            const query = `
                INSERT OR REPLACE INTO processed_emails 
                (message_id, uid, from_email, subject, forwarded, forward_recipients, error_message, email_size, flags)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `;

            const params = [
                emailData.messageId,
                emailData.uid,
                emailData.from,
                emailData.subject,
                forwarded ? 1 : 0,
                JSON.stringify(recipients),
                errorMessage,
                emailData.size,
                JSON.stringify(emailData.flags || [])
            ];

            this.db.run(query, params, function (err) {
                if (err) {
                    logError('Error saving processed email', err);
                    reject(err);
                    return;
                }

                logDebug('Processed email saved', {
                    messageId: emailData.messageId,
                    forwarded,
                    rowId: this.lastID
                });

                resolve();
            });
        });
    }

    /**
     * Gets processed emails since a specific date
     * @param {Date} sinceDate - Start date
     * @returns {Promise<Array>} Processed emails
     */
    async getProcessedEmailsSince(sinceDate) {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized) {
                resolve([]);
                return;
            }

            const query = `
                SELECT * FROM processed_emails 
                WHERE processed_at >= datetime(?)
                ORDER BY processed_at DESC
            `;

            this.db.all(query, [sinceDate.toISOString()], (err, rows) => {
                if (err) {
                    logError('Error getting processed emails', err);
                    reject(err);
                    return;
                }

                resolve(rows);
            });
        });
    }

    /**
     * Cleans up old records (older than 30 days)
     * @returns {Promise<number>} Number of deleted records
     */
    async cleanupOldRecords() {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized) {
                resolve(0);
                return;
            }

            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const query = 'DELETE FROM processed_emails WHERE processed_at < datetime(?)';

            this.db.run(query, [thirtyDaysAgo.toISOString()], function (err) {
                if (err) {
                    logError('Error cleaning up old records', err);
                    reject(err);
                    return;
                }

                logInfo('Old email records cleaned up', {
                    deletedCount: this.changes
                });

                resolve(this.changes);
            });
        });
    }

    /**
     * Gets database statistics
     * @returns {Promise<Object>} Statistics
     */
    async getStats() {
        return new Promise((resolve, reject) => {
            if (!this.isInitialized) {
                resolve({
                    totalProcessed: 0,
                    totalForwarded: 0,
                    totalSkipped: 0,
                    totalErrors: 0,
                    databaseSize: 0
                });
                return;
            }

            const queries = [
                'SELECT COUNT(*) as total FROM processed_emails',
                'SELECT COUNT(*) as forwarded FROM processed_emails WHERE forwarded = 1',
                'SELECT COUNT(*) as skipped FROM processed_emails WHERE forwarded = 0 AND error_message IS NULL',
                'SELECT COUNT(*) as errors FROM processed_emails WHERE error_message IS NOT NULL'
            ];

            Promise.all(queries.map(query => {
                return new Promise((resolve, reject) => {
                    this.db.get(query, (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });
            }))
                .then(results => {
                    const stats = {
                        totalProcessed: results[0].total,
                        totalForwarded: results[1].forwarded,
                        totalSkipped: results[2].skipped,
                        totalErrors: results[3].errors,
                        databaseSize: 0
                    };

                    // Get database file size
                    const fs = require('fs');
                    if (fs.existsSync(this.dbPath)) {
                        stats.databaseSize = fs.statSync(this.dbPath).size;
                    }

                    resolve(stats);
                })
                .catch(reject);
        });
    }

    /**
     * Closes database connection
     */
    async close() {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        logError('Error closing database', err);
                    } else {
                        logInfo('Database connection closed');
                    }
                    this.isInitialized = false;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = DatabaseService; 