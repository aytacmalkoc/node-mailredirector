const TemplateEngine = require('../app/utils/templateEngine');
const path = require('path');
const fs = require('fs').promises;

describe('TemplateEngine', () => {
    const testTemplatePath = path.join(__dirname, 'test-template.html');
    const testData = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Hello World'
    };

    beforeAll(async () => {
        // Create a test template file
        const testTemplate = `
            <html>
            <body>
                <h1>Hello {{name}}</h1>
                <p>Email: {{email}}</p>
                <p>Message: {{message}}</p>
            </body>
            </html>
        `;
        await fs.writeFile(testTemplatePath, testTemplate);
    });

    afterAll(async () => {
        // Clean up test template file
        try {
            await fs.unlink(testTemplatePath);
        } catch (error) {
            // File might not exist, ignore error
        }
    });

    describe('loadTemplate', () => {
        it('should load template and replace placeholders', async () => {
            const result = await TemplateEngine.loadTemplate(testTemplatePath, testData);
            
            expect(result).toContain('Hello John Doe');
            expect(result).toContain('Email: john@example.com');
            expect(result).toContain('Message: Hello World');
            expect(result).not.toContain('{{name}}');
            expect(result).not.toContain('{{email}}');
            expect(result).not.toContain('{{message}}');
        });

        it('should handle missing template file', async () => {
            await expect(
                TemplateEngine.loadTemplate('non-existent-file.html', testData)
            ).rejects.toThrow('Failed to load template');
        });

        it('should handle missing data values', async () => {
            const partialData = { name: 'John' };
            const result = await TemplateEngine.loadTemplate(testTemplatePath, partialData);
            
            expect(result).toContain('Hello John');
            expect(result).toContain('Email: ');
            expect(result).toContain('Message: ');
        });
    });

    describe('loadEmailTemplate', () => {
        it('should load email template with email data', async () => {
            const emailData = {
                from: 'sender@example.com',
                subject: 'Test Subject',
                date: '2024-01-01T00:00:00.000Z',
                html: '<p>Test content</p>'
            };

            const result = await TemplateEngine.loadEmailTemplate(emailData);
            
            expect(result).toContain('This email was automatically forwarded');
            expect(result).toContain('sender@example.com');
            expect(result).toContain('Test Subject');
            expect(result).toContain('2024-01-01T00:00:00.000Z');
            expect(result).toContain('<p>Test content</p>');
        });

        it('should handle missing email data with defaults', async () => {
            const emailData = {
                from: null,
                subject: null,
                date: null,
                html: null,
                text: 'Plain text content'
            };

            const result = await TemplateEngine.loadEmailTemplate(emailData);
            
            expect(result).toContain('This email was automatically forwarded');
            expect(result).toContain('Unknown');
            expect(result).toContain('No Subject');
            expect(result).toContain('<p>Plain text content</p>');
        });

        it('should use text content when html is not available', async () => {
            const emailData = {
                from: 'sender@example.com',
                subject: 'Test Subject',
                date: '2024-01-01T00:00:00.000Z',
                html: null,
                text: 'Plain text content'
            };

            const result = await TemplateEngine.loadEmailTemplate(emailData);
            
            expect(result).toContain('<p>Plain text content</p>');
        });
    });
}); 