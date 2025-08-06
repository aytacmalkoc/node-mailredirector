const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const { logInfo, logError, logWarn } = require('../utils/logger');
const { MESSAGES } = require('../constants/messages');
const TemplateEngine = require('../utils/templateEngine');

class SmtpSender {
    constructor() {
        this.transporter = null;
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
     * Sends email
     * @param {Object} emailData - Email data to send
     * @param {Array} customRecipients - Custom recipients (optional)
     * @returns {Promise<Object>} Send result
     */
    async sendEmail(emailData, customRecipients = null) {
        try {
            if (!customRecipients || customRecipients.length === 0) {
                throw new Error(MESSAGES.SMTP_NO_RECIPIENTS);
            }

            const recipients = customRecipients;

            const mailOptions = {
                from: `"${process.env.FROM_NAME || 'Mail Redirector'}" <${process.env.FROM_EMAIL || process.env.SMTP_USER}>`,
                to: recipients.join(', '),
                subject: this.formatSubject(emailData.subject),
                text: this.formatTextContent(emailData),
                html: await this.formatHtmlContent(emailData),
                attachments: emailData.attachments || []
            };

            logInfo(MESSAGES.SMTP_SENDING_EMAIL, {
                to: recipients,
                subject: mailOptions.subject,
                hasAttachments: mailOptions.attachments.length > 0
            });

            const result = await this.transporter.sendMail(mailOptions);

            logInfo(MESSAGES.SMTP_EMAIL_SENT, {
                messageId: result.messageId,
                to: recipients,
                subject: mailOptions.subject
            });

            return {
                success: true,
                messageId: result.messageId,
                recipients,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            logError(MESSAGES.SMTP_EMAIL_FAILED, error, {
                to: customRecipients || this.defaultRecipients,
                subject: emailData.subject
            });

            return {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
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
