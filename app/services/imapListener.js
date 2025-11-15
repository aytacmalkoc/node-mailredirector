const Imap = require('node-imap');
const { simpleParser } = require('mailparser');
const { logInfo, logError, logWarn, logDebug, logSystemStatus } = require('../utils/logger');
const DatabaseService = require('./databaseService');
const { MESSAGES } = require('../constants/messages');

class ImapListener {
    constructor() {
        this.imap = null;
        this.isConnected = false;
        this.isListening = false;
        this.databaseService = null;
        this.retryCount = 0;
        this.maxRetryAttempts = parseInt(process.env.MAX_RETRY_ATTEMPTS) || 10;
        this.baseRetryDelay = parseInt(process.env.BASE_RETRY_DELAY) || 5000;
        this.maxRetryDelay = parseInt(process.env.MAX_RETRY_DELAY) || 300000; // 5 dakika
        this.checkInterval = parseInt(process.env.CHECK_INTERVAL) || 30000;
        this.checkTimer = null;
        this.onlyUnread = process.env.ONLY_UNREAD === 'true';
        this.reconnectTimer = null;
        
        // Folder configuration
        this.foldersToMonitor = ['INBOX'];
        if (process.env.MONITOR_SPAM === 'true' && process.env.SPAM_FOLDER_NAME) {
            this.foldersToMonitor.push(process.env.SPAM_FOLDER_NAME);
        }
    }

    /**
     * Initializes IMAP connection
     */
    async initializeConnection() {
        try {
            // Initialize database service
            this.databaseService = new DatabaseService();
            await this.databaseService.initialize();

            const config = {
                user: process.env.IMAP_USER,
                password: process.env.IMAP_PASSWORD,
                host: process.env.IMAP_HOST,
                port: parseInt(process.env.IMAP_PORT) || 993,
                tls: process.env.IMAP_TLS === 'true',
                tlsOptions: {
                    rejectUnauthorized: false
                },
                connTimeout: 60000,
                authTimeout: 5000,
                debug: process.env.NODE_ENV === 'development' ? console.log : null
            };

            this.imap = new Imap(config);

            logSystemStatus(MESSAGES.IMAP_CONNECTION_STARTED, {
                host: config.host,
                port: config.port,
                user: config.user,
                tls: config.tls,
                onlyUnread: this.onlyUnread,
                foldersToMonitor: this.foldersToMonitor
            });

            this.setupEventHandlers();
        } catch (error) {
            logError(MESSAGES.IMAP_CONNECTION_ERROR, error);
            throw error;
        }
    }

    /**
     * Sets up IMAP event handlers
     */
    setupEventHandlers() {
        this.imap.on('ready', () => {
            logSystemStatus(MESSAGES.IMAP_CONNECTION_READY);
            this.isConnected = true;
            this.retryCount = 0; // Reset retry count on successful connection
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            this.startListening();
        });

        this.imap.on('error', (error) => {
            logError(MESSAGES.IMAP_CONNECTION_ERROR, error);
            this.isConnected = false;
            this.handleConnectionError();
        });

        this.imap.on('end', () => {
            logWarn(MESSAGES.IMAP_CONNECTION_ENDED);
            this.isConnected = false;
            this.isListening = false;
        });

        this.imap.on('close', () => {
            logWarn(MESSAGES.IMAP_CONNECTION_CLOSED);
            this.isConnected = false;
            this.isListening = false;
        });
    }

    /**
     * Calculates exponential backoff delay
     * @param {number} attemptNumber - Current attempt number
     * @returns {number} Delay in milliseconds
     */
    calculateBackoffDelay(attemptNumber) {
        // Exponential backoff: baseDelay * (2 ^ attemptNumber)
        const exponentialDelay = this.baseRetryDelay * Math.pow(2, attemptNumber - 1);
        // Add jitter (random 0-25% of delay) to prevent thundering herd
        const jitter = Math.random() * exponentialDelay * 0.25;
        const totalDelay = exponentialDelay + jitter;
        
        // Cap at maxRetryDelay
        return Math.min(totalDelay, this.maxRetryDelay);
    }

