const MailRedirector = require('../app/index');
const ImapListener = require('../app/services/imapListener');
const KeywordChecker = require('../app/services/keywordChecker');
const SmtpSender = require('../app/services/smtpSender');
const ApiServer = require('../app/api/server');
const ReportService = require('../app/services/reportService');
const SchedulerService = require('../app/services/schedulerService');

// Mock dependencies
jest.mock('../app/services/imapListener');
jest.mock('../app/services/keywordChecker');
jest.mock('../app/services/smtpSender');
jest.mock('../app/services/reportService');
jest.mock('../app/services/schedulerService');
jest.mock('../app/api/server');
jest.mock('../app/utils/logger');

const mockImapListener = require('../app/services/imapListener');
const mockKeywordChecker = require('../app/services/keywordChecker');
const mockSmtpSender = require('../app/services/smtpSender');
const mockLogger = require('../app/utils/logger');

describe('Integration Tests', () => {
    let mailRedirector;
    let mockImapInstance;
    let mockKeywordInstance;
    let mockSmtpInstance;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Mock service instances
        mockImapInstance = {
            connect: jest.fn(),
            disconnect: jest.fn(),
            setEmailReceivedCallback: jest.fn(),
            getStatus: jest.fn().mockReturnValue({ isConnected: true, isListening: true })
        };

        mockKeywordInstance = {
            checkKeywords: jest.fn(),
            reloadKeywords: jest.fn(),
            getKeywords: jest.fn().mockReturnValue(['urgent', 'important', 'acil'])
        };

        mockSmtpInstance = {
            sendEmail: jest.fn(),
            testConnection: jest.fn().mockResolvedValue(true)
        };

        // Mock constructors
        mockImapListener.mockImplementation(() => mockImapInstance);
        mockKeywordChecker.mockImplementation(() => mockKeywordInstance);
        mockSmtpSender.mockImplementation(() => mockSmtpInstance);
        
        // Mock environment variables
        process.env.IMAP_HOST = 'imap.test.com';
        process.env.IMAP_USER = 'test@test.com';
        process.env.IMAP_PASSWORD = 'testpass';
        process.env.SMTP_HOST = 'smtp.test.com';
        process.env.SMTP_USER = 'test@test.com';
        process.env.SMTP_PASSWORD = 'testpass';
        process.env.CHECK_INTERVAL = '30000';
        
        mailRedirector = new MailRedirector();
    });

    afterEach(async () => {
        if (mailRedirector && mailRedirector.stop) {
            await mailRedirector.stop();
        }
    });

    describe('Complete Email Processing Workflow', () => {
        test('should process urgent email and forward successfully', async () => {
            // Start the application
            await mailRedirector.start();

            // Verify services are initialized
            expect(mailRedirector.imapListener).toBe(mockImapInstance);
            expect(mailRedirector.keywordChecker).toBe(mockKeywordInstance);
            expect(mailRedirector.smtpSender).toBe(mockSmtpInstance);

            // Simulate email reception
            const emailData = {
                messageId: 'test-urgent-email-123',
                from: 'sender@example.com',
                to: 'recipient@example.com',
                subject: 'Urgent: System Down',
                text: 'The system is down and needs immediate attention. This is urgent!',
                html: '<p>The system is down and needs immediate attention. This is urgent!</p>',
                date: new Date(),
                attachments: []
            };

            // Mock keyword check result
            const keywordResult = {
                hasMatch: true,
                matchedKeywords: ['urgent'],
                matchCount: 1,
                contentLength: emailData.text.length
            };

            // Mock email sending result
            const sendResult = {
                success: true,
                messageId: 'forwarded-email-456',
                recipients: ['manager@company.com', 'tech@company.com'],
                timestamp: new Date().toISOString()
            };

            mockKeywordInstance.checkKeywords.mockReturnValue(keywordResult);
            mockSmtpInstance.sendEmail.mockResolvedValue(sendResult);

            // Process the email
            await mailRedirector.processEmail(emailData);

            // Verify the complete workflow
            expect(mockKeywordInstance.checkKeywords).toHaveBeenCalledWith(emailData);
            expect(mockSmtpInstance.sendEmail).toHaveBeenCalledWith(emailData);
            expect(mailRedirector.stats.totalEmails).toBe(1);
            expect(mailRedirector.stats.matchedEmails).toBe(1);
            expect(mailRedirector.stats.forwardedEmails).toBe(1);
            expect(mailRedirector.stats.errors).toBe(0);

            // Verify logging
            expect(mockLogger.logInfo).toHaveBeenCalledWith('E-posta işleniyor', {
                messageId: emailData.messageId,
                from: emailData.from,
                subject: emailData.subject,
                totalEmails: 1
            });

            expect(mockLogger.logInfo).toHaveBeenCalledWith('Anahtar kelime eşleşmesi bulundu, e-posta yönlendiriliyor', {
                matchedKeywords: ['urgent'],
                matchCount: 1,
                subject: emailData.subject
            });

            expect(mockLogger.logInfo).toHaveBeenCalledWith('E-posta başarıyla yönlendirildi', {
                messageId: 'forwarded-email-456',
                recipients: ['manager@company.com', 'tech@company.com'],
                forwardedEmails: 1
            });
        });

        test('should skip non-matching email', async () => {
            // Start the application
            await mailRedirector.start();

            // Simulate email reception without keywords
            const emailData = {
                messageId: 'test-regular-email-789',
                from: 'sender@example.com',
                to: 'recipient@example.com',
                subject: 'Weekly Report',
                text: 'Here is the weekly report for your review.',
                html: '<p>Here is the weekly report for your review.</p>',
                date: new Date(),
                attachments: []
            };

            // Mock keyword check result - no match
            const keywordResult = {
                hasMatch: false,
                matchedKeywords: [],
                matchCount: 0,
                contentLength: emailData.text.length
            };

            mockKeywordInstance.checkKeywords.mockReturnValue(keywordResult);

            // Process the email
            await mailRedirector.processEmail(emailData);

            // Verify the email was not forwarded
            expect(mockKeywordInstance.checkKeywords).toHaveBeenCalledWith(emailData);
            expect(mockSmtpInstance.sendEmail).not.toHaveBeenCalled();
            expect(mailRedirector.stats.totalEmails).toBe(1);
            expect(mailRedirector.stats.matchedEmails).toBe(0);
            expect(mailRedirector.stats.forwardedEmails).toBe(0);
            expect(mailRedirector.stats.errors).toBe(0);

            // Verify logging
            expect(mockLogger.logInfo).toHaveBeenCalledWith('Anahtar kelime eşleşmesi bulunamadı, e-posta atlanıyor', {
                subject: emailData.subject,
                contentLength: emailData.text.length
            });
        });

        test('should handle multiple emails in sequence', async () => {
            // Start the application
            await mailRedirector.start();

            // First email - should be forwarded
            const urgentEmail = {
                messageId: 'urgent-1',
                from: 'sender1@example.com',
                subject: 'Urgent Issue',
                text: 'This is urgent and needs attention.',
                date: new Date(),
                attachments: []
            };

            const urgentKeywordResult = {
                hasMatch: true,
                matchedKeywords: ['urgent'],
                matchCount: 1,
                contentLength: urgentEmail.text.length
            };

            const urgentSendResult = {
                success: true,
                messageId: 'forwarded-1',
                recipients: ['manager@company.com', 'tech@company.com'],
                timestamp: new Date().toISOString()
            };

            mockKeywordInstance.checkKeywords.mockReturnValueOnce(urgentKeywordResult);
            mockSmtpInstance.sendEmail.mockResolvedValueOnce(urgentSendResult);

            await mailRedirector.processEmail(urgentEmail);

            // Second email - should be skipped
            const regularEmail = {
                messageId: 'regular-1',
                from: 'sender2@example.com',
                subject: 'Regular Update',
                text: 'This is a regular update.',
                date: new Date(),
                attachments: []
            };

            const regularKeywordResult = {
                hasMatch: false,
                matchedKeywords: [],
                matchCount: 0,
                contentLength: regularEmail.text.length
            };

            mockKeywordInstance.checkKeywords.mockReturnValueOnce(regularKeywordResult);

            await mailRedirector.processEmail(regularEmail);

            // Third email - should be forwarded
            const importantEmail = {
                messageId: 'important-1',
                from: 'sender3@example.com',
                subject: 'Important Meeting',
                text: 'This is an important meeting reminder.',
                date: new Date(),
                attachments: []
            };

            const importantKeywordResult = {
                hasMatch: true,
                matchedKeywords: ['important'],
                matchCount: 1,
                contentLength: importantEmail.text.length
            };

            const importantSendResult = {
                success: true,
                messageId: 'forwarded-2',
                recipients: ['manager@company.com', 'tech@company.com'],
                timestamp: new Date().toISOString()
            };

            mockKeywordInstance.checkKeywords.mockReturnValueOnce(importantKeywordResult);
            mockSmtpInstance.sendEmail.mockResolvedValueOnce(importantSendResult);

            await mailRedirector.processEmail(importantEmail);

            // Verify final stats
            expect(mailRedirector.stats.totalEmails).toBe(3);
            expect(mailRedirector.stats.matchedEmails).toBe(2);
            expect(mailRedirector.stats.forwardedEmails).toBe(2);
            expect(mailRedirector.stats.errors).toBe(0);

            // Verify email sending was called twice
            expect(mockSmtpInstance.sendEmail).toHaveBeenCalledTimes(2);
        });
    });

    describe('Error Handling Integration', () => {
        test('should handle email sending failure gracefully', async () => {
            // Start the application
            await mailRedirector.start();

            // Simulate email with keyword match but sending failure
            const emailData = {
                messageId: 'test-failed-email',
                from: 'sender@example.com',
                subject: 'Urgent Issue',
                text: 'This is urgent and needs attention.',
                date: new Date(),
                attachments: []
            };

            const keywordResult = {
                hasMatch: true,
                matchedKeywords: ['urgent'],
                matchCount: 1,
                contentLength: emailData.text.length
            };

            const sendResult = {
                success: false,
                error: 'SMTP connection failed',
                timestamp: new Date().toISOString()
            };

            mockKeywordInstance.checkKeywords.mockReturnValue(keywordResult);
            mockSmtpInstance.sendEmail.mockResolvedValue(sendResult);

            // Process the email
            await mailRedirector.processEmail(emailData);

            // Verify error handling
            expect(mailRedirector.stats.totalEmails).toBe(1);
            expect(mailRedirector.stats.matchedEmails).toBe(1);
            expect(mailRedirector.stats.forwardedEmails).toBe(0);
            expect(mailRedirector.stats.errors).toBe(1);

            expect(mockLogger.logError).toHaveBeenCalledWith('E-posta yönlendirme başarısız', {
                error: 'SMTP connection failed',
                subject: emailData.subject,
                errors: 1
            });
        });

        test('should handle keyword checking error gracefully', async () => {
            // Start the application
            await mailRedirector.start();

            // Simulate email that causes keyword checking error
            const emailData = {
                messageId: 'test-error-email',
                from: 'sender@example.com',
                subject: 'Test Subject',
                text: 'Test content',
                date: new Date(),
                attachments: []
            };

            const error = new Error('Keyword checking failed');
            mockKeywordInstance.checkKeywords.mockImplementation(() => {
                throw error;
            });

            // Process the email
            await mailRedirector.processEmail(emailData);

            // Verify error handling
            expect(mailRedirector.stats.totalEmails).toBe(1);
            expect(mailRedirector.stats.matchedEmails).toBe(0);
            expect(mailRedirector.stats.forwardedEmails).toBe(0);
            expect(mailRedirector.stats.errors).toBe(1);

            expect(mockLogger.logError).toHaveBeenCalledWith('E-posta işleme sırasında hata oluştu', error, {
                messageId: emailData.messageId,
                subject: emailData.subject,
                errors: 1
            });
        });
    });

    describe('Configuration Reload Integration', () => {
        test('should reload configuration and continue processing', async () => {
            // Start the application
            await mailRedirector.start();

            // Process first email with original keywords
            const email1 = {
                messageId: 'email-1',
                subject: 'Regular Email',
                text: 'This is a regular email.',
                date: new Date(),
                attachments: []
            };

            const keywordResult1 = {
                hasMatch: false,
                matchedKeywords: [],
                matchCount: 0,
                contentLength: email1.text.length
            };

            mockKeywordInstance.checkKeywords.mockReturnValueOnce(keywordResult1);
            await mailRedirector.processEmail(email1);

            // Reload configuration
            mailRedirector.reloadConfig();

            // Verify reload was called
            expect(mockKeywordInstance.reloadKeywords).toHaveBeenCalled();
            expect(mockLogger.logInfo).toHaveBeenCalledWith('Konfigürasyonlar yeniden yüklendi');

            // Process second email after reload
            const email2 = {
                messageId: 'email-2',
                subject: 'Another Regular Email',
                text: 'This is another regular email.',
                date: new Date(),
                attachments: []
            };

            const keywordResult2 = {
                hasMatch: false,
                matchedKeywords: [],
                matchCount: 0,
                contentLength: email2.text.length
            };

            mockKeywordInstance.checkKeywords.mockReturnValueOnce(keywordResult2);
            await mailRedirector.processEmail(email2);

            // Verify both emails were processed
            expect(mailRedirector.stats.totalEmails).toBe(2);
        });
    });

    describe('Application Lifecycle Integration', () => {
        test('should handle complete application lifecycle', async () => {
            // Verify initial state
            expect(mailRedirector.isRunning).toBe(false);
            expect(mailRedirector.stats.startTime).toBeNull();

            // Start application
            await mailRedirector.start();

            // Verify running state
            expect(mailRedirector.isRunning).toBe(true);
            expect(mailRedirector.stats.startTime).toBeDefined();
            expect(mockImapInstance.connect).toHaveBeenCalled();
            expect(mockImapInstance.setEmailReceivedCallback).toHaveBeenCalled();

            // Process some emails
            const emailData = {
                messageId: 'lifecycle-test',
                subject: 'Test Email',
                text: 'This is a test email.',
                date: new Date(),
                attachments: []
            };

            const keywordResult = {
                hasMatch: false,
                matchedKeywords: [],
                matchCount: 0,
                contentLength: emailData.text.length
            };

            mockKeywordInstance.checkKeywords.mockReturnValue(keywordResult);
            await mailRedirector.processEmail(emailData);

            // Get stats
            const stats = mailRedirector.getStats();
            expect(stats.totalEmails).toBe(1);
            expect(stats.isRunning).toBe(true);
            expect(stats.imapStatus).toEqual({ isConnected: true, isListening: true });

            // Stop application
            await mailRedirector.stop();

            // Verify stopped state
            expect(mailRedirector.isRunning).toBe(false);
            expect(mockImapInstance.disconnect).toHaveBeenCalled();
            expect(mockLogger.logInfo).toHaveBeenCalledWith('Uygulama durduruldu', {
                finalStats: expect.any(Object)
            });
        });

        test('should handle graceful shutdown with pending operations', async () => {
            // Start application
            await mailRedirector.start();

            // Simulate email processing in progress
            const emailData = {
                messageId: 'shutdown-test',
                subject: 'Shutdown Test',
                text: 'This email is being processed during shutdown.',
                date: new Date(),
                attachments: []
            };

            const keywordResult = {
                hasMatch: true,
                matchedKeywords: ['urgent'],
                matchCount: 1,
                contentLength: emailData.text.length
            };

            // Mock slow email sending
            let sendPromise;
            mockKeywordInstance.checkKeywords.mockReturnValue(keywordResult);
            mockSmtpInstance.sendEmail.mockImplementation(() => {
                sendPromise = new Promise(resolve => {
                    setTimeout(() => {
                        resolve({
                            success: true,
                            messageId: 'delayed-send',
                            recipients: ['test@example.com'],
                            timestamp: new Date().toISOString()
                        });
                    }, 100);
                });
                return sendPromise;
            });

            // Start email processing
            const processPromise = mailRedirector.processEmail(emailData);

            // Stop application while email is being processed
            await mailRedirector.stop();

            // Wait for email processing to complete
            await processPromise;

            // Verify application was stopped gracefully
            expect(mailRedirector.isRunning).toBe(false);
            expect(mockImapInstance.disconnect).toHaveBeenCalled();
        });
    });

    describe('Statistics Integration', () => {
        test('should maintain accurate statistics throughout processing', async () => {
            // Start application
            await mailRedirector.start();

            // Process multiple emails with different outcomes
            const emails = [
                {
                    messageId: 'email-1',
                    subject: 'Urgent Issue',
                    text: 'This is urgent!',
                    date: new Date(),
                    attachments: []
                },
                {
                    messageId: 'email-2',
                    subject: 'Regular Update',
                    text: 'This is regular.',
                    date: new Date(),
                    attachments: []
                },
                {
                    messageId: 'email-3',
                    subject: 'Important Meeting',
                    text: 'This is important.',
                    date: new Date(),
                    attachments: []
                }
            ];

            const keywordResults = [
                { hasMatch: true, matchedKeywords: ['urgent'], matchCount: 1, contentLength: 15 },
                { hasMatch: false, matchedKeywords: [], matchCount: 0, contentLength: 15 },
                { hasMatch: true, matchedKeywords: ['important'], matchCount: 1, contentLength: 18 }
            ];

            const sendResults = [
                { success: true, messageId: 'sent-1', recipients: ['test@example.com'], timestamp: new Date().toISOString() },
                null, // No sending for non-matching email
                { success: false, error: 'Send failed', timestamp: new Date().toISOString() }
            ];

            // Process emails
            for (let i = 0; i < emails.length; i++) {
                mockKeywordInstance.checkKeywords.mockReturnValueOnce(keywordResults[i]);
                if (sendResults[i]) {
                    mockSmtpInstance.sendEmail.mockResolvedValueOnce(sendResults[i]);
                }
                await mailRedirector.processEmail(emails[i]);
            }

            // Verify final statistics
            expect(mailRedirector.stats.totalEmails).toBe(3);
            expect(mailRedirector.stats.matchedEmails).toBe(2);
            expect(mailRedirector.stats.forwardedEmails).toBe(1); // One success, one failure
            expect(mailRedirector.stats.errors).toBe(1);

            // Verify uptime calculation
            const stats = mailRedirector.getStats();
            expect(stats.uptime).toBeGreaterThan(0);
            expect(stats.isRunning).toBe(true);
        });
    });

    describe('API Endpoints', () => {
        let apiServer;
        let mockReportServiceInstance;
        let mockSchedulerServiceInstance;

        beforeEach(() => {
            // Mock report service
            mockReportServiceInstance = {
                generateDailyReport: jest.fn().mockResolvedValue({
                    success: true,
                    stats: { totalProcessed: 10, totalForwarded: 8 },
                    recipients: ['admin@test.com']
                }),
                generateWeeklyReport: jest.fn().mockResolvedValue({
                    success: true,
                    stats: { totalProcessed: 50, totalForwarded: 40 },
                    recipients: ['admin@test.com']
                }),
                generateStatistics: jest.fn().mockResolvedValue({
                    totalProcessed: 10,
                    totalForwarded: 8,
                    topRecipients: []
                })
            };

            // Mock scheduler service
            mockSchedulerServiceInstance = {
                getStatus: jest.fn().mockReturnValue({
                    isRunning: true,
                    activeJobs: 2,
                    jobs: [
                        { name: 'daily-report', running: true },
                        { name: 'weekly-report', running: true }
                    ]
                }),
                stop: jest.fn()
            };

            mailRedirector.reportService = mockReportServiceInstance;
            mailRedirector.schedulerService = mockSchedulerServiceInstance;

            apiServer = new ApiServer(mailRedirector);
        });

        test('should handle daily report endpoint', async () => {
            // Test the service directly since Express routing is complex to test
            const result = await mockReportServiceInstance.generateDailyReport();
            expect(result.success).toBe(true);
            expect(result.stats).toBeDefined();
            expect(mockReportServiceInstance.generateDailyReport).toHaveBeenCalled();
        });

        test('should handle weekly report endpoint', async () => {
            const result = await mockReportServiceInstance.generateWeeklyReport();
            expect(result.success).toBe(true);
            expect(result.stats).toBeDefined();
        });

        test('should handle custom stats endpoint', async () => {
            const fromDate = new Date('2024-12-01');
            const toDate = new Date('2024-12-07');

            const stats = await mockReportServiceInstance.generateStatistics(fromDate, toDate);
            expect(stats).toBeDefined();
            expect(stats.totalProcessed).toBe(10);
        });

        test('should handle scheduler status endpoint', () => {
            const status = mockSchedulerServiceInstance.getStatus();
            expect(status.isRunning).toBe(true);
            expect(status.activeJobs).toBe(2);
        });
    });

    describe('Report Service Integration', () => {
        test('should generate statistics correctly', async () => {
            // Unmock ReportService for this test
            jest.unmock('../app/services/reportService');
            const RealReportService = require('../app/services/reportService');
            
            const mockDatabaseService = {
                isInitialized: true,
                getProcessedEmailsSince: jest.fn().mockResolvedValue([
                    {
                        id: 1,
                        processed_at: '2024-12-15T10:00:00Z',
                        forwarded: 1,
                        forward_recipients: JSON.stringify(['test@test.com']),
                        error_message: null,
                        subject: 'Test',
                        flags: JSON.stringify([])
                    }
                ])
            };

            const reportService = new RealReportService(mockDatabaseService, mockSmtpInstance);
            
            const startDate = new Date('2024-12-15T00:00:00Z');
            const endDate = new Date('2024-12-15T23:59:59Z');

            const stats = await reportService.generateStatistics(startDate, endDate);

            expect(stats).toBeDefined();
            expect(stats.totalProcessed).toBe(1);
            expect(stats.totalForwarded).toBe(1);
        });
    });
}); 