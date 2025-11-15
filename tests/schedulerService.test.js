const SchedulerService = require('../app/services/schedulerService');
const cron = require('node-cron');

// Mock dependencies
jest.mock('node-cron');
jest.mock('../app/services/reportService');
jest.mock('../app/utils/logger');

const mockCron = require('node-cron');
const mockReportService = require('../app/services/reportService');
const mockLogger = require('../app/utils/logger');

describe('SchedulerService', () => {
    let schedulerService;
    let mockReportServiceInstance;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock report service instance
        mockReportServiceInstance = {
            generateDailyReport: jest.fn().mockResolvedValue({ success: true }),
            generateWeeklyReport: jest.fn().mockResolvedValue({ success: true })
        };

        // Mock cron.schedule
        const mockJob = {
            stop: jest.fn(),
            running: true
        };
        mockCron.schedule.mockReturnValue(mockJob);

        // Mock environment variables
        process.env.REPORT_DAILY_ENABLED = 'true';
        process.env.REPORT_DAILY_SCHEDULE = '0 9 * * *';
        process.env.REPORT_WEEKLY_ENABLED = 'true';
        process.env.REPORT_WEEKLY_SCHEDULE = '0 9 * * 1';
        process.env.REPORT_TIMEZONE = 'Europe/Istanbul';

        schedulerService = new SchedulerService(mockReportServiceInstance);
    });

    describe('Constructor', () => {
        test('should initialize with report service', () => {
            expect(schedulerService).toBeDefined();
            expect(schedulerService.reportService).toBe(mockReportServiceInstance);
            expect(schedulerService.isRunning).toBe(false);
        });
    });

    describe('start', () => {
        test('should start scheduler and create cron jobs', () => {
            schedulerService.start();

            expect(schedulerService.isRunning).toBe(true);
            expect(mockCron.schedule).toHaveBeenCalled();
        });

        test('should create daily report job when enabled', () => {
            schedulerService.start();

            const dailyCall = mockCron.schedule.mock.calls.find(
                call => call[0] === '0 9 * * *'
            );

            expect(dailyCall).toBeDefined();
        });

        test('should create weekly report job when enabled', () => {
            schedulerService.start();

            const weeklyCall = mockCron.schedule.mock.calls.find(
                call => call[0] === '0 9 * * 1'
            );

            expect(weeklyCall).toBeDefined();
        });

        test('should not create daily job when disabled', () => {
            process.env.REPORT_DAILY_ENABLED = 'false';
            schedulerService = new SchedulerService(mockReportServiceInstance);
            
            schedulerService.start();

            const dailyCall = mockCron.schedule.mock.calls.find(
                call => call[0] === '0 9 * * *'
            );

            expect(dailyCall).toBeUndefined();
        });

        test('should not create weekly job when disabled', () => {
            process.env.REPORT_WEEKLY_ENABLED = 'false';
            schedulerService = new SchedulerService(mockReportServiceInstance);
            
            schedulerService.start();

            const weeklyCall = mockCron.schedule.mock.calls.find(
                call => call[0] === '0 9 * * 1'
            );

            expect(weeklyCall).toBeUndefined();
        });

        test('should not start if already running', () => {
            schedulerService.start();
            const firstCallCount = mockCron.schedule.mock.calls.length;

            schedulerService.start();
            const secondCallCount = mockCron.schedule.mock.calls.length;

            expect(secondCallCount).toBe(firstCallCount);
        });

        test('should execute daily report when cron triggers', async () => {
            let cronCallback;
            mockCron.schedule.mockImplementation((schedule, callback) => {
                if (schedule === '0 9 * * *') {
                    cronCallback = callback;
                }
                return { stop: jest.fn(), running: true };
            });

            schedulerService.start();

            if (cronCallback) {
                await cronCallback();
                expect(mockReportServiceInstance.generateDailyReport).toHaveBeenCalled();
            }
        });

        test('should execute weekly report when cron triggers', async () => {
            let cronCallback;
            mockCron.schedule.mockImplementation((schedule, callback) => {
                if (schedule === '0 9 * * 1') {
                    cronCallback = callback;
                }
                return { stop: jest.fn(), running: true };
            });

            schedulerService.start();

            if (cronCallback) {
                await cronCallback();
                expect(mockReportServiceInstance.generateWeeklyReport).toHaveBeenCalled();
            }
        });

        test('should handle errors in cron callbacks', async () => {
            mockReportServiceInstance.generateDailyReport.mockRejectedValue(
                new Error('Report error')
            );

            let cronCallback;
            mockCron.schedule.mockImplementation((schedule, callback) => {
                if (schedule === '0 9 * * *') {
                    cronCallback = callback;
                }
                return { stop: jest.fn(), running: true };
            });

            schedulerService.start();

            if (cronCallback) {
                await expect(cronCallback()).resolves.not.toThrow();
                expect(mockLogger.logError).toHaveBeenCalled();
            }
        });
    });

    describe('stop', () => {
        test('should stop all scheduled jobs', () => {
            schedulerService.start();
            expect(schedulerService.isRunning).toBe(true);

            schedulerService.stop();

            expect(schedulerService.isRunning).toBe(false);
            expect(schedulerService.jobs.length).toBe(0);
        });

        test('should call stop on all jobs', () => {
            const mockJob1 = { stop: jest.fn(), running: true };
            const mockJob2 = { stop: jest.fn(), running: true };
            
            mockCron.schedule
                .mockReturnValueOnce(mockJob1)
                .mockReturnValueOnce(mockJob2);

            schedulerService.start();
            schedulerService.stop();

            expect(mockJob1.stop).toHaveBeenCalled();
            expect(mockJob2.stop).toHaveBeenCalled();
        });

        test('should not throw if already stopped', () => {
            expect(() => schedulerService.stop()).not.toThrow();
        });
    });

    describe('getStatus', () => {
        test('should return scheduler status', () => {
            const status = schedulerService.getStatus();

            expect(status).toBeDefined();
            expect(status.isRunning).toBe(false);
            expect(status.activeJobs).toBe(0);
            expect(Array.isArray(status.jobs)).toBe(true);
        });

        test('should include job information when running', () => {
            schedulerService.start();

            const status = schedulerService.getStatus();

            expect(status.isRunning).toBe(true);
            expect(status.activeJobs).toBeGreaterThan(0);
            expect(status.jobs.length).toBeGreaterThan(0);
        });
    });
});

