const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { MESSAGES, ERROR_MESSAGES } = require('../constants/messages');

// Create log directory if it doesn't exist
const logDir = path.join(__dirname, '../logs');
try {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
    }
} catch (error) {
    console.error(MESSAGES.LOG_FOLDER_CREATION_FAILED + ':', error.message);
}

/**
 * Extracts file name and line number information from stack trace
 * @param {Error} error - Error object
 * @returns {Object} File and line information
 */
function extractErrorLocation(error) {
    if (!error || !error.stack) {
        return { file: 'unknown', line: 'unknown', function: 'unknown' };
    }

    const stackLines = error.stack.split('\n');

    for (let i = 2; i < stackLines.length; i++) {
        const line = stackLines[i].trim();

        const match = line.match(/at\s+(.+?)\s+\((.+):(\d+):(\d+)\)/);
        if (match) {
            const [, functionName, filePath, lineNum, columnNum] = match;
            const fileName = path.basename(filePath);
            return {
                file: fileName,
                line: parseInt(lineNum),
                column: parseInt(columnNum),
                function: functionName,
                fullPath: filePath
            };
        }

        const simpleMatch = line.match(/at\s+(.+):(\d+):(\d+)/);
        if (simpleMatch) {
            const [, filePath, lineNum, columnNum] = simpleMatch;
            const fileName = path.basename(filePath);
            return {
                file: fileName,
                line: parseInt(lineNum),
                column: parseInt(columnNum),
                function: 'anonymous',
                fullPath: filePath
            };
        }
    }

    return { file: 'unknown', line: 'unknown', function: 'unknown' };
}

