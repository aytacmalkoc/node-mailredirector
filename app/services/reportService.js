const { logInfo, logError } = require('../utils/logger');
const SmtpSender = require('./smtpSender');
const TemplateEngine = require('../utils/templateEngine');
const path = require('path');

class ReportService {
    constructor(databaseService, smtpSender) {
        this.databaseService = databaseService;
        this.smtpSender = smtpSender;
        this.reportRecipients = this.parseReportRecipients();
    }

    /**
     * Parses report recipients from environment variable
     * @returns {Array} List of email addresses
     */
    parseReportRecipients() {
        const recipients = process.env.REPORT_RECIPIENTS || '';
        if (!recipients) {
            return [];
        }
        return recipients.split(',').map(email => email.trim()).filter(email => email);
    }

    /**
     * Generates statistics for a date range
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Promise<Object>} Statistics
     */
    async generateStatistics(startDate, endDate) {
        try {
            if (!this.databaseService || !this.databaseService.isInitialized) {
                throw new Error('Database service not available');
            }

            // Get all processed emails in date range
            const allEmails = await this.databaseService.getProcessedEmailsSince(startDate);
            
            // Filter by end date
            const emailsInRange = allEmails.filter(email => {
                const emailDate = new Date(email.processed_at);
                return emailDate >= startDate && emailDate <= endDate;
            });

            // Parse JSON fields
            const parsedEmails = emailsInRange.map(email => ({
                ...email,
                forward_recipients: email.forward_recipients ? JSON.parse(email.forward_recipients) : [],
                flags: email.flags ? JSON.parse(email.flags) : []
            }));

            // Calculate statistics
            const stats = {
                totalProcessed: parsedEmails.length,
                totalForwarded: parsedEmails.filter(e => e.forwarded === 1).length,
                totalErrors: parsedEmails.filter(e => e.error_message).length,
                totalSkipped: parsedEmails.filter(e => e.forwarded === 0 && !e.error_message).length,
                
                // Keyword statistics (from forwarded emails)
                keywordStats: {},
                recipientStats: {},
                
                // Time distribution
                hourlyDistribution: {},
                
                // Error details
                errors: parsedEmails.filter(e => e.error_message).map(e => ({
                    subject: e.subject,
                    error: e.error_message,
                    timestamp: e.processed_at
                })),
                
                // Top recipients
                topRecipients: [],
                
                // Date range
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            };

            // Analyze forwarded emails for keywords and recipients
            const forwardedEmails = parsedEmails.filter(e => e.forwarded === 1);
            
            forwardedEmails.forEach(email => {
                // Count recipients
                if (email.forward_recipients && Array.isArray(email.forward_recipients)) {
                    email.forward_recipients.forEach(recipient => {
                        stats.recipientStats[recipient] = (stats.recipientStats[recipient] || 0) + 1;
                    });
                }

                // Hourly distribution
                const emailDate = new Date(email.processed_at);
                const hour = emailDate.getHours();
                stats.hourlyDistribution[hour] = (stats.hourlyDistribution[hour] || 0) + 1;
            });

            // Sort top recipients
            stats.topRecipients = Object.entries(stats.recipientStats)
                .map(([email, count]) => ({ email, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);

            return stats;
        } catch (error) {
            logError('Error generating statistics', error);
            throw error;
        }
    }

    /**
     * Generates daily report
     * @returns {Promise<Object>} Report result
     */
    async generateDailyReport() {
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 1);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

            logInfo('Generating daily report', {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            });

            const stats = await this.generateStatistics(startDate, endDate);
            return await this.sendReport(stats, 'daily');
        } catch (error) {
            logError('Error generating daily report', error);
            throw error;
        }
    }

    /**
     * Generates weekly report
     * @returns {Promise<Object>} Report result
     */
    async generateWeeklyReport() {
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);

            logInfo('Generating weekly report', {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            });

