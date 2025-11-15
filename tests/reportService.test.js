const ReportService = require('../app/services/reportService');
const SmtpSender = require('../app/services/smtpSender');

// Mock dependencies
jest.mock('../app/services/smtpSender');
jest.mock('../app/utils/logger');
jest.mock('../app/utils/templateEngine');

const mockSmtpSender = require('../app/services/smtpSender');
const mockLogger = require('../app/utils/logger');
const mockTemplateEngine = require('../app/utils/templateEngine');

describe('ReportService', () => {
    let reportService;
    let mockDatabaseService;
    let mockSmtpSenderInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock database service
        mockDatabaseService = {
            isInitialized: true,
            getProcessedEmailsSince: jest.fn()
        };

        // Mock SMTP sender instance
        mockSmtpSenderInstance = {
            sendEmail: jest.fn()
        };
        mockSmtpSender.mockImplementation(() => mockSmtpSenderInstance);

        // Mock environment variables
        process.env.REPORT_RECIPIENTS = 'admin@test.com,manager@test.com';
        process.env.FROM_EMAIL = 'sender@test.com';

        reportService = new ReportService(mockDatabaseService, mockSmtpSenderInstance);
    });

    describe('Constructor', () => {
        test('should initialize with database and SMTP services', () => {
            expect(reportService).toBeDefined();
            expect(reportService.databaseService).toBe(mockDatabaseService);
            expect(reportService.smtpSender).toBe(mockSmtpSenderInstance);
        });

        test('should parse report recipients from environment', () => {
            expect(reportService.reportRecipients).toContain('admin@test.com');
            expect(reportService.reportRecipients).toContain('manager@test.com');
        });

        test('should handle empty recipients', () => {
            delete process.env.REPORT_RECIPIENTS;
            const service = new ReportService(mockDatabaseService, mockSmtpSenderInstance);
            expect(service.reportRecipients).toEqual([]);
        });
    });

    describe('generateStatistics', () => {
        const mockEmails = [
            {
                id: 1,
                message_id: 'msg1',
                from_email: 'sender1@test.com',
                subject: 'Test 1',
                processed_at: '2024-12-15T10:00:00Z',
                forwarded: 1,
                forward_recipients: JSON.stringify(['recipient1@test.com']),
                error_message: null
            },
            {
                id: 2,
                message_id: 'msg2',
                from_email: 'sender2@test.com',
                subject: 'Test 2',
                processed_at: '2024-12-15T11:00:00Z',
                forwarded: 1,
                forward_recipients: JSON.stringify(['recipient1@test.com', 'recipient2@test.com']),
                error_message: null
            },
            {
                id: 3,
                message_id: 'msg3',
                from_email: 'sender3@test.com',
                subject: 'Test 3',
                processed_at: '2024-12-15T12:00:00Z',
                forwarded: 0,
                forward_recipients: JSON.stringify([]),
                error_message: null
            },
            {
                id: 4,
                message_id: 'msg4',
                from_email: 'sender4@test.com',
                subject: 'Test 4',
                processed_at: '2024-12-15T13:00:00Z',
                forwarded: 0,
                forward_recipients: JSON.stringify([]),
                error_message: 'SMTP error'
            }
        ];

        test('should generate statistics for date range', async () => {
            mockDatabaseService.getProcessedEmailsSince.mockResolvedValue(mockEmails);

            const startDate = new Date('2024-12-15T00:00:00Z');
            const endDate = new Date('2024-12-15T23:59:59Z');

            const stats = await reportService.generateStatistics(startDate, endDate);

            expect(stats).toBeDefined();
            expect(stats.totalProcessed).toBe(4);
            expect(stats.totalForwarded).toBe(2);
            expect(stats.totalSkipped).toBe(1);
            expect(stats.totalErrors).toBe(1);
        });

        test('should calculate recipient statistics', async () => {
            mockDatabaseService.getProcessedEmailsSince.mockResolvedValue(mockEmails);

            const startDate = new Date('2024-12-15T00:00:00Z');
            const endDate = new Date('2024-12-15T23:59:59Z');

            const stats = await reportService.generateStatistics(startDate, endDate);

            expect(stats.recipientStats).toBeDefined();
            expect(stats.recipientStats['recipient1@test.com']).toBe(2);
            expect(stats.recipientStats['recipient2@test.com']).toBe(1);
        });

        test('should identify top recipients', async () => {
            mockDatabaseService.getProcessedEmailsSince.mockResolvedValue(mockEmails);

            const startDate = new Date('2024-12-15T00:00:00Z');
            const endDate = new Date('2024-12-15T23:59:59Z');

            const stats = await reportService.generateStatistics(startDate, endDate);

            expect(stats.topRecipients).toBeDefined();
            expect(Array.isArray(stats.topRecipients)).toBe(true);
            expect(stats.topRecipients.length).toBeGreaterThan(0);
            expect(stats.topRecipients[0].email).toBe('recipient1@test.com');
            expect(stats.topRecipients[0].count).toBe(2);
        });

        test('should calculate hourly distribution', async () => {
            mockDatabaseService.getProcessedEmailsSince.mockResolvedValue(mockEmails);

            const startDate = new Date('2024-12-15T00:00:00Z');
            const endDate = new Date('2024-12-15T23:59:59Z');

            const stats = await reportService.generateStatistics(startDate, endDate);

            expect(stats.hourlyDistribution).toBeDefined();
            expect(typeof stats.hourlyDistribution).toBe('object');
        });

        test('should include error details', async () => {
            mockDatabaseService.getProcessedEmailsSince.mockResolvedValue(mockEmails);

            const startDate = new Date('2024-12-15T00:00:00Z');
            const endDate = new Date('2024-12-15T23:59:59Z');

            const stats = await reportService.generateStatistics(startDate, endDate);

            expect(stats.errors).toBeDefined();
            expect(Array.isArray(stats.errors)).toBe(true);
            expect(stats.errors.length).toBe(1);
            expect(stats.errors[0].error).toBe('SMTP error');
        });

        test('should throw error if database not available', async () => {
            mockDatabaseService.isInitialized = false;

            const startDate = new Date('2024-12-15T00:00:00Z');
            const endDate = new Date('2024-12-15T23:59:59Z');

            await expect(
                reportService.generateStatistics(startDate, endDate)
            ).rejects.toThrow();
        });
    });

    describe('generateDailyReport', () => {
        test('should generate daily report', async () => {
            mockDatabaseService.getProcessedEmailsSince.mockResolvedValue([]);
            mockSmtpSenderInstance.sendEmail.mockResolvedValue({
                success: true,
                messageId: 'test-id'
            });
            mockTemplateEngine.loadTemplate.mockResolvedValue('<html>Report</html>');

            const result = await reportService.generateDailyReport();

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(mockSmtpSenderInstance.sendEmail).toHaveBeenCalled();
        });

        test('should use correct date range for daily report', async () => {
            mockDatabaseService.getProcessedEmailsSince.mockResolvedValue([]);
            mockSmtpSenderInstance.sendEmail.mockResolvedValue({ success: true });
            mockTemplateEngine.loadTemplate.mockResolvedValue('<html>Report</html>');

            await reportService.generateDailyReport();

            expect(mockDatabaseService.getProcessedEmailsSince).toHaveBeenCalled();
            const callDate = mockDatabaseService.getProcessedEmailsSince.mock.calls[0][0];
            const now = new Date();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            // Check that the date is approximately yesterday
            expect(callDate.getDate()).toBe(yesterday.getDate());
        });
    });

    describe('generateWeeklyReport', () => {
        test('should generate weekly report', async () => {
            mockDatabaseService.getProcessedEmailsSince.mockResolvedValue([]);
            mockSmtpSenderInstance.sendEmail.mockResolvedValue({
                success: true,
                messageId: 'test-id'
            });
            mockTemplateEngine.loadTemplate.mockResolvedValue('<html>Report</html>');

            const result = await reportService.generateWeeklyReport();

            expect(result).toBeDefined();
            expect(result.success).toBe(true);
            expect(mockSmtpSenderInstance.sendEmail).toHaveBeenCalled();
        });

        test('should use correct date range for weekly report', async () => {
            mockDatabaseService.getProcessedEmailsSince.mockResolvedValue([]);
            mockSmtpSenderInstance.sendEmail.mockResolvedValue({ success: true });
            mockTemplateEngine.loadTemplate.mockResolvedValue('<html>Report</html>');

            await reportService.generateWeeklyReport();

            expect(mockDatabaseService.getProcessedEmailsSince).toHaveBeenCalled();
            const callDate = mockDatabaseService.getProcessedEmailsSince.mock.calls[0][0];
            const now = new Date();
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            
            // Check that the date is approximately 7 days ago
            expect(callDate.getDate()).toBe(weekAgo.getDate());
        });
    });

    describe('sendReport', () => {
        test('should send report email when recipients configured', async () => {
            mockDatabaseService.getProcessedEmailsSince.mockResolvedValue([]);
            mockSmtpSenderInstance.sendEmail.mockResolvedValue({
                success: true,
                messageId: 'test-id'
            });
            mockTemplateEngine.loadTemplate.mockResolvedValue('<html>Report</html>');

            const stats = {
                totalProcessed: 10,
                totalForwarded: 8,
                totalSkipped: 1,
                totalErrors: 1,
                topRecipients: [],
                errors: []
            };

            const result = await reportService.sendReport(stats, 'daily');

            expect(result.success).toBe(true);
            expect(mockSmtpSenderInstance.sendEmail).toHaveBeenCalled();
        });

        test('should not send email if no recipients configured', async () => {
            reportService.reportRecipients = [];

            const stats = {
                totalProcessed: 10,
                totalForwarded: 8,
                topRecipients: [],
                errors: []
            };

            const result = await reportService.sendReport(stats, 'daily');

            expect(result.success).toBe(false);
            expect(result.error).toContain('No report recipients');
            expect(mockSmtpSenderInstance.sendEmail).not.toHaveBeenCalled();
        });

        test('should handle SMTP send failure', async () => {
            mockSmtpSenderInstance.sendEmail.mockResolvedValue({
                success: false,
                error: 'SMTP error'
            });
            mockTemplateEngine.loadTemplate.mockResolvedValue('<html>Report</html>');

            const stats = {
                totalProcessed: 10,
                totalForwarded: 8,
                topRecipients: [],
                errors: []
            };

            const result = await reportService.sendReport(stats, 'daily');

            expect(result.success).toBe(false);
            expect(result.error).toBe('SMTP error');
        });
    });

    describe('generateReportText', () => {
        test('should generate text report', () => {
            const stats = {
                totalProcessed: 10,
                totalForwarded: 8,
                totalSkipped: 1,
                totalErrors: 1,
                topRecipients: [
                    { email: 'test@test.com', count: 5 }
                ],
                errors: [
                    { subject: 'Test', timestamp: '2024-12-15T10:00:00Z', error: 'Error message' }
                ]
            };

            const text = reportService.generateReportText(stats, 'daily');

            expect(text).toContain('Günlük');
            expect(text).toContain('10');
            expect(text).toContain('8');
            expect(text).toContain('test@test.com');
        });
    });
});

