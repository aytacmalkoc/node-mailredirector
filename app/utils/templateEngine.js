const fs = require('fs').promises;
const path = require('path');
const { logError } = require('./logger');

/**
 * Template engine utility for replacing placeholders in templates
 */
class TemplateEngine {
    /**
     * Loads a template file and replaces placeholders with provided data
     * @param {string} templatePath - Path to the template file
     * @param {Object} data - Data to replace placeholders with
     * @returns {Promise<string>} Processed template content
     */
    static async loadTemplate(templatePath, data) {
        try {
            const fullPath = path.resolve(templatePath);
            let template = await fs.readFile(fullPath, 'utf8');
            
            // Replace placeholders with data
            Object.keys(data).forEach(key => {
                const placeholder = `{{${key}}}`;
                const value = data[key] || '';
                template = template.replace(new RegExp(placeholder, 'g'), value);
            });
            
            return template;
        } catch (error) {
            logError('Error loading template', error);
            throw new Error(`Failed to load template: ${error.message}`);
        }
    }

    /**
     * Loads the email HTML template with provided email data
     * @param {Object} emailData - Email data object
     * @returns {Promise<string>} Formatted HTML content
     */
    static async loadEmailTemplate(emailData) {
        const { from, subject, html, text, date } = emailData;
        
        const templateData = {
            from: from || 'Unknown',
            subject: subject || 'No Subject',
            date: date || new Date().toISOString(),
            content: html || `<p>${text || 'No content found.'}</p>`
        };

        const templatePath = path.join(__dirname, '..', 'templates', 'email-template.html');
        return await this.loadTemplate(templatePath, templateData);
    }
}

module.exports = TemplateEngine; 