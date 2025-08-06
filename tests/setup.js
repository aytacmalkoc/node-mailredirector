// Jest setup file for test configuration

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests
process.env.CHECK_INTERVAL = '1000';
process.env.MAX_RETRY_ATTEMPTS = '1';
process.env.RETRY_DELAY = '100';

// Mock environment variables for testing
process.env.IMAP_HOST = 'test-imap.example.com';
process.env.IMAP_PORT = '993';
process.env.IMAP_USER = 'test@example.com';
process.env.IMAP_PASSWORD = 'test-password';
process.env.IMAP_TLS = 'true';

process.env.SMTP_HOST = 'test-smtp.example.com';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@example.com';
process.env.SMTP_PASSWORD = 'test-password';
process.env.SMTP_TLS = 'true';

process.env.FROM_EMAIL = 'test@example.com';
process.env.FROM_NAME = 'Test Mail Redirector';

// Global test timeout
jest.setTimeout(10000);

// Suppress console output during tests unless explicitly needed
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
    // Suppress console output during tests
    console.log = jest.fn();
    console.error = jest.fn();
    console.warn = jest.fn();
});

afterAll(() => {
    // Restore console output
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
});

// Global test utilities
global.testUtils = {
    // Create mock email data for testing
    createMockEmailData: (overrides = {}) => ({
        uid: 1,
        messageId: 'test-message-id@example.com',
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Email Subject',
        text: 'This is a test email content.',
        html: '<p>This is a test email content.</p>',
        date: new Date().toISOString(),
        attachments: [],
        size: 1024,
        flags: [],
        ...overrides
    }),

    // Create mock keyword config for testing
    createMockKeywordConfig: (overrides = {}) => ({
        keywords: ['test', 'urgent', 'important'],
        caseSensitive: false,
        matchWholeWord: false,
        ...overrides
    }),

    // Create mock recipient config for testing
    createMockRecipientConfig: (overrides = {}) => ({
        recipients: [
            {
                email: 'test1@example.com',
                name: 'Test User 1',
                department: 'test'
            },
            {
                email: 'test2@example.com',
                name: 'Test User 2',
                department: 'test'
            }
        ],
        defaultRecipients: ['test1@example.com', 'test2@example.com'],
        ...overrides
    }),

    // Wait for a specified time (useful for async tests)
    wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    // Mock file system operations
    mockFileSystem: {
        readFileSync: jest.fn(),
        writeFileSync: jest.fn(),
        existsSync: jest.fn(),
        mkdirSync: jest.fn()
    }
}; 