    /**
     * Handles reconnection on connection error with exponential backoff
     */
    handleConnectionError() {
        if (this.retryCount < this.maxRetryAttempts) {
            this.retryCount++;
            const delay = this.calculateBackoffDelay(this.retryCount);
            
            logWarn(`${MESSAGES.IMAP_RECONNECT_ATTEMPT} ${this.retryCount}/${this.maxRetryAttempts}`, {
                retryDelay: Math.round(delay),
                nextRetryIn: `${Math.round(delay / 1000)}s`
            });

            // Clear any existing reconnect timer
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
            }

            this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.connect();
            }, delay);
        } else {
            logError(MESSAGES.IMAP_RECONNECT_FAILED, {
                maxRetries: this.maxRetryAttempts,
                lastAttempt: this.retryCount
            });
            
            // Reset retry count after max attempts to allow manual restart
            // Will retry again after a longer delay (maxRetryDelay)
            logWarn('Maximum retry attempts reached. Will retry after extended delay.', {
                extendedDelay: `${Math.round(this.maxRetryDelay / 1000)}s`
            });
            
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
            }
            
            this.reconnectTimer = setTimeout(() => {
                this.retryCount = 0; // Reset counter for new attempt cycle
                this.reconnectTimer = null;
                logInfo('Retrying connection after extended delay...');
                this.connect();
            }, this.maxRetryDelay);
        }
    }

    /**
     * Connects to IMAP server
     */
    async connect() {
        try {
            if (!this.imap) {
                await this.initializeConnection();
            }

            this.imap.connect();
            logInfo('Connecting to IMAP server...');
        } catch (error) {
            logError(MESSAGES.IMAP_CONNECTION_ERROR, error);
            this.handleConnectionError();
        }
    }

    /**
     * Starts email listening
     */
    startListening() {
        if (this.isListening) {
            logWarn('Email listening already active');
            return;
        }

        this.isListening = true;
        logSystemStatus(MESSAGES.IMAP_LISTENING_STARTED);

        // Initial check - only once
        this.checkNewEmails();

        // Start periodic check mode
        this.startPeriodicCheck();
    }

    /**
     * Starts periodic check mode
     */
    startPeriodicCheck() {
        logSystemStatus('Periodic check mode started');

        this.checkTimer = setInterval(() => {
            if (this.isConnected) {
                this.checkNewEmails();
            }
        }, this.checkInterval);
    }

    /**
     * Checks for new emails in all monitored folders
     */
    checkNewEmails() {
        if (!this.isConnected) {
            logWarn('No IMAP connection, skipping email check');
            return;
        }

        // Check each folder
        this.foldersToMonitor.forEach(folderName => {
            this.checkFolderForNewEmails(folderName);
        });
    }

    /**
     * Checks for new emails in a specific folder
     * @param {string} folderName - Name of the folder to check
     */
    checkFolderForNewEmails(folderName) {
        try {
            this.imap.openBox(folderName, false, (error, box) => {
                if (error) {
                    // Log warning but don't fail - spam folder might not exist
                    if (folderName !== 'INBOX') {
                        logDebug(`Folder ${folderName} not found or cannot be opened`, { error: error.message });
                    } else {
                        logError(`Error opening ${folderName}`, error);
                    }
                    return;
                }

                // Get unread email count
                const unreadCount = box.messages.unseen || 0;

                // Process only if there are new emails
                if (box.messages.new > 0) {
                    logInfo(MESSAGES.IMAP_EMAILS_FOUND, {
                        folder: folderName,
                        newCount: box.messages.new
                    });
                    this.fetchNewEmails(folderName);
                } else if (this.onlyUnread && unreadCount > 0) {
                    // Check unread emails on first startup
                    logInfo('Searching for unread emails', {
                        folder: folderName,
                        unreadCount: unreadCount
                    });
                    this.fetchUnreadEmails(folderName);
                }
                // Don't write any log if there are no emails to process
            });
        } catch (error) {
            logError(`Error during email check for folder ${folderName}`, error);
        }
    }

    /**
     * Fetches and processes new emails (only those with RECENT flag)
     * @param {string} folderName - Name of the folder (default: 'INBOX')
     */
    fetchNewEmails(folderName = 'INBOX') {
        // Ensure we're in the correct folder
        this.imap.openBox(folderName, false, (error, box) => {
            if (error) {
                logError(`Error opening folder ${folderName} for fetching`, error);
                return;
            }

            // Search only for new emails (those with RECENT flag)
            this.imap.search(['RECENT'], (error, uids) => {
                if (error) {
                    logError(`Error searching for new emails in ${folderName}`, error);
                    return;
                }

                if (!uids || uids.length === 0) {
                    logDebug(MESSAGES.IMAP_NO_NEW_EMAILS, { folder: folderName });
                    return;
                }

                logInfo(MESSAGES.IMAP_FETCHING_EMAILS, {
                    folder: folderName,
                    count: uids.length
                });

                // Fetch new emails
                const fetch = this.imap.fetch(uids, {
                    bodies: '',
                    struct: true,
                    envelope: true
                });

                fetch.on('message', (msg, seqno) => {
                    let buffer = '';
                    let attributes = null;

                    msg.on('body', (stream, info) => {
                        stream.on('data', (chunk) => {
                            buffer += chunk.toString('utf8');
                        });
                    });

                    msg.once('attributes', (attrs) => {
                        attributes = attrs;
                    });

                    msg.once('end', () => {
                        this.processEmail(buffer, attributes);
                    });
                });

                fetch.once('error', (error) => {
                    logError(`Error fetching new emails from ${folderName}`, error);
                });

                fetch.once('end', () => {
                    logInfo('New email fetching completed', {
                        folder: folderName,
                        processedCount: uids.length
                    });
                });
            });
        });
    }

    /**
     * Fetches and processes emails
     * @param {number} messageCount - Total message count
     */
    fetchEmails(messageCount) {
        const fetch = this.imap.seq.fetch(`${Math.max(1, messageCount - 10)}:${messageCount}`, {
            bodies: '',
            struct: true,
            envelope: true
        });

        fetch.on('message', (msg, seqno) => {
            let buffer = '';
            let attributes = null;

            msg.on('body', (stream, info) => {
                stream.on('data', (chunk) => {
                    buffer += chunk.toString('utf8');
                });
            });

            msg.once('attributes', (attrs) => {
                attributes = attrs;
            });

            msg.once('end', () => {
                this.processEmail(buffer, attributes);
            });
        });

        fetch.once('error', (error) => {
            logError('E-posta getirme hatası', error);
        });

        fetch.once('end', () => {
            logDebug('E-posta getirme işlemi tamamlandı');
        });
    }

    /**
     * Okunmamış e-postaları getirir ve işler
     * @param {string} folderName - Name of the folder (default: 'INBOX')
     */
    fetchUnreadEmails(folderName = 'INBOX') {
        // Ensure we're in the correct folder
        this.imap.openBox(folderName, false, (error, box) => {
            if (error) {
                logError(`Error opening folder ${folderName} for unread emails`, error);
                return;
            }

            // Önce okunmamış e-postaların UID'lerini al
            this.imap.search(['UNSEEN'], (error, uids) => {
                if (error) {
                    logError(`Error searching for unread emails in ${folderName}`, error);
                    return;
                }

                if (!uids || uids.length === 0) {
                    logDebug('Okunmamış e-posta bulunamadı', { folder: folderName });
                    return;
                }

                logInfo('Okunmamış e-postalar işleniyor', {
                    folder: folderName,
                    count: uids.length
                });

                // Okunmamış e-postaları getir
                const fetch = this.imap.fetch(uids, {
                    bodies: '',
                    struct: true,
                    envelope: true
                });

                fetch.on('message', (msg, seqno) => {
                    let buffer = '';
                    let attributes = null;

                    msg.on('body', (stream, info) => {
                        stream.on('data', (chunk) => {
                            buffer += chunk.toString('utf8');
                        });
                    });

                    msg.once('attributes', (attrs) => {
                        attributes = attrs;
                    });

                    msg.once('end', () => {
                        this.processEmail(buffer, attributes);
                    });
                });

                fetch.once('error', (error) => {
                    logError(`Error fetching unread emails from ${folderName}`, error);
                });

                fetch.once('end', () => {
                    logInfo('Okunmamış e-posta getirme işlemi tamamlandı', {
                        folder: folderName,
                        processedCount: uids.length
                    });
                });
            });
        });
    }

    /**
     * E-posta içeriğini işler
     * @param {string} buffer - E-posta içeriği
     * @param {Object} attributes - E-posta özellikleri
     */
    async processEmail(buffer, attributes) {
        try {
            const parsed = await simpleParser(buffer);

            const emailData = {
                uid: attributes.uid,
                messageId: parsed.messageId,
                from: parsed.from?.text || 'Bilinmeyen',
                to: parsed.to?.text || '',
                subject: parsed.subject || 'Konu Yok',
                text: parsed.text || '',
                html: parsed.html || '',
                date: parsed.date?.toISOString() || new Date().toISOString(),
                attachments: parsed.attachments || [],
                size: attributes.size,
                flags: attributes.flags || []
            };

            // Veritabanı kontrolü ana uygulama tarafından yapılacak

            logInfo('Yeni e-posta işleniyor', {
                messageId: emailData.messageId,
                from: emailData.from,
                subject: emailData.subject,
                hasAttachments: emailData.attachments.length > 0
            });

            // E-posta işleme callback'ini çağır
            if (this.onEmailReceived) {
                await this.onEmailReceived(emailData);
            }

            // Veritabanı kayıt işlemi ana uygulama tarafından yapılacak

        } catch (error) {
            logError('E-posta işlenirken hata oluştu', error, {
                uid: attributes?.uid,
                size: attributes?.size
            });
        }
    }

    /**
     * E-posta dinlemeyi durdurur
     */
    stopListening() {
        if (this.checkTimer) {
            clearInterval(this.checkTimer);
            this.checkTimer = null;
        }

        this.isListening = false;
        logInfo('E-posta dinleme durduruldu');
    }

    /**
     * IMAP bağlantısını kapatır
     */
    async disconnect() {
        this.stopListening();

        // Clear reconnect timer
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.imap && this.isConnected) {
            this.imap.end();
            logInfo('IMAP bağlantısı kapatıldı');
        }

        // Veritabanı bağlantısını kapat
        if (this.databaseService) {
            await this.databaseService.close();
        }
    }

    /**
     * Returns the connection status
     * @returns {Object} Connection status
     */
    async getStatus() {
        const dbStats = this.databaseService ? await this.databaseService.getStats() : null;

        return {
            isConnected: this.isConnected,
            isListening: this.isListening,
            retryCount: this.retryCount,
            onlyUnread: this.onlyUnread,
            databaseStats: dbStats
        };
    }

    /**
     * Sets the callback to be called when an email is received
     * @param {Function} callback - Email processing callback
     */
    setEmailReceivedCallback(callback) {
        this.onEmailReceived = callback;
        logInfo("Email processing callback set");
    }
}

module.exports = ImapListener;
