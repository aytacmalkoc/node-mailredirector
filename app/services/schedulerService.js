const cron = require('node-cron');
const { logInfo, logError } = require('../utils/logger');

class SchedulerService {
    constructor(reportService) {
        this.reportService = reportService;
        this.jobs = [];
        this.isRunning = false;
    }

    /**
     * Starts scheduled jobs
     */
    start() {
        if (this.isRunning) {
            logInfo('Scheduler already running');
            return;
        }

        this.isRunning = true;

        // Daily report schedule
        if (process.env.REPORT_DAILY_ENABLED !== 'false') {
            const dailySchedule = process.env.REPORT_DAILY_SCHEDULE || '0 9 * * *'; // 09:00 every day
            const dailyJob = cron.schedule(dailySchedule, async () => {
                try {
                    logInfo('Daily report scheduled job triggered');
                    await this.reportService.generateDailyReport();
                } catch (error) {
                    logError('Error in daily report scheduled job', error);
                }
            }, {
                scheduled: true,
                timezone: process.env.REPORT_TIMEZONE || 'Europe/Istanbul'
            });

            this.jobs.push({ name: 'daily-report', job: dailyJob });
            logInfo('Daily report scheduler started', { schedule: dailySchedule });
        }

        // Weekly report schedule
        if (process.env.REPORT_WEEKLY_ENABLED !== 'false') {
            const weeklySchedule = process.env.REPORT_WEEKLY_SCHEDULE || '0 9 * * 1'; // 09:00 every Monday
            const weeklyJob = cron.schedule(weeklySchedule, async () => {
                try {
                    logInfo('Weekly report scheduled job triggered');
                    await this.reportService.generateWeeklyReport();
                } catch (error) {
                    logError('Error in weekly report scheduled job', error);
                }
            }, {
                scheduled: true,
                timezone: process.env.REPORT_TIMEZONE || 'Europe/Istanbul'
            });

            this.jobs.push({ name: 'weekly-report', job: weeklyJob });
            logInfo('Weekly report scheduler started', { schedule: weeklySchedule });
        }

        logInfo('Scheduler service started', {
            activeJobs: this.jobs.length,
            jobs: this.jobs.map(j => j.name)
        });
    }

    /**
     * Stops all scheduled jobs
     */
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.jobs.forEach(({ name, job }) => {
            job.stop();
            logInfo(`Stopped scheduled job: ${name}`);
        });

        this.jobs = [];
        this.isRunning = false;
        logInfo('Scheduler service stopped');
    }

    /**
     * Gets scheduler status
     * @returns {Object} Status information
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            activeJobs: this.jobs.length,
            jobs: this.jobs.map(({ name, job }) => ({
                name,
                running: job.running || false
            }))
        };
    }
}

module.exports = SchedulerService;

