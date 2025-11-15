require('dotenv').config();

const ImapListener = require('./services/imapListener');
const KeywordChecker = require('./services/keywordChecker');
const SmtpSender = require('./services/smtpSender');
const ReportService = require('./services/reportService');
const SchedulerService = require('./services/schedulerService');
const ApiServer = require('./api/server');
const ConfigManager = require('./utils/configManager');
const { logInfo, logError, logWarn, logDebug, logForwardedEmail, logSystemStatus } = require('./utils/logger');
const { MESSAGES, ERROR_MESSAGES } = require('./constants/messages');

// Load encrypted configuration if available
const configManager = new ConfigManager();
configManager.loadConfig();

// Global error handler for uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error(MESSAGES.UNCAUGHT_EXCEPTION + ':', error);
    try {
        logError(MESSAGES.UNCAUGHT_EXCEPTION, error);
    } catch (loggerError) {
        console.error(ERROR_MESSAGES.LOGGER_ERROR + ':', loggerError);
    }
    process.exit(1);
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error(MESSAGES.UNHANDLED_REJECTION + ':', reason);
    try {
        logError(MESSAGES.UNHANDLED_REJECTION, reason);
    } catch (loggerError) {
        console.error(ERROR_MESSAGES.LOGGER_ERROR + ':', loggerError);
    }
    process.exit(1);
});

class MailRedirector {
    constructor() {
        this.imapListener = null;
        this.keywordChecker = null;
        this.smtpSender = null;
        this.reportService = null;
        this.schedulerService = null;
        this.apiServer = null;
        this.isRunning = false;
        this.stats = {
            totalEmails: 0,
            matchedEmails: 0,
            forwardedEmails: 0,
            errors: 0,
            startTime: null
        };
    }

    /**
     * Starts the application
     */
    async start() {
        try {
            logInfo(MESSAGES.APP_STARTING);

            // Validate required environment variables
            this.validateEnvironment();

            // Initialize services
            await this.initializeServices();

            // Setup email processing callback
            this.setupEmailProcessing();

            // Start IMAP listening (this initializes database service)
            this.imapListener.connect();

            // Initialize report service (after IMAP listener initializes database)
            // Wait a bit for database initialization
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (this.imapListener && this.imapListener.databaseService) {
                this.reportService = new ReportService(
                    this.imapListener.databaseService,
                    this.smtpSender
                );
                
                // Initialize scheduler service
                this.schedulerService = new SchedulerService(this.reportService);
                this.schedulerService.start();
                logInfo('Report and scheduler services started');
            }

            // Start API server if enabled
            if (process.env.API_ENABLED !== 'false') {
                this.apiServer = new ApiServer(this);
                await this.apiServer.start();
            }

            this.isRunning = true;
            this.stats.startTime = new Date().toISOString();

            logSystemStatus(MESSAGES.APP_STARTED_SUCCESS, {
                startTime: this.stats.startTime,
                checkInterval: process.env.CHECK_INTERVAL || 30000,
                apiEnabled: process.env.API_ENABLED !== 'false',
                apiPort: process.env.API_PORT || 3000
            });

            // Setup signal handlers for graceful shutdown
            this.setupSignalHandlers();

        } catch (error) {
            logError(MESSAGES.APP_START_FAILED, error);
            throw error;
        }
    }

    /**
     * Validates environment variables
     */
    validateEnvironment() {
        const requiredEnvVars = [
            'IMAP_HOST', 'IMAP_USER', 'IMAP_PASSWORD',
            'SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD'
        ];

        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingVars.length > 0) {
            const errorMessage = `${MESSAGES.MISSING_ENV_VARS}: ${missingVars.join(', ')}`;
            logError(MESSAGES.ENV_VALIDATION_FAILED, new Error(errorMessage));
            throw new Error(errorMessage);
        }

