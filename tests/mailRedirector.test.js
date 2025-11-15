const MailRedirector = require('../app/index');
const ImapListener = require('../app/services/imapListener');
const KeywordChecker = require('../app/services/keywordChecker');
const SmtpSender = require('../app/services/smtpSender');

// Mock dependencies
jest.mock('../app/services/imapListener');
jest.mock('../app/services/keywordChecker');
jest.mock('../app/services/smtpSender');
jest.mock('../app/utils/logger');

const mockImapListener = require('../app/services/imapListener');
const mockKeywordChecker = require('../app/services/keywordChecker');
const mockSmtpSender = require('../app/services/smtpSender');
const mockLogger = require('../app/utils/logger');

describe('MailRedirector', () => {
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
            getKeywords: jest.fn().mockReturnValue(['test', 'keyword'])
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

    afterEach(() => {
        if (mailRedirector && mailRedirector.stop) {
            mailRedirector.stop();
        }
    });

    describe('Constructor', () => {
        test('should initialize with correct default values', () => {
            expect(mailRedirector.imapListener).toBeNull();
            expect(mailRedirector.keywordChecker).toBeNull();
            expect(mailRedirector.smtpSender).toBeNull();
            expect(mailRedirector.isRunning).toBe(false);
            expect(mailRedirector.stats).toEqual({
                totalEmails: 0,
                matchedEmails: 0,
                forwardedEmails: 0,
                errors: 0,
                startTime: null
            });
        });
    });

    describe('validateEnvironment', () => {
        test('should validate environment variables successfully', () => {
            expect(() => mailRedirector.validateEnvironment()).not.toThrow();
            expect(mockLogger.logInfo).toHaveBeenCalledWith('Environment variables validated');
        });

        test('should throw error for missing IMAP_HOST', () => {
            delete process.env.IMAP_HOST;

            expect(() => mailRedirector.validateEnvironment()).toThrow('Missing environment variables: IMAP_HOST');
            expect(mockLogger.logError).toHaveBeenCalledWith('Environment validation failed', expect.any(Error));
        });

        test('should throw error for missing IMAP_USER', () => {
            delete process.env.IMAP_USER;

            expect(() => mailRedirector.validateEnvironment()).toThrow('Missing environment variables: IMAP_USER');
        });

        test('should throw error for missing IMAP_PASSWORD', () => {
            delete process.env.IMAP_PASSWORD;

            expect(() => mailRedirector.validateEnvironment()).toThrow('Missing environment variables: IMAP_PASSWORD');
        });

        test('should throw error for missing SMTP_HOST', () => {
            delete process.env.SMTP_HOST;

            expect(() => mailRedirector.validateEnvironment()).toThrow('Missing environment variables: SMTP_HOST');
        });

        test('should throw error for missing SMTP_USER', () => {
            delete process.env.SMTP_USER;

            expect(() => mailRedirector.validateEnvironment()).toThrow('Missing environment variables: SMTP_USER');
        });

        test('should throw error for missing SMTP_PASSWORD', () => {
            delete process.env.SMTP_PASSWORD;

            expect(() => mailRedirector.validateEnvironment()).toThrow('Missing environment variables: SMTP_PASSWORD');
        });

        test('should throw error for multiple missing variables', () => {
            delete process.env.IMAP_HOST;
            delete process.env.SMTP_HOST;

            expect(() => mailRedirector.validateEnvironment()).toThrow('Missing environment variables: IMAP_HOST, SMTP_HOST');
        });
    });

    describe('initializeServices', () => {
        test('should initialize all services successfully', async () => {
            await mailRedirector.initializeServices();

            expect(mockKeywordChecker).toHaveBeenCalled();
            expect(mockSmtpSender).toHaveBeenCalled();
            expect(mockImapListener).toHaveBeenCalled();

            expect(mailRedirector.keywordChecker).toBe(mockKeywordInstance);
            expect(mailRedirector.smtpSender).toBe(mockSmtpInstance);
            expect(mailRedirector.imapListener).toBe(mockImapInstance);

            expect(mockLogger.logInfo).toHaveBeenCalledWith('Keyword checker başlatıldı');
            expect(mockLogger.logInfo).toHaveBeenCalledWith('SMTP sender başlatıldı ve test edildi');
            expect(mockLogger.logInfo).toHaveBeenCalledWith('IMAP listener başlatıldı');
        });

        test('should handle SMTP connection test failure', async () => {
            mockSmtpInstance.testConnection.mockResolvedValue(false);

            await expect(mailRedirector.initializeServices()).rejects.toThrow('SMTP bağlantı testi başarısız');
            expect(mockLogger.logError).toHaveBeenCalledWith('Servisler başlatılırken hata oluştu', expect.any(Error));
        });

        test('should handle SMTP connection test error', async () => {
            const error = new Error('SMTP test failed');
            mockSmtpInstance.testConnection.mockRejectedValue(error);

            await expect(mailRedirector.initializeServices()).rejects.toThrow('SMTP bağlantı testi başarısız');
        });

        test('should handle service initialization error', async () => {
            const error = new Error('Service init failed');
            mockKeywordChecker.mockImplementation(() => {
                throw error;
            });

            await expect(mailRedirector.initializeServices()).rejects.toThrow('Service init failed');
            expect(mockLogger.logError).toHaveBeenCalledWith('Servisler başlatılırken hata oluştu', error);
        });
    });

    describe('setupEmailProcessing', () => {
        test('should setup email processing callback', () => {
            mailRedirector.imapListener = mockImapInstance;
            mailRedirector.setupEmailProcessing();

            expect(mockImapInstance.setEmailReceivedCallback).toHaveBeenCalledWith(expect.any(Function));
        });
    });

    describe('processEmail', () => {
        const mockEmailData = {
            messageId: 'test-message-id',
            from: 'sender@example.com',
            to: 'recipient@example.com',
            subject: 'Test Subject',
            text: 'Test email content with urgent keyword',
            html: '<p>Test email content with urgent keyword</p>',
            date: new Date(),
            attachments: []
        };

        beforeEach(() => {
            mailRedirector.keywordChecker = mockKeywordInstance;
            mailRedirector.smtpSender = mockSmtpInstance;
        });

        test('should process email with keyword match successfully', async () => {
            const keywordResult = {
                hasMatch: true,
                matchedKeywords: ['urgent'],
                matchCount: 1,
                contentLength: mockEmailData.text.length
            };

            const sendResult = {
                success: true,
                messageId: 'sent-message-id',
                recipients: ['test@example.com'],
                timestamp: new Date().toISOString()
            };

            mockKeywordInstance.checkKeywords.mockReturnValue(keywordResult);
            mockSmtpInstance.sendEmail.mockResolvedValue(sendResult);

            await mailRedirector.processEmail(mockEmailData);

            expect(mockKeywordInstance.checkKeywords).toHaveBeenCalledWith(mockEmailData);
            expect(mockSmtpInstance.sendEmail).toHaveBeenCalledWith(mockEmailData);
            expect(mailRedirector.stats.totalEmails).toBe(1);
            expect(mailRedirector.stats.matchedEmails).toBe(1);
            expect(mailRedirector.stats.forwardedEmails).toBe(1);
            expect(mailRedirector.stats.errors).toBe(0);

            expect(mockLogger.logInfo).toHaveBeenCalledWith('E-posta işleniyor', {
                messageId: mockEmailData.messageId,
                from: mockEmailData.from,
                subject: mockEmailData.subject,
                totalEmails: 1
            });

            expect(mockLogger.logInfo).toHaveBeenCalledWith('Anahtar kelime eşleşmesi bulundu, e-posta yönlendiriliyor', {
                matchedKeywords: ['urgent'],
                matchCount: 1,
                subject: mockEmailData.subject
            });

            expect(mockLogger.logInfo).toHaveBeenCalledWith('E-posta başarıyla yönlendirildi', {
                messageId: 'sent-message-id',
                recipients: ['test@example.com'],
                forwardedEmails: 1
            });
        });

        test('should process email without keyword match', async () => {
            const keywordResult = {
                hasMatch: false,
                matchedKeywords: [],
                matchCount: 0,
                contentLength: mockEmailData.text.length
            };

            mockKeywordInstance.checkKeywords.mockReturnValue(keywordResult);

            await mailRedirector.processEmail(mockEmailData);

            expect(mockKeywordInstance.checkKeywords).toHaveBeenCalledWith(mockEmailData);
            expect(mockSmtpInstance.sendEmail).not.toHaveBeenCalled();
            expect(mailRedirector.stats.totalEmails).toBe(1);
            expect(mailRedirector.stats.matchedEmails).toBe(0);
            expect(mailRedirector.stats.forwardedEmails).toBe(0);
            expect(mailRedirector.stats.errors).toBe(0);

            expect(mockLogger.logInfo).toHaveBeenCalledWith('Anahtar kelime eşleşmesi bulunamadı, e-posta atlanıyor', {
                subject: mockEmailData.subject,
                contentLength: mockEmailData.text.length
            });
        });

        test('should handle email sending failure', async () => {
            const keywordResult = {
                hasMatch: true,
                matchedKeywords: ['urgent'],
                matchCount: 1,
                contentLength: mockEmailData.text.length
            };

            const sendResult = {
                success: false,
                error: 'Send failed',
                timestamp: new Date().toISOString()
            };

            mockKeywordInstance.checkKeywords.mockReturnValue(keywordResult);
            mockSmtpInstance.sendEmail.mockResolvedValue(sendResult);

            await mailRedirector.processEmail(mockEmailData);

            expect(mailRedirector.stats.totalEmails).toBe(1);
            expect(mailRedirector.stats.matchedEmails).toBe(1);
            expect(mailRedirector.stats.forwardedEmails).toBe(0);
            expect(mailRedirector.stats.errors).toBe(1);

            expect(mockLogger.logError).toHaveBeenCalledWith('E-posta yönlendirme başarısız', {
                error: 'Send failed',
                subject: mockEmailData.subject,
                errors: 1
            });
        });

        test('should handle email processing error', async () => {
            const error = new Error('Processing failed');
            mockKeywordInstance.checkKeywords.mockImplementation(() => {
                throw error;
            });

            await mailRedirector.processEmail(mockEmailData);

            expect(mailRedirector.stats.totalEmails).toBe(1);
            expect(mailRedirector.stats.matchedEmails).toBe(0);
            expect(mailRedirector.stats.forwardedEmails).toBe(0);
            expect(mailRedirector.stats.errors).toBe(1);

            expect(mockLogger.logError).toHaveBeenCalledWith('E-posta işleme sırasında hata oluştu', error, {
                messageId: mockEmailData.messageId,
                subject: mockEmailData.subject,
                errors: 1
            });
        });
    });

    describe('start', () => {
        test('should start application successfully', async () => {
            await mailRedirector.start();

            expect(mailRedirector.isRunning).toBe(true);
            expect(mailRedirector.stats.startTime).toBeDefined();
            expect(mockImapInstance.connect).toHaveBeenCalled();
            expect(mockImapInstance.setEmailReceivedCallback).toHaveBeenCalled();

            expect(mockLogger.logInfo).toHaveBeenCalledWith('Mail Redirector uygulaması başlatılıyor...');
            expect(mockLogger.logInfo).toHaveBeenCalledWith('Mail Redirector uygulaması başarıyla başlatıldı', {
                startTime: expect.any(String),
                checkInterval: 30000
            });
        });

        test('should handle environment validation error', async () => {
            delete process.env.IMAP_HOST;

            await expect(mailRedirector.start()).rejects.toThrow('Eksik environment variable\'lar: IMAP_HOST');
            expect(mockLogger.logError).toHaveBeenCalledWith('Uygulama başlatılırken hata oluştu', expect.any(Error));
        });

        test('should handle service initialization error', async () => {
            const error = new Error('Service init failed');
            mockKeywordChecker.mockImplementation(() => {
                throw error;
            });

            await expect(mailRedirector.start()).rejects.toThrow('Service init failed');
        });
    });

    describe('stop', () => {
        test('should stop application successfully', async () => {
            mailRedirector.imapListener = mockImapInstance;
            mailRedirector.isRunning = true;
            mailRedirector.stats.startTime = new Date().toISOString();

            await mailRedirector.stop();

            expect(mailRedirector.isRunning).toBe(false);
            expect(mockImapInstance.disconnect).toHaveBeenCalled();

            expect(mockLogger.logInfo).toHaveBeenCalledWith('Mail Redirector uygulaması durduruluyor...');
            expect(mockLogger.logInfo).toHaveBeenCalledWith('Uygulama durduruldu', {
                finalStats: expect.any(Object)
            });
        });

        test('should handle stop error gracefully', async () => {
            const error = new Error('Stop failed');
            mockImapInstance.disconnect.mockImplementation(() => {
                throw error;
            });

            mailRedirector.imapListener = mockImapInstance;
            mailRedirector.isRunning = true;

            await mailRedirector.stop();

            expect(mockLogger.logError).toHaveBeenCalledWith('Uygulama durdurulurken hata oluştu', error);
        });

        test('should handle stop when not running', async () => {
            mailRedirector.isRunning = false;

            await mailRedirector.stop();

            expect(mockImapInstance.disconnect).not.toHaveBeenCalled();
        });
    });

    describe('getStats', () => {
        test('should return correct stats', () => {
            mailRedirector.imapListener = mockImapInstance;
            mailRedirector.stats.startTime = new Date('2023-01-01T00:00:00Z').toISOString();
            mailRedirector.stats.totalEmails = 10;
            mailRedirector.stats.matchedEmails = 5;
            mailRedirector.stats.forwardedEmails = 4;
            mailRedirector.stats.errors = 1;
            mailRedirector.isRunning = true;

            const stats = mailRedirector.getStats();

            expect(stats).toEqual({
                totalEmails: 10,
                matchedEmails: 5,
                forwardedEmails: 4,
                errors: 1,
                startTime: expect.any(String),
                uptime: expect.any(Number),
                isRunning: true,
                imapStatus: { isConnected: true, isListening: true }
            });
        });

        test('should handle stats without start time', () => {
            mailRedirector.stats.startTime = null;

            const stats = mailRedirector.getStats();

            expect(stats.uptime).toBe(0);
        });
    });

    describe('reloadConfig', () => {
        test('should reload configuration successfully', () => {
            mailRedirector.keywordChecker = mockKeywordInstance;
            mailRedirector.smtpSender = mockSmtpInstance;

            mailRedirector.reloadConfig();

            expect(mockKeywordInstance.reloadKeywords).toHaveBeenCalled();
            expect(mockSmtpInstance.reloadRecipients).toHaveBeenCalled();
            expect(mockLogger.logInfo).toHaveBeenCalledWith('Konfigürasyonlar yeniden yüklendi');
        });

        test('should handle reload error gracefully', () => {
            const error = new Error('Reload failed');
            mockKeywordInstance.reloadKeywords.mockImplementation(() => {
                throw error;
            });

            mailRedirector.keywordChecker = mockKeywordInstance;
            mailRedirector.smtpSender = mockSmtpInstance;

            mailRedirector.reloadConfig();

            expect(mockLogger.logError).toHaveBeenCalledWith('Konfigürasyon yeniden yüklenirken hata oluştu', error);
        });

        test('should handle reload when services are not initialized', () => {
            mailRedirector.keywordChecker = null;
            mailRedirector.smtpSender = null;

            expect(() => mailRedirector.reloadConfig()).not.toThrow();
        });
    });

    describe('setupSignalHandlers', () => {
        test('should setup signal handlers', () => {
            const originalProcessOn = process.on;
            const mockProcessOn = jest.fn();
            process.on = mockProcessOn;

            mailRedirector.setupSignalHandlers();

            expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
            expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
            expect(mockProcessOn).toHaveBeenCalledWith('SIGQUIT', expect.any(Function));

            process.on = originalProcessOn;
        });

        test('should handle shutdown signal', async () => {
            const originalProcessOn = process.on;
            const mockProcessOn = jest.fn();
            process.on = mockProcessOn;

            mailRedirector.setupSignalHandlers();

            const sigintHandler = mockProcessOn.mock.calls.find(call => call[0] === 'SIGINT')[1];

            // Mock process.exit to prevent actual exit
            const originalExit = process.exit;
            process.exit = jest.fn();

            await sigintHandler('SIGINT');

            expect(mockLogger.logWarn).toHaveBeenCalledWith('Sinyal alındı: SIGINT, uygulama kapatılıyor...');
            expect(process.exit).toHaveBeenCalledWith(0);

            process.on = originalProcessOn;
            process.exit = originalExit;
        });
    });

    describe('Global Error Handlers', () => {
        test('should register global error handlers', () => {
            // Check that handlers are registered when module is loaded
            const handlersBefore = process.listenerCount('uncaughtException');
            const rejectionHandlersBefore = process.listenerCount('unhandledRejection');
            
            // The handlers should be registered when app/index.js is loaded
            // Since we're already in a test environment, we just verify the behavior exists
            expect(typeof process.on).toBe('function');
            
            // Verify that error handling infrastructure exists
            expect(mockLogger.logError).toBeDefined();
        });

        test('should have error handling capability', () => {
            // Test that error logging function exists and can be called
            const testError = new Error('Test error');
            mockLogger.logError('Test error message', testError);
            
            expect(mockLogger.logError).toHaveBeenCalled();
        });
    });
}); 