            const stats = await this.generateStatistics(startDate, endDate);
            return await this.sendReport(stats, 'weekly');
        } catch (error) {
            logError('Error generating weekly report', error);
            throw error;
        }
    }

    /**
     * Sends report email
     * @param {Object} stats - Statistics object
     * @param {string} reportType - 'daily' or 'weekly'
     * @returns {Promise<Object>} Send result
     */
    async sendReport(stats, reportType = 'daily') {
        try {
            if (!this.reportRecipients || this.reportRecipients.length === 0) {
                logInfo('No report recipients configured, skipping report send');
                return {
                    success: false,
                    error: 'No report recipients configured',
                    stats
                };
            }

            // Generate HTML report
            const htmlContent = await this.generateReportHTML(stats, reportType);
            const textContent = this.generateReportText(stats, reportType);

            const reportSubject = reportType === 'daily' 
                ? `Günlük E-posta Yönlendirme Raporu - ${new Date().toLocaleDateString('tr-TR')}`
                : `Haftalık E-posta Yönlendirme Raporu - ${new Date().toLocaleDateString('tr-TR')}`;

            // Send email using SMTP sender
            const emailData = {
                subject: reportSubject,
                text: textContent,
                html: htmlContent,
                from: process.env.FROM_EMAIL || process.env.SMTP_USER,
                date: new Date().toISOString()
            };

            const result = await this.smtpSender.sendEmail(emailData, this.reportRecipients);

            if (result.success) {
                logInfo(`${reportType} report sent successfully`, {
                    recipients: this.reportRecipients,
                    stats: {
                        totalProcessed: stats.totalProcessed,
                        totalForwarded: stats.totalForwarded
                    }
                });
            } else {
                logError(`Failed to send ${reportType} report`, {
                    error: result.error,
                    recipients: this.reportRecipients
                });
            }

            return {
                success: result.success,
                stats,
                recipients: this.reportRecipients,
                error: result.error
            };
        } catch (error) {
            logError('Error sending report', error);
            throw error;
        }
    }

    /**
     * Generates HTML report content
     * @param {Object} stats - Statistics object
     * @param {string} reportType - 'daily' or 'weekly'
     * @returns {Promise<string>} HTML content
     */
    async generateReportHTML(stats, reportType) {
        try {
            // Generate sections
            const topRecipientsSection = stats.topRecipients.length > 0 ? `
                <h2>En Çok E-posta Alan Alıcılar</h2>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>E-posta Adresi</th>
                            <th>Toplam</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${stats.topRecipients.map((r, index) => `
                        <tr>
                            <td>${index + 1}</td>
                            <td>${r.email}</td>
                            <td><strong>${r.count}</strong></td>
                        </tr>
                        `).join('')}
                    </tbody>
                </table>
            ` : '';

            const errorsSection = stats.errors.length > 0 ? `
                <h2>Hatalar (Son 10)</h2>
                ${stats.errors.slice(0, 10).map(e => `
                <div class="error-item">
                    <strong>${e.subject || 'Konu Yok'}</strong><br>
                    <small>${new Date(e.timestamp).toLocaleString('tr-TR')}</small><br>
                    ${e.error}
                </div>
                `).join('')}
            ` : '';

            const templatePath = path.join(__dirname, '../templates/report-template.html');
            return await TemplateEngine.loadTemplate(templatePath, {
                reportType: reportType === 'daily' ? 'Günlük' : 'Haftalık',
                date: new Date().toLocaleDateString('tr-TR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                }),
                'stats.totalProcessed': stats.totalProcessed,
                'stats.totalForwarded': stats.totalForwarded,
                'stats.totalSkipped': stats.totalSkipped,
                'stats.totalErrors': stats.totalErrors,
                topRecipientsSection: topRecipientsSection,
                errorsSection: errorsSection
            });
        } catch (error) {
            // Fallback to simple HTML if template fails
            return this.generateSimpleReportHTML(stats, reportType);
        }
    }

    /**
     * Generates simple HTML report (fallback)
     * @param {Object} stats - Statistics object
     * @param {string} reportType - 'daily' or 'weekly'
     * @returns {string} HTML content
     */
    generateSimpleReportHTML(stats, reportType) {
        const reportTypeText = reportType === 'daily' ? 'Günlük' : 'Haftalık';
        const date = new Date().toLocaleDateString('tr-TR');

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #2c3e50; border-bottom: 3px solid #3498db; padding-bottom: 10px; }
        h2 { color: #34495e; margin-top: 30px; }
        .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin: 20px 0; }
        .stat-card { background: #f8f9fa; padding: 15px; border-radius: 5px; border-left: 4px solid #3498db; }
        .stat-value { font-size: 2em; font-weight: bold; color: #3498db; }
        .stat-label { color: #7f8c8d; font-size: 0.9em; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #3498db; color: white; }
        tr:hover { background-color: #f5f5f5; }
        .error-item { background: #fee; padding: 10px; margin: 5px 0; border-left: 3px solid #e74c3c; }
    </style>
</head>
<body>
    <h1>${reportTypeText} E-posta Yönlendirme Raporu</h1>
    <p><strong>Tarih:</strong> ${date}</p>
    
    <h2>Özet İstatistikler</h2>
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-value">${stats.totalProcessed}</div>
            <div class="stat-label">Toplam İşlenen</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.totalForwarded}</div>
            <div class="stat-label">Yönlendirilen</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.totalSkipped}</div>
            <div class="stat-label">Atlanan</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${stats.totalErrors}</div>
            <div class="stat-label">Hatalar</div>
        </div>
    </div>

    ${stats.topRecipients.length > 0 ? `
    <h2>En Çok E-posta Alan Alıcılar</h2>
    <table>
        <thead>
            <tr>
                <th>E-posta Adresi</th>
                <th>Toplam</th>
            </tr>
        </thead>
        <tbody>
            ${stats.topRecipients.map(r => `
            <tr>
                <td>${r.email}</td>
                <td>${r.count}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>
    ` : ''}

    ${stats.errors.length > 0 ? `
    <h2>Hatalar (Son 10)</h2>
    ${stats.errors.map(e => `
    <div class="error-item">
        <strong>${e.subject || 'Konu Yok'}</strong><br>
        <small>${new Date(e.timestamp).toLocaleString('tr-TR')}</small><br>
        ${e.error}
    </div>
    `).join('')}
    ` : ''}

    <hr>
    <p style="color: #7f8c8d; font-size: 0.9em;">
        Bu rapor otomatik olarak Mail Redirector tarafından oluşturulmuştur.
    </p>
</body>
</html>
        `;
    }

    /**
     * Generates text report content
     * @param {Object} stats - Statistics object
     * @param {string} reportType - 'daily' or 'weekly'
     * @returns {string} Text content
     */
    generateReportText(stats, reportType) {
        const reportTypeText = reportType === 'daily' ? 'Günlük' : 'Haftalık';
        const date = new Date().toLocaleDateString('tr-TR');

        let text = `${reportTypeText} E-posta Yönlendirme Raporu\n`;
        text += `Tarih: ${date}\n\n`;
        text += `Özet İstatistikler:\n`;
        text += `- Toplam İşlenen: ${stats.totalProcessed}\n`;
        text += `- Yönlendirilen: ${stats.totalForwarded}\n`;
        text += `- Atlanan: ${stats.totalSkipped}\n`;
        text += `- Hatalar: ${stats.totalErrors}\n\n`;

        if (stats.topRecipients.length > 0) {
            text += `En Çok E-posta Alan Alıcılar:\n`;
            stats.topRecipients.forEach(r => {
                text += `- ${r.email}: ${r.count}\n`;
            });
            text += `\n`;
        }

        if (stats.errors.length > 0) {
            text += `Hatalar (Son 10):\n`;
            stats.errors.slice(0, 10).forEach(e => {
                text += `- ${e.subject || 'Konu Yok'} (${new Date(e.timestamp).toLocaleString('tr-TR')}): ${e.error}\n`;
            });
        }

        return text;
    }
}

module.exports = ReportService;