// Simple fallback logger
const fallbackLogger = {
    info: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] INFO: ${message}`, meta);
        try {
            fs.appendFileSync(path.join(logDir, 'system.log'),
                `[${timestamp}] INFO: ${message} ${JSON.stringify(meta)}\n`);
        } catch (e) {
            console.error(MESSAGES.FALLBACK_LOG_WRITE_FAILED + ':', e.message);
        }
    },
    error: (message, error = null, meta = {}) => {
        const timestamp = new Date().toISOString();
        const errorDetails = error ? ` - ${error.message}` : '';
        const location = error ? extractErrorLocation(error) : {};

        console.error(`[${timestamp}] ERROR: ${message}${errorDetails}`, {
            ...meta,
            location: `${location.file}:${location.line}`,
            function: location.function
        });

        try {
            fs.appendFileSync(path.join(logDir, 'errors.log'),
                `[${timestamp}] ERROR: ${message}${errorDetails} ${JSON.stringify({
                    ...meta,
                    location: `${location.file}:${location.line}`,
                    function: location.function,
                    stack: error ? error.stack : undefined
                })}\n`);
        } catch (e) {
            console.error(MESSAGES.FALLBACK_LOG_WRITE_FAILED + ':', e.message);
        }
    },
    warn: (message, meta = {}) => {
        const timestamp = new Date().toISOString();
        console.warn(`[${timestamp}] WARN: ${message}`, meta);
        try {
            fs.appendFileSync(path.join(logDir, 'system.log'),
                `[${timestamp}] WARN: ${message} ${JSON.stringify(meta)}\n`);
        } catch (e) {
            console.error(MESSAGES.FALLBACK_LOG_WRITE_FAILED + ':', e.message);
        }
    },
    debug: (message, meta = {}) => {
        // Only print debug logs to console in development environment
        if (process.env.NODE_ENV === 'development') {
            const timestamp = new Date().toISOString();
            console.debug(`[${timestamp}] DEBUG: ${message}`, meta);
        }
    }
};

// Winston logger configuration
let logger;
try {
    // Format for file transports
    const fileFormat = winston.format.combine(
        winston.format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss'
        }),
        winston.format.printf(({ timestamp, level, message, error, location, function: funcName, ...meta }) => {
            let logLine = `[${timestamp}] ${level.toUpperCase()}: ${message}`;

            if (error) {
                const errorLocation = extractErrorLocation(error);
                logLine += ` | Location: ${errorLocation.file}:${errorLocation.line} | Function: ${errorLocation.function}`;
                logLine += ` | Error: ${error.message}`;
            }

            if (location) {
                logLine += ` | Location: ${location}`;
            }

            if (funcName) {
                logLine += ` | Function: ${funcName}`;
            }

            const metaStr = Object.keys(meta).length ? JSON.stringify(meta) : '';
            if (metaStr) {
                logLine += ` | Meta: ${metaStr}`;
            }

            return logLine;
        })
    );

    logger = winston.createLogger({
        level: process.env.LOG_LEVEL || 'info',
        format: fileFormat,
        defaultMeta: { service: 'mail-redirector' },
        transports: [
            // Error log file
            new winston.transports.File({
                filename: path.join(logDir, 'errors.log'),
                level: 'error',
                maxsize: 5242880, // 5MB
                maxFiles: 5,
                format: fileFormat
            }),
            // System log file (info, warn, error)
            new winston.transports.File({
                filename: path.join(logDir, 'system.log'),
                level: 'info',
                maxsize: 5242880, // 5MB
                maxFiles: 5,
                format: fileFormat
            })
        ]
    });

    // Also print to console in development environment
    if (process.env.NODE_ENV !== 'production') {
        logger.add(new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }));
    }

    logger.info(MESSAGES.LOGGER_STARTED, { test: true });

} catch (error) {
    console.error(MESSAGES.LOGGER_START_FAILED + ':', error.message);
    logger = fallbackLogger;
}

// Special logger for forwarded emails
function logForwardedEmail(emailData, recipients, keywordMatches) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        messageId: emailData.messageId,
        uid: emailData.uid,
        from: emailData.from,
        subject: emailData.subject,
        recipients: recipients,
        keywordMatches: keywordMatches,
        hasAttachments: emailData.attachments.length > 0,
        size: emailData.size
    };

    try {
        fs.appendFileSync(path.join(logDir, 'forwarded.log'),
            `[${timestamp}] FORWARDED: ${emailData.subject} | From: ${emailData.from} | To: ${recipients.join(', ')} | Keywords: ${keywordMatches.join(', ')} | Size: ${emailData.size} bytes\n`);
    } catch (error) {
        console.error(MESSAGES.FORWARDED_LOG_WRITE_FAILED + ':', error.message);
    }

    // Add brief info to system log as well
    logInfo(MESSAGES.EMAIL_FORWARDED_SUCCESS, {
        messageId: emailData.messageId,
        subject: emailData.subject,
        recipientCount: recipients.length
    });
}

// Basit log fonksiyonları
function logInfo(message, meta = {}) {
    try {
        logger.info(message, meta);
    } catch (error) {
        fallbackLogger.info(message, meta);
    }
}

function logError(message, error = null, meta = {}) {
    try {
        if (error) {
            const errorLocation = extractErrorLocation(error);
            logger.error(message, {
                error: error.message,
                stack: error.stack,
                location: `${errorLocation.file}:${errorLocation.line}`,
                function: errorLocation.function,
                ...meta
            });
        } else {
            logger.error(message, meta);
        }
    } catch (loggerError) {
        fallbackLogger.error(message, error, meta);
    }
}

function logWarn(message, meta = {}) {
    try {
        logger.warn(message, meta);
    } catch (error) {
        fallbackLogger.warn(message, meta);
    }
}

function logDebug(message, meta = {}) {
    // Debug logları sadece development ortamında ve çok önemli durumlarda
    if (process.env.NODE_ENV === 'development' && process.env.LOG_LEVEL === 'debug') {
        try {
            logger.debug(message, meta);
        } catch (error) {
            fallbackLogger.debug(message, meta);
        }
    }
}

// Special function for system status logs
function logSystemStatus(status, meta = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
        timestamp,
        status,
        ...meta
    };

    try {
        fs.appendFileSync(path.join(logDir, 'system.log'),
            `[${timestamp}] SYSTEM: ${status} ${JSON.stringify(meta)}\n`);
    } catch (error) {
        console.error(MESSAGES.SYSTEM_LOG_WRITE_FAILED + ':', error.message);
    }
}

module.exports = {
    logger,
    logInfo,
    logError,
    logWarn,
    logDebug,
    logForwardedEmail,
    logSystemStatus,
    extractErrorLocation
};