        logInfo(MESSAGES.ENV_VALIDATION_SUCCESS);
    }

    /**
     * Initializes services
     */
    async initializeServices() {
        try {
            // Initialize keyword checker
            this.keywordChecker = new KeywordChecker();
            logInfo(MESSAGES.KEYWORD_CHECKER_STARTED);

            // Initialize SMTP sender
            this.smtpSender = new SmtpSender();

            // Test SMTP connection
            const smtpTest = await this.smtpSender.testConnection();
            if (!smtpTest) {
                throw new Error(MESSAGES.SMTP_CONNECTION_TEST_FAILED);
            }
            logInfo(MESSAGES.SMTP_SENDER_STARTED);

            // Initialize IMAP listener
            this.imapListener = new ImapListener();
            logInfo(MESSAGES.IMAP_LISTENER_STARTED);

        } catch (error) {
            logError(MESSAGES.SERVICES_INIT_FAILED, error);
            throw error;
        }
    }

    /**
     * Sets up email processing callback
     */
    setupEmailProcessing() {
        this.imapListener.setEmailReceivedCallback(async (emailData) => {
            await this.processEmail(emailData);
        });
    }

    /**
     * Main email processing logic
     * @param {Object} emailData - Email data
     */
    async processEmail(emailData) {
        try {
            // Check if email was already processed in database
            if (this.imapListener && this.imapListener.databaseService) {
                const isProcessed = await this.imapListener.databaseService.isEmailProcessed(emailData.messageId, emailData.uid);
                if (isProcessed) {
                    logDebug(MESSAGES.EMAIL_ALREADY_PROCESSED, {
                        messageId: emailData.messageId,
                        subject: emailData.subject
                    });
                    return;
                }
            }

            this.stats.totalEmails++;

            logInfo(MESSAGES.EMAIL_PROCESSING, {
                messageId: emailData.messageId,
                from: emailData.from,
                subject: emailData.subject,
                totalEmails: this.stats.totalEmails
            });

            // Keyword checking
            const keywordResult = this.keywordChecker.checkKeywords(emailData);

            if (keywordResult.hasMatch) {
                this.stats.matchedEmails++;

                logInfo(MESSAGES.KEYWORD_MATCH_FOUND, {
                    matchedKeywords: keywordResult.matchedKeywords,
                    matchCount: keywordResult.matchCount,
                    matchedGroups: keywordResult.matchedGroups.map(g => g.description),
                    recipients: keywordResult.recipients,
                    subject: emailData.subject
                });

                // Forward email to specific recipients
                const forwardResult = await this.smtpSender.sendEmail(emailData, keywordResult.recipients);

                if (forwardResult.success) {
                    this.stats.forwardedEmails++;

                    // Save successful forwarding to database
                    if (this.imapListener && this.imapListener.databaseService) {
                        await this.imapListener.databaseService.saveProcessedEmail(
                            emailData,
                            true,
                            keywordResult.recipients,
                            null
                        );
                    }

                    // Special log for forwarded email
                    logForwardedEmail(emailData, forwardResult.recipients, keywordResult.matchedKeywords);
                } else {
                    this.stats.errors++;

                    // Save failed forwarding to database
                    if (this.imapListener && this.imapListener.databaseService) {
                        await this.imapListener.databaseService.saveProcessedEmail(
                            emailData,
                            false,
                            keywordResult.recipients,
                            forwardResult.error
                        );
                    }

                    logError(MESSAGES.EMAIL_FORWARD_FAILED, {
                        error: forwardResult.error,
                        subject: emailData.subject,
                        errors: this.stats.errors
                    });
                }
            } else {
                logInfo(MESSAGES.EMAIL_SKIPPED_NO_MATCH, {
                    subject: emailData.subject,
                    contentLength: keywordResult.contentLength
                });

                // Save to database even when no match found (forwarded=false)
                if (this.imapListener && this.imapListener.databaseService) {
                    await this.imapListener.databaseService.saveProcessedEmail(
                        emailData,
                        false,
                        [],
                        null
                    );
                }
            }

        } catch (error) {
            this.stats.errors++;

            // Save error status to database
            if (this.imapListener && this.imapListener.databaseService) {
                await this.imapListener.databaseService.saveProcessedEmail(
                    emailData,
                    false,
                    [],
                    error.message
                );
            }

            logError(MESSAGES.EMAIL_PROCESSING_ERROR, error, {
                messageId: emailData.messageId,
                subject: emailData.subject,
                errors: this.stats.errors
            });
        }
    }

    /**
     * Sets up signal handlers (for graceful shutdown)
     */
    setupSignalHandlers() {
        const shutdown = async (signal) => {
            logWarn(`${MESSAGES.SIGNAL_RECEIVED} ${signal}`);
            await this.stop();
            process.exit(0);
        };

        process.on('SIGINT', () => shutdown('SIGINT'));
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGQUIT', () => shutdown('SIGQUIT'));
    }

    /**
     * Stops the application
     */
    async stop() {
        try {
            logInfo(MESSAGES.APP_STOPPING);

            this.isRunning = false;

            // Stop scheduler service
            if (this.schedulerService) {
                this.schedulerService.stop();
            }

            // Stop API server
            if (this.apiServer) {
                await this.apiServer.stop();
            }

            if (this.imapListener) {
                await this.imapListener.disconnect();
            }

            const finalStats = await this.getStats();
            logSystemStatus(MESSAGES.APP_STOPPED, {
                finalStats: finalStats
            });

        } catch (error) {
            logError(MESSAGES.APP_STOP_FAILED, error);
        }
    }

    /**
     * Returns application statistics
     * @returns {Object} Statistics
     */
    async getStats() {
        const uptime = this.stats.startTime ?
            Date.now() - new Date(this.stats.startTime).getTime() : 0;

        const imapStatus = this.imapListener ? await this.imapListener.getStatus() : null;

        return {
            ...this.stats,
            uptime: Math.floor(uptime / 1000), // in seconds
            isRunning: this.isRunning,
            imapStatus: imapStatus
        };
    }

    /**
     * Reloads configurations
     */
    reloadConfig() {
        try {
            if (this.keywordChecker) {
                this.keywordChecker.reloadKeywords();
            }

            logInfo(MESSAGES.CONFIG_RELOADED);
        } catch (error) {
            logError(MESSAGES.CONFIG_RELOAD_FAILED, error);
        }
    }
}

// Main application instance
const mailRedirector = new MailRedirector();

// Start application only when run directly
if (require.main === module) {
    mailRedirector.start().catch((error) => {
        try {
            logError(MESSAGES.APP_START_FAILED, error);
        } catch (loggerError) {
            console.error(MESSAGES.CRITICAL_ERROR + ':', error.message);
            console.error(ERROR_MESSAGES.LOGGER_ERROR + ':', loggerError.message);
        }
        process.exit(1);
    });
}

// Export for testing purposes
module.exports = MailRedirector;