const express = require('express');
const { logInfo, logError, logWarn } = require('../utils/logger');
const { MESSAGES } = require('../constants/messages');
const LogService = require('../services/logService');
const ConfigManager = require('../utils/configManager');

class ApiServer {
    constructor(mailRedirector) {
        this.app = express();
        this.mailRedirector = mailRedirector;
        this.port = parseInt(process.env.API_PORT) || 3000;
        this.server = null;
        this.logService = new LogService();
        this.configManager = new ConfigManager();
        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Sets up Express middleware
     */
    setupMiddleware() {
        // Serve static files from public directory
        const path = require('path');
        this.app.use(express.static(path.join(__dirname, '../../public')));

        // JSON body parser
        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));

        // Request logging middleware
        this.app.use((req, res, next) => {
            logInfo(`API Request: ${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('user-agent')
            });
            next();
        });

        // Error handling middleware
        this.app.use((err, req, res, next) => {
            logError('API Error', err, {
                method: req.method,
                path: req.path
            });
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: process.env.NODE_ENV === 'development' ? err.message : undefined
            });
        });
    }

    /**
     * Sets up API routes
     */
    setupRoutes() {
        // Root path - serve index.html
        this.app.get('/', (req, res) => {
            const path = require('path');
            res.sendFile(path.join(__dirname, '../../public/index.html'));
        });

        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                success: true,
                status: 'healthy',
                timestamp: new Date().toISOString()
            });
        });

        // Status endpoint
        this.app.get('/api/status', async (req, res) => {
            try {
                const stats = await this.mailRedirector.getStats();
                
                // Get IMAP status
                const imapStatus = this.mailRedirector.imapListener ? 
                    await this.mailRedirector.imapListener.getStatus() : null;
                
                // Get SMTP status
                const smtpStatus = this.mailRedirector.smtpSender ? {
                    isConnected: !!this.mailRedirector.smtpSender.transporter
                } : null;
                
                // Get Database status
                const dbStatus = this.mailRedirector.imapListener?.databaseService ? {
                    isInitialized: this.mailRedirector.imapListener.databaseService.isInitialized || false
                } : null;
                
                // Get Keywords status
                const keywordsStatus = this.mailRedirector.keywordChecker ? {
                    loaded: true,
                    total: this.mailRedirector.keywordChecker.getKeywords().length,
                    groups: this.mailRedirector.keywordChecker.getKeywordGroups().length
                } : null;
                
                res.json({
                    success: true,
                    data: {
                        ...stats,
                        imap: imapStatus ? {
                            isConnected: imapStatus.isConnected,
                            isListening: imapStatus.isListening
                        } : null,
                        smtp: smtpStatus,
                        database: dbStatus,
                        keywords: keywordsStatus
                    }
                });
            } catch (error) {
                logError('Status endpoint error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Logs endpoint (recent logs)
        this.app.get('/api/logs', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const offset = parseInt(req.query.offset) || 0;
                const level = req.query.level || 'all';
                const search = req.query.search || null;
                const fromDate = req.query.fromDate || null;
                const toDate = req.query.toDate || null;
                const filename = req.query.filename || null;

                // If filename is specified, read that specific file
                if (filename) {
                    const result = this.logService.readLogFile(filename, {
                        limit,
                        offset,
                        level,
                        search,
                        fromDate,
                        toDate
                    });

                    if (!result.success) {
                        return res.status(404).json(result);
                    }

                    return res.json({
                        success: true,
                        data: result
                    });
                }

                // Otherwise, get logs from all files (prioritize system and error logs)
                const logFiles = this.logService.getLogFiles()
                    .filter(file => file.type === 'system' || file.type === 'error')
                    .slice(0, 3); // Get latest 3 log files

                const allEntries = [];
                for (const file of logFiles) {
                    const result = this.logService.readLogFile(file.name, {
                        limit: 1000, // Get more entries to merge
                        level,
                        search,
                        fromDate,
                        toDate
                    });

                    if (result.success) {
                        allEntries.push(...result.entries.map(entry => ({
                            ...entry,
                            logFile: file.name
                        })));
                    }
                }

                // Sort by timestamp (newest first)
                allEntries.sort((a, b) => 
                    new Date(b.timestamp) - new Date(a.timestamp)
                );

                // Apply pagination
                const paginatedEntries = allEntries.slice(offset, offset + limit);

                res.json({
                    success: true,
                    data: {
                        entries: paginatedEntries,
                        total: allEntries.length,
                        limit,
                        offset,
                        hasMore: offset + limit < allEntries.length
                    }
                });
            } catch (error) {
                logError('Logs endpoint error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Log files endpoint
        this.app.get('/api/logs/files', (req, res) => {
            try {
                const files = this.logService.getLogFiles();
                res.json({
                    success: true,
                    data: files
                });
            } catch (error) {
                logError('Log files endpoint error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Log statistics endpoint
        this.app.get('/api/logs/stats', (req, res) => {
            try {
                const filename = req.query.filename || null;
                const stats = this.logService.getLogStats(filename);
                res.json({
                    success: true,
                    data: stats
                });
            } catch (error) {
                logError('Log stats endpoint error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Failed sends endpoint
        this.app.get('/api/logs/failed-sends', (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const failedSends = this.logService.getFailedSends(limit);
                res.json({
                    success: true,
                    data: failedSends,
                    count: failedSends.length
                });
            } catch (error) {
                logError('Failed sends endpoint error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Keywords endpoint
        this.app.get('/api/keywords', (req, res) => {
            try {
                if (!this.mailRedirector.keywordChecker) {
                    return res.status(503).json({
                        success: false,
                        error: 'Keyword checker not initialized'
                    });
                }

                const keywords = this.mailRedirector.keywordChecker.getKeywords();
                const keywordGroups = this.mailRedirector.keywordChecker.getKeywordGroups();
                const defaultRecipients = this.mailRedirector.keywordChecker.getDefaultRecipients();

                res.json({
                    success: true,
                    data: {
                        keywords,
                        keywordGroups,
                        defaultRecipients,
                        totalKeywords: keywords.length,
                        totalGroups: keywordGroups.length
                    }
                });
            } catch (error) {
                logError('Keywords endpoint error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Add keyword group endpoint
        this.app.post('/api/keywords/groups', (req, res) => {
            try {
                if (!this.mailRedirector.keywordChecker) {
                    return res.status(503).json({
                        success: false,
                        error: 'Keyword checker not initialized'
                    });
                }

                const group = req.body;
                this.mailRedirector.keywordChecker.addKeywordGroup(group);

                res.json({
                    success: true,
                    message: 'Keyword group added successfully'
                });
            } catch (error) {
                logError('Add keyword group error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Update keyword group endpoint
        this.app.put('/api/keywords/groups/:index', (req, res) => {
            try {
                if (!this.mailRedirector.keywordChecker) {
                    return res.status(503).json({
                        success: false,
                        error: 'Keyword checker not initialized'
                    });
                }

                const index = parseInt(req.params.index);
                const group = req.body;

                if (isNaN(index)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid group index'
                    });
                }

                this.mailRedirector.keywordChecker.updateKeywordGroup(index, group);

                res.json({
                    success: true,
                    message: 'Keyword group updated successfully'
                });
            } catch (error) {
                logError('Update keyword group error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Delete keyword group endpoint
        this.app.delete('/api/keywords/groups/:index', (req, res) => {
            try {
                if (!this.mailRedirector.keywordChecker) {
                    return res.status(503).json({
                        success: false,
                        error: 'Keyword checker not initialized'
                    });
                }

                const index = parseInt(req.params.index);

                if (isNaN(index)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid group index'
                    });
                }

                this.mailRedirector.keywordChecker.deleteKeywordGroup(index);

                res.json({
                    success: true,
                    message: 'Keyword group deleted successfully'
                });
            } catch (error) {
                logError('Delete keyword group error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Update default recipients endpoint
        this.app.put('/api/keywords/default-recipients', (req, res) => {
            try {
                if (!this.mailRedirector.keywordChecker) {
                    return res.status(503).json({
                        success: false,
                        error: 'Keyword checker not initialized'
                    });
                }

                const { recipients } = req.body;

                if (!Array.isArray(recipients)) {
                    return res.status(400).json({
                        success: false,
                        error: 'Recipients must be an array'
                    });
                }

                this.mailRedirector.keywordChecker.updateDefaultRecipients(recipients);

                res.json({
                    success: true,
                    message: 'Default recipients updated successfully'
                });
            } catch (error) {
                logError('Update default recipients error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Reload config endpoint
        this.app.post('/api/config/reload', (req, res) => {
            try {
                this.mailRedirector.reloadConfig();
                res.json({
                    success: true,
                    message: 'Configuration reloaded successfully'
                });
            } catch (error) {
                logError('Config reload error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Encrypt config endpoint
        this.app.post('/api/config/encrypt', (req, res) => {
            try {
                const { password } = req.body;
                
                if (!password) {
                    return res.status(400).json({
                        success: false,
                        error: 'Password is required'
                    });
                }

                const success = this.configManager.encryptCurrentConfig(password);
                
                if (success) {
                    res.json({
                        success: true,
                        message: 'Configuration encrypted successfully',
                        path: this.configManager.encryptedConfigPath
                    });
                } else {
                    res.status(500).json({
                        success: false,
                        error: 'Failed to encrypt configuration'
                    });
                }
            } catch (error) {
                logError('Config encrypt error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Config encryption status endpoint
        this.app.get('/api/config/encryption-status', (req, res) => {
            try {
                const hasEncryptedConfig = this.configManager.validateEncryptedConfig();
                const hasKey = !!this.configManager.getMasterPassword();
                
                res.json({
                    success: true,
                    data: {
                        encryptedConfigExists: hasEncryptedConfig,
                        encryptionKeyAvailable: hasKey,
                        encryptedConfigPath: this.configManager.encryptedConfigPath
                    }
                });
            } catch (error) {
                logError('Config encryption status error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Processed emails endpoint
        this.app.get('/api/emails/processed', async (req, res) => {
            try {
                const limit = parseInt(req.query.limit) || 50;
                const offset = parseInt(req.query.offset) || 0;
                const since = req.query.since ? new Date(req.query.since) : null;

                if (!this.mailRedirector.imapListener || !this.mailRedirector.imapListener.databaseService) {
                    return res.status(503).json({
                        success: false,
                        error: 'Database service not available'
                    });
                }

                const dbService = this.mailRedirector.imapListener.databaseService;
                let emails;

                if (since) {
                    emails = await dbService.getProcessedEmailsSince(since);
                } else {
                    // Get recent emails (last 30 days)
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    emails = await dbService.getProcessedEmailsSince(thirtyDaysAgo);
                }

                // Get total count before pagination
                const total = emails.length;

                // Apply pagination
                const paginatedEmails = emails.slice(offset, offset + limit);

                // Parse JSON fields safely
                const parsedEmails = paginatedEmails.map(email => {
                    let forwardRecipients = [];
                    let flags = [];
                    
                    // Parse forward_recipients
                    if (email.forward_recipients) {
                        try {
                            if (typeof email.forward_recipients === 'string') {
                                const trimmed = email.forward_recipients.trim();
                                if (trimmed && trimmed !== 'null' && trimmed !== '') {
                                    forwardRecipients = JSON.parse(trimmed);
                                    // Ensure it's an array
                                    if (!Array.isArray(forwardRecipients)) {
                                        forwardRecipients = [];
                                    }
                                }
                            } else if (Array.isArray(email.forward_recipients)) {
                                forwardRecipients = email.forward_recipients;
                            }
                        } catch (e) {
                            logWarn('Error parsing forward_recipients', { 
                                messageId: email.message_id,
                                forward_recipients: email.forward_recipients,
                                error: e.message 
                            });
                            forwardRecipients = [];
                        }
                    }
                    
                    // Parse flags
                    if (email.flags) {
                        try {
                            if (typeof email.flags === 'string') {
                                const trimmed = email.flags.trim();
                                if (trimmed && trimmed !== 'null' && trimmed !== '') {
                                    flags = JSON.parse(trimmed);
                                    // Ensure it's an array
                                    if (!Array.isArray(flags)) {
                                        flags = [];
                                    }
                                }
                            } else if (Array.isArray(email.flags)) {
                                flags = email.flags;
                            }
                        } catch (e) {
                            logWarn('Error parsing flags', { 
                                messageId: email.message_id,
                                flags: email.flags,
                                error: e.message 
                            });
                            flags = [];
                        }
                    }
                    
                    return {
                        ...email,
                        forward_recipients: forwardRecipients,
                        flags: flags
                    };
                });

                res.json({
                    success: true,
                    data: {
                        emails: parsedEmails,
                        total: total,
                        limit: limit,
                        offset: offset,
                        hasMore: offset + limit < total
                    }
                });
            } catch (error) {
                logError('Processed emails endpoint error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Database stats endpoint
        this.app.get('/api/database/stats', async (req, res) => {
            try {
                if (!this.mailRedirector.imapListener || !this.mailRedirector.imapListener.databaseService) {
                    return res.status(503).json({
                        success: false,
                        error: 'Database service not available'
                    });
                }

                const stats = await this.mailRedirector.imapListener.databaseService.getStats();
                res.json({
                    success: true,
                    data: stats
                });
            } catch (error) {
                logError('Database stats endpoint error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Generate and send daily report
        this.app.post('/api/reports/daily', async (req, res) => {
            try {
                if (!this.mailRedirector.reportService) {
                    return res.status(503).json({
                        success: false,
                        error: 'Report service not available'
                    });
                }

                logInfo('Manual daily report requested via API');
                const result = await this.mailRedirector.reportService.generateDailyReport();

                res.json({
                    success: result.success,
                    message: result.success 
                        ? 'Daily report generated and sent successfully' 
                        : 'Daily report generation failed',
                    data: {
                        stats: result.stats,
                        recipients: result.recipients,
                        sent: result.success
                    },
                    error: result.error
                });
            } catch (error) {
                logError('Daily report endpoint error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Generate and send weekly report
        this.app.post('/api/reports/weekly', async (req, res) => {
            try {
                if (!this.mailRedirector.reportService) {
                    return res.status(503).json({
                        success: false,
                        error: 'Report service not available'
                    });
                }

                logInfo('Manual weekly report requested via API');
                const result = await this.mailRedirector.reportService.generateWeeklyReport();

                res.json({
                    success: result.success,
                    message: result.success 
                        ? 'Weekly report generated and sent successfully' 
                        : 'Weekly report generation failed',
                    data: {
                        stats: result.stats,
                        recipients: result.recipients,
                        sent: result.success
                    },
                    error: result.error
                });
            } catch (error) {
                logError('Weekly report endpoint error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get statistics for custom date range (without sending email)
        this.app.get('/api/reports/stats', async (req, res) => {
            try {
                if (!this.mailRedirector.reportService) {
                    return res.status(503).json({
                        success: false,
                        error: 'Report service not available'
                    });
                }

                const fromDate = req.query.fromDate ? new Date(req.query.fromDate) : null;
                const toDate = req.query.toDate ? new Date(req.query.toDate) : null;

                if (!fromDate || !toDate) {
                    return res.status(400).json({
                        success: false,
                        error: 'fromDate and toDate query parameters are required (ISO format)',
                        example: '/api/reports/stats?fromDate=2024-12-01&toDate=2024-12-07'
                    });
                }

                // Validate dates
                if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
                    return res.status(400).json({
                        success: false,
                        error: 'Invalid date format. Use ISO format (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss)'
                    });
                }

                if (fromDate > toDate) {
                    return res.status(400).json({
                        success: false,
                        error: 'fromDate must be before toDate'
                    });
                }

                logInfo('Custom statistics requested via API', {
                    fromDate: fromDate.toISOString(),
                    toDate: toDate.toISOString()
                });

                const stats = await this.mailRedirector.reportService.generateStatistics(fromDate, toDate);

                res.json({
                    success: true,
                    data: stats
                });
            } catch (error) {
                logError('Custom stats endpoint error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // Get scheduler status
        this.app.get('/api/reports/scheduler', (req, res) => {
            try {
                if (!this.mailRedirector.schedulerService) {
                    return res.status(503).json({
                        success: false,
                        error: 'Scheduler service not available'
                    });
                }

                const status = this.mailRedirector.schedulerService.getStatus();
                res.json({
                    success: true,
                    data: status
                });
            } catch (error) {
                logError('Scheduler status endpoint error', error);
                res.status(500).json({
                    success: false,
                    error: error.message
                });
            }
        });

        // 404 handler
        this.app.use((req, res) => {
            res.status(404).json({
                success: false,
                error: 'Endpoint not found',
                path: req.path
            });
        });
    }

    /**
     * Starts the API server
     */
    async start() {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(this.port, () => {
                    logInfo(`API Server started on port ${this.port}`, {
                        port: this.port,
                        endpoints: [
                            'GET /health',
                            'GET /api/status',
                            'GET /api/logs',
                            'GET /api/logs/files',
                            'GET /api/logs/stats',
                            'GET /api/logs/failed-sends',
                            'GET /api/keywords',
                            'GET /api/emails/processed',
                            'GET /api/database/stats',
                            'POST /api/config/reload',
                            'POST /api/reports/daily',
                            'POST /api/reports/weekly',
                            'GET /api/reports/stats',
                            'GET /api/reports/scheduler'
                        ]
                    });
                    resolve();
                });

                this.server.on('error', (error) => {
                    logError('API Server error', error);
                    reject(error);
                });
            } catch (error) {
                logError('Failed to start API server', error);
                reject(error);
            }
        });
    }

    /**
     * Stops the API server
     */
    async stop() {
        return new Promise((resolve) => {
            if (this.server) {
                this.server.close(() => {
                    logInfo('API Server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = ApiServer;

