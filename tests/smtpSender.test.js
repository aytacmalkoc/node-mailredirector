const SmtpSender = require('../app/services/smtpSender');
const nodemailer = require('nodemailer');

// Mock dependencies
jest.mock('nodemailer');
jest.mock('fs');
jest.mock('../app/utils/logger');

const mockNodemailer = require('nodemailer');
const mockFs = require('fs');
const mockLogger = require('../app/utils/logger');

describe('SmtpSender', () => {
    let smtpSender;
    let mockTransporter;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Mock transporter
        mockTransporter = {
            sendMail: jest.fn(),
            verify: jest.fn()
        };

        mockNodemailer.createTransport.mockReturnValue(mockTransporter);

        // Mock environment variables
        process.env.SMTP_HOST = 'smtp.test.com';
        process.env.SMTP_USER = 'test@test.com';
        process.env.SMTP_PASSWORD = 'testpass';
        process.env.SMTP_PORT = '587';
        process.env.SMTP_TLS = 'true';
        process.env.FROM_NAME = 'Test Sender';
        process.env.FROM_EMAIL = 'sender@test.com';

        smtpSender = new SmtpSender();
    });

    describe('Constructor', () => {
        test('should initialize with correct configuration', () => {
            expect(smtpSender).toBeDefined();
            expect(smtpSender.transporter).toBeDefined();
        });

        test('should create transporter with correct config', () => {
            expect(mockNodemailer.createTransport).toHaveBeenCalledWith({
                host: 'smtp.test.com',
                port: 587,
                secure: true,
                auth: {
                    user: 'test@test.com',
                    pass: 'testpass'
                },
                tls: {
                    rejectUnauthorized: false
                }
            });
        });
    });



    describe('sendEmail', () => {
        const mockEmailData = {
            messageId: 'test-message-id',
            from: 'sender@example.com',
            to: 'recipient@example.com',
            subject: 'Test Subject',
            text: 'Test email content',
            html: '<p>Test email content</p>',
            attachments: []
        };

        beforeEach(() => {
            mockTransporter.sendMail.mockResolvedValue({
                messageId: 'sent-message-id',
                response: 'OK'
            });
        });

        test('should send email successfully', async () => {
            const recipients = ['test1@example.com', 'test2@example.com'];

            const result = await smtpSender.sendEmail(mockEmailData, recipients);

            expect(result.success).toBe(true);
            expect(result.messageId).toBe('sent-message-id');
            expect(result.recipients).toEqual(recipients);
            expect(mockTransporter.sendMail).toHaveBeenCalledWith({
                from: '"Test Sender" <sender@test.com>',
                to: 'test1@example.com, test2@example.com',
                subject: '[FORWARDED] Test Subject',
                text: expect.stringContaining('Test email content'),
                html: expect.stringContaining('<p>Test email content</p>'),
                attachments: []
            });
        });

        test('should send email with custom recipients', async () => {
            const customRecipients = ['custom@example.com'];

            const result = await smtpSender.sendEmail(mockEmailData, customRecipients);

            expect(result.success).toBe(true);
            expect(result.recipients).toEqual(customRecipients);
        });

        test('should handle empty recipients list', async () => {
            const result = await smtpSender.sendEmail(mockEmailData, []);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Recipient list is empty - recipients should come from keywords.json');
        });

        test('should handle null custom recipients', async () => {
            const result = await smtpSender.sendEmail(mockEmailData, null);
            expect(result.success).toBe(false);
            expect(result.error).toBe('Recipient list is empty - recipients should come from keywords.json');
        });

        test('should handle email sending error', async () => {
            const error = new Error('SMTP error');
            mockTransporter.sendMail.mockRejectedValue(error);

            const result = await smtpSender.sendEmail(mockEmailData, ['test@example.com']);

            expect(result.success).toBe(false);
            expect(result.error).toBe(error.message);
        });

        test('should format subject correctly', async () => {
            const recipients = ['test@example.com'];

            await smtpSender.sendEmail(mockEmailData, recipients);

            expect(mockTransporter.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    subject: '[FORWARDED] Test Subject'
                })
            );
        });

        test('should format text content correctly', async () => {
            const recipients = ['test@example.com'];

            await smtpSender.sendEmail(mockEmailData, recipients);

            const callArgs = mockTransporter.sendMail.mock.calls[0][0];
            expect(callArgs.text).toContain('Original Sender: sender@example.com');
            expect(callArgs.text).toContain('Subject: Test Subject');
            expect(callArgs.text).toContain('Test email content');
        });

        test('should format HTML content correctly', async () => {
            const recipients = ['test@example.com'];

            await smtpSender.sendEmail(mockEmailData, recipients);

            const callArgs = mockTransporter.sendMail.mock.calls[0][0];
            expect(callArgs.html).toContain('This email was automatically forwarded');
            expect(callArgs.html).toContain('sender@example.com');
            expect(callArgs.html).toContain('Test Subject');
            expect(callArgs.html).toContain('<p>Test email content</p>');
        });

        test('should handle email with attachments', async () => {
            const emailWithAttachments = {
                ...mockEmailData,
                attachments: [
                    { filename: 'test.pdf', content: 'test-content' }
                ]
            };

            const recipients = ['test@example.com'];

            await smtpSender.sendEmail(emailWithAttachments, recipients);

            expect(mockTransporter.sendMail).toHaveBeenCalledWith(
                expect.objectContaining({
                    attachments: [{ filename: 'test.pdf', content: 'test-content' }]
                })
            );
        });

        test('should handle missing email properties', async () => {
            const incompleteEmail = {
                subject: 'Test Subject'
            };

            const recipients = ['test@example.com'];

            await smtpSender.sendEmail(incompleteEmail, recipients);

            const callArgs = mockTransporter.sendMail.mock.calls[0][0];
            expect(callArgs.text).toContain('Original Sender: undefined');
            expect(callArgs.html).toContain('Unknown');
        });
    });

    describe('testConnection', () => {
        test('should test connection successfully', async () => {
            mockTransporter.verify.mockResolvedValue(true);

            const result = await smtpSender.testConnection();

            expect(result).toBe(true);
            expect(mockTransporter.verify).toHaveBeenCalled();
        });

        test('should handle connection test failure', async () => {
            const error = new Error('Connection failed');
            mockTransporter.verify.mockRejectedValue(error);

            const result = await smtpSender.testConnection();

            expect(result).toBe(false);
        });
    });



    describe('formatSubject', () => {
        test('should format subject with prefix', () => {
            const result = smtpSender.formatSubject('Test Subject');
            expect(result).toBe('[FORWARDED] Test Subject');
        });

        test('should handle empty subject', () => {
            const result = smtpSender.formatSubject('');
            expect(result).toBe('[FORWARDED] ');
        });

        test('should handle null subject', () => {
            const result = smtpSender.formatSubject(null);
            expect(result).toBe('[FORWARDED] null');
        });
    });

    describe('formatTextContent', () => {
        test('should format text content correctly', () => {
            const emailData = {
                from: 'sender@example.com',
                to: 'recipient@example.com',
                subject: 'Test Subject',
                text: 'Test content'
            };

            const result = smtpSender.formatTextContent(emailData);

            expect(result).toContain('Original Sender: sender@example.com');
            expect(result).toContain('Subject: Test Subject');
            expect(result).toContain('Test content');
        });

        test('should handle missing properties', () => {
            const emailData = {
                subject: 'Test Subject'
            };

            const result = smtpSender.formatTextContent(emailData);

            expect(result).toContain('Original Sender: undefined');
            expect(result).toContain('Subject: Test Subject');
        });
    });

    describe('formatHtmlContent', () => {
        test('should format HTML content correctly', async () => {
            const emailData = {
                from: 'sender@example.com',
                to: 'recipient@example.com',
                subject: 'Test Subject',
                html: '<p>Test content</p>'
            };

            const result = await smtpSender.formatHtmlContent(emailData);

            expect(result).toContain('This email was automatically forwarded');
            expect(result).toContain('sender@example.com');
            expect(result).toContain('Test Subject');
            expect(result).toContain('<p>Test content</p>');
        });

        test('should handle missing HTML content', async () => {
            const emailData = {
                from: 'sender@example.com',
                to: 'recipient@example.com',
                subject: 'Test Subject',
                text: 'Test content'
            };

            const result = await smtpSender.formatHtmlContent(emailData);

            expect(result).toContain('This email was automatically forwarded');
            expect(result).toContain('sender@example.com');
            expect(result).toContain('Test Subject');
            expect(result).toContain('<p>Test content</p>');
        });

        test('should handle missing properties', async () => {
            const emailData = {
                subject: 'Test Subject'
            };

            const result = await smtpSender.formatHtmlContent(emailData);

            expect(result).toContain('This email was automatically forwarded');
            expect(result).toContain('Unknown');
            expect(result).toContain('Test Subject');
        });

        test('should handle template loading error gracefully', async () => {
            // Mock TemplateEngine to throw error
            const originalLoadEmailTemplate = require('../app/utils/templateEngine').loadEmailTemplate;
            require('../app/utils/templateEngine').loadEmailTemplate = jest.fn().mockRejectedValue(new Error('Template error'));

            const emailData = {
                from: 'sender@example.com',
                subject: 'Test Subject',
                html: '<p>Test content</p>'
            };

            const result = await smtpSender.formatHtmlContent(emailData);

            expect(result).toContain('This email was automatically forwarded');
            expect(result).toContain('sender@example.com');
            expect(result).toContain('Test Subject');
            expect(result).toContain('<p>Test content</p>');

            // Restore original function
            require('../app/utils/templateEngine').loadEmailTemplate = originalLoadEmailTemplate;
        });
    });
}); 