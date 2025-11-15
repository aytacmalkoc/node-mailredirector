const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { logInfo, logError, logWarn } = require('../utils/logger');
const { MESSAGES } = require('../constants/messages');
const TemplateEngine = require('../utils/templateEngine');

class SmtpSender {
    constructor() {
        this.transporter = null;
        this.maxRetryAttempts = parseInt(process.env.SMTP_MAX_RETRY_ATTEMPTS) || 3;
        this.baseRetryDelay = parseInt(process.env.SMTP_BASE_RETRY_DELAY) || 2000;
        this.maxRetryDelay = parseInt(process.env.SMTP_MAX_RETRY_DELAY) || 30000;
        this.initializeTransporter();
    }

    /**
     * Initializes SMTP transporter
     */
    initializeTransporter() {
        try {
            const config = {
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT) || 587,
                secure: process.env.SMTP_TLS === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASSWORD
                },
                tls: {
                    rejectUnauthorized: false
                }
            };

            this.transporter = nodemailer.createTransport(config);

            logInfo(MESSAGES.SMTP_TRANSPORTER_STARTED, {
                host: config.host,
                port: config.port,
                secure: config.secure,
                user: config.auth.user
            });
        } catch (error) {
            logError(MESSAGES.SMTP_TRANSPORTER_FAILED, error);
            throw error;
        }
    }



    /**
     * Converts mailparser attachments to nodemailer format
     * @param {Array} attachments - Mailparser attachments array
     * @returns {Array} Nodemailer compatible attachments array
     */
    convertAttachments(attachments) {
        if (!attachments || attachments.length === 0) {
            return [];
        }

        return attachments.map(attachment => {
            const nodemailerAttachment = {
                filename: attachment.filename || attachment.contentType?.split('/')[1] || 'attachment',
                contentType: attachment.contentType || 'application/octet-stream'
            };

            // Handle content (can be Buffer, string, or stream)
            if (attachment.content) {
                if (Buffer.isBuffer(attachment.content)) {
                    nodemailerAttachment.content = attachment.content;
                } else if (typeof attachment.content === 'string') {
                    nodemailerAttachment.content = attachment.content;
                } else {
                    // If it's a stream or other type, try to convert
                    nodemailerAttachment.content = attachment.content;
                }
            }

            // Handle contentId for inline attachments
            if (attachment.contentId || attachment.cid) {
                nodemailerAttachment.cid = attachment.contentId || attachment.cid;
            }

            // Add contentDisposition if available
            if (attachment.contentDisposition) {
                nodemailerAttachment.contentDisposition = attachment.contentDisposition;
            }

            // Add size information for logging
            if (attachment.size) {
                nodemailerAttachment.size = attachment.size;
            }

            return nodemailerAttachment;
        });
    }

    /**
     * Calculates exponential backoff delay for SMTP retries
     * @param {number} attemptNumber - Current attempt number
     * @returns {number} Delay in milliseconds
     */
    calculateBackoffDelay(attemptNumber) {
        const exponentialDelay = this.baseRetryDelay * Math.pow(2, attemptNumber - 1);
        const jitter = Math.random() * exponentialDelay * 0.25;
        const totalDelay = exponentialDelay + jitter;
        return Math.min(totalDelay, this.maxRetryDelay);
    }

    /**
     * Sends email with retry mechanism
     * @param {Object} emailData - Email data to send
     * @param {Array} customRecipients - Custom recipients (optional)
     * @param {number} attemptNumber - Current retry attempt (internal use)
     * @returns {Promise<Object>} Send result
     */
    async sendEmail(emailData, customRecipients = null, attemptNumber = 1) {
        try {
            if (!customRecipients || customRecipients.length === 0) {
                throw new Error(MESSAGES.SMTP_NO_RECIPIENTS);
            }

            const recipients = customRecipients;

            // Convert attachments to nodemailer format
            const convertedAttachments = this.convertAttachments(emailData.attachments);

            const mailOptions = {
                from: `"${process.env.FROM_NAME || 'Mail Redirector'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
                to: recipients.join(', '),
                subject: this.formatSubject(emailData.subject),
                text: this.formatTextContent(emailData),
                html: await this.formatHtmlContent(emailData),
                attachments: convertedAttachments
            };

            if (attemptNumber === 1) {
                const attachmentInfo = convertedAttachments.length > 0 
                    ? convertedAttachments.map(att => ({
                        filename: att.filename,
                        size: att.size || 'unknown',
                        contentType: att.contentType
                    }))
                    : [];
                
                logInfo(MESSAGES.SMTP_SENDING_EMAIL, {
                    to: recipients,
                    subject: mailOptions.subject,
                    hasAttachments: convertedAttachments.length > 0,
                    attachmentCount: convertedAttachments.length,
                    attachments: attachmentInfo
                });
            } else {
                logWarn(`SMTP retry attempt ${attemptNumber}/${this.maxRetryAttempts}`, {
                    to: recipients,
                    subject: mailOptions.subject
                });
            }

            const result = await this.transporter.sendMail(mailOptions);

            if (attemptNumber > 1) {
                logInfo(`SMTP email sent successfully after ${attemptNumber} attempts`, {
                    messageId: result.messageId,
                    to: recipients
                });
            } else {
                logInfo(MESSAGES.SMTP_EMAIL_SENT, {
                    messageId: result.messageId,
                    to: recipients,
                    subject: mailOptions.subject
                });
            }

            return {
                success: true,
                messageId: result.messageId,
                recipients,
                attempts: attemptNumber,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            // Check if error is retryable
            const isRetryable = this.isRetryableError(error);
            
            if (isRetryable && attemptNumber < this.maxRetryAttempts) {
                const delay = this.calculateBackoffDelay(attemptNumber);
                
                logWarn(`SMTP send failed, will retry (${attemptNumber}/${this.maxRetryAttempts})`, {
                    error: error.message,
                    nextRetryIn: `${Math.round(delay / 1000)}s`,
                    to: customRecipients,
                    subject: emailData.subject
                });

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, delay));

                // Retry
                return this.sendEmail(emailData, customRecipients, attemptNumber + 1);
            }

            // Final failure
            logError(MESSAGES.SMTP_EMAIL_FAILED, error, {
                to: customRecipients || this.defaultRecipients,
                subject: emailData.subject,
                attempts: attemptNumber,
                isRetryable: isRetryable
            });

            return {
                success: false,
                error: error.message,
                attempts: attemptNumber,
                isRetryable: isRetryable,
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Determines if an error is retryable
     * @param {Error} error - Error object
     * @returns {boolean} True if error is retryable
     */
    isRetryableError(error) {
        if (!error) return false;

        const errorMessage = error.message.toLowerCase();
        const errorCode = error.code || '';

        // Network-related errors (retryable)
        const retryablePatterns = [
            'econnreset',
            'econnrefused',
            'etimedout',
            'enotfound',
            'eai_again',
            'timeout',
            'connection',
            'network',
            'temporary',
            'rate limit',
            'quota',
            'server busy',
            '503',
            '429'
        ];

        // Check if error matches retryable patterns
        for (const pattern of retryablePatterns) {
            if (errorMessage.includes(pattern) || errorCode.toString().includes(pattern)) {
                return true;
            }
        }

        // Authentication errors are NOT retryable
        const nonRetryablePatterns = [
            'authentication',
            'auth',
            'invalid credentials',
            'unauthorized',
            '401',
            '535',
            '535-5.7.8'
        ];

        for (const pattern of nonRetryablePatterns) {
            if (errorMessage.includes(pattern) || errorCode.toString().includes(pattern)) {
                return false;
            }
        }

        // Default: retry for unknown errors (might be temporary)
        return true;
    }

    /**
     * Formats the email subject
     * @param {string} originalSubject - Original subject
     * @returns {string} Formatted subject
     */
    formatSubject(originalSubject) {
        const prefix = '[FORWARDED]';
        return `${prefix} ${originalSubject}`;
    }

    /**
     * Formats the text content
     * @param {Object} emailData - Email data
     * @returns {string} Formatted text content
     */
    formatTextContent(emailData) {
        const { from, subject, text, date } = emailData;

        let formattedContent = '';
        formattedContent += `This email was automatically forwarded.\n\n`;
        formattedContent += `Original Sender: ${from}\n`;
        formattedContent += `Subject: ${subject}\n`;
        formattedContent += `Date: ${date}\n`;
        formattedContent += `\n--- Original Content ---\n\n`;
        formattedContent += text || 'No text content found.';

        return formattedContent;
    }

    /**
     * Formats the HTML content using external template
     * @param {Object} emailData - Email data
     * @returns {Promise<string>} Formatted HTML content
     */
    async formatHtmlContent(emailData) {
        try {
            return await TemplateEngine.loadEmailTemplate(emailData);
        } catch (error) {
            logError('Error formatting HTML content with template', error);
            // Fallback to simple HTML if template fails
            const { from, subject, html, text, date } = emailData;
            const content = html || `<p>${text || 'No content found.'}</p>`;

            return `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                    </style>
                </head>
                <body>
                    <p><strong>This email was automatically forwarded.</strong></p>
                    <p><strong>From:</strong> ${from || 'Unknown'}</p>
                    <p><strong>Subject:</strong> ${subject || 'No Subject'}</p>
                    <p><strong>Date:</strong> ${date || new Date().toISOString()}</p>
                    <hr>
                    ${content}
                </body>
                </html>
            `;
        }
    }

    /**
     * Tests the SMTP connection
     * @returns {Promise<boolean>} Connection status
     */
    async testConnection() {
        try {
            await this.transporter.verify();
            logInfo('SMTP connection successful');
            return true;
        } catch (error) {
            logError('SMTP connection test failed', error);
            return false;
        }
    }


}

module.exports = SmtpSender;
