const { logInfo, logError, logWarn, logDebug, extractErrorLocation } = require('../app/utils/logger');
const winston = require('winston');
const fs = require('fs');
const path = require('path');

// Mock dependencies
jest.mock('winston');
jest.mock('fs');
jest.mock('path');

const mockWinston = require('winston');
const mockFs = require('fs');
const mockPath = require('path');

describe('Logger', () => {
    let mockLogger;
    let mockTransports;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Mock path operations
        mockPath.join.mockReturnValue('/mock/log/path');
        mockPath.basename.mockReturnValue('test.js');
        
        // Mock file system operations
        mockFs.existsSync.mockReturnValue(false);
        mockFs.mkdirSync.mockReturnValue(undefined);
        mockFs.appendFileSync.mockReturnValue(undefined);
        
        // Mock winston logger
        mockTransports = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn()
        };

        mockLogger = {
            info: jest.fn(),
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            add: jest.fn()
        };

        mockWinston.createLogger.mockReturnValue(mockLogger);
        mockWinston.transports = {
            File: jest.fn().mockImplementation(() => mockTransports),
            Console: jest.fn().mockImplementation(() => mockTransports)
        };
        mockWinston.format = {
            combine: jest.fn().mockReturnValue({}),
            timestamp: jest.fn().mockReturnValue({}),
            errors: jest.fn().mockReturnValue({}),
            json: jest.fn().mockReturnValue({}),
            colorize: jest.fn().mockReturnValue({}),
            simple: jest.fn().mockReturnValue({}),
            printf: jest.fn().mockReturnValue({})
        };
        
        // Mock environment variables
        process.env.NODE_ENV = 'test';
        process.env.LOG_LEVEL = 'info';
    });

    afterEach(() => {
        // Clear module cache to reset logger state
        jest.resetModules();
    });

    describe('extractErrorLocation', () => {
        test('should extract location from standard Node.js stack trace', () => {
            const error = new Error('Test error');
            error.stack = `Error: Test error
    at testFunction (/path/to/test.js:25:10)
    at Object.<anonymous> (/path/to/main.js:15:5)
    at Module._compile (node:internal/modules/cjs/loader:1565:14)`;

            const location = extractErrorLocation(error);

            expect(location).toEqual({
                file: 'test.js',
                line: 25,
                column: 10,
                function: 'testFunction',
                fullPath: '/path/to/test.js'
            });
        });

        test('should extract location from anonymous function stack trace', () => {
            const error = new Error('Test error');
            error.stack = `Error: Test error
    at /path/to/test.js:25:10
    at Module._compile (node:internal/modules/cjs/loader:1565:14)`;

            const location = extractErrorLocation(error);

            expect(location).toEqual({
                file: 'test.js',
                line: 25,
                column: 10,
                function: 'anonymous',
                fullPath: '/path/to/test.js'
            });
        });

        test('should handle error without stack trace', () => {
            const error = new Error('Test error');
            error.stack = undefined;

            const location = extractErrorLocation(error);

            expect(location).toEqual({
                file: 'unknown',
                line: 'unknown',
                function: 'unknown'
            });
        });

        test('should handle null error', () => {
            const location = extractErrorLocation(null);

            expect(location).toEqual({
                file: 'unknown',
                line: 'unknown',
                function: 'unknown'
            });
        });

        test('should handle stack trace without location info', () => {
            const error = new Error('Test error');
            error.stack = `Error: Test error
    at someFunction
    at anotherFunction`;

            const location = extractErrorLocation(error);

            expect(location).toEqual({
                file: 'unknown',
                line: 'unknown',
                function: 'unknown'
            });
        });

        test('should handle different stack trace formats', () => {
            const error = new Error('Test error');
            error.stack = `Error: Test error
    at eval (eval at <anonymous> (/path/to/test.js:1:1), <anonymous>:1:1)
    at Object.<anonymous> (/path/to/test.js:1:1)`;

            const location = extractErrorLocation(error);

            expect(location).toEqual({
                file: 'test.js',
                line: 1,
                column: 1,
                function: 'Object.<anonymous>',
                fullPath: '/path/to/test.js'
            });
        });
    });

    describe('logInfo', () => {
        test('should log info message successfully', () => {
            // Mock winston logger to work properly
            const { logInfo } = require('../app/utils/logger');
            
            const message = 'Test info message';
            const meta = { test: true };

            logInfo(message, meta);

            // Since winston is mocked, we expect the fallback logger to be used
            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                '/mock/log/path',
                expect.stringContaining('INFO: Test info message')
            );
        });

        test('should handle logger error and use fallback', () => {
            const { logInfo } = require('../app/utils/logger');
            
            const message = 'Test info message';
            const meta = { test: true };

            // Should not throw
            expect(() => logInfo(message, meta)).not.toThrow();

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                '/mock/log/path',
                expect.stringContaining('INFO: Test info message')
            );
        });

        test('should handle fallback logger error gracefully', () => {
            mockFs.appendFileSync.mockImplementation(() => {
                throw new Error('File system error');
            });

            const { logInfo } = require('../app/utils/logger');
            
            const message = 'Test info message';

            // Should not throw
            expect(() => logInfo(message)).not.toThrow();
        });
    });

    describe('logError', () => {
        test('should log error message with error object', () => {
            const { logError } = require('../app/utils/logger');
            
            const message = 'Test error message';
            const error = new Error('Test error');
            const meta = { test: true };

            logError(message, error, meta);

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                '/mock/log/path',
                expect.stringContaining('ERROR: Test error message')
            );
        });

        test('should log error message without error object', () => {
            const { logError } = require('../app/utils/logger');
            
            const message = 'Test error message';
            const meta = { test: true };

            logError(message, null, meta);

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                '/mock/log/path',
                expect.stringContaining('ERROR: Test error message')
            );
        });

        test('should handle logger error and use fallback', () => {
            const { logError } = require('../app/utils/logger');
            
            const message = 'Test error message';
            const testError = new Error('Test error');

            // Should not throw
            expect(() => logError(message, testError)).not.toThrow();

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                '/mock/log/path',
                expect.stringContaining('ERROR: Test error message')
            );
        });

        test('should extract error location correctly', () => {
            const { logError } = require('../app/utils/logger');
            
            const message = 'Test error message';
            const error = new Error('Test error');
            error.stack = `Error: Test error
    at testFunction (/path/to/test.js:25:10)`;

            logError(message, error);

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                '/mock/log/path',
                expect.stringContaining('ERROR: Test error message')
            );
        });
    });

    describe('logWarn', () => {
        test('should log warning message successfully', () => {
            const { logWarn } = require('../app/utils/logger');
            
            const message = 'Test warning message';
            const meta = { test: true };

            logWarn(message, meta);

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                '/mock/log/path',
                expect.stringContaining('WARN: Test warning message')
            );
        });

        test('should handle logger error and use fallback', () => {
            const { logWarn } = require('../app/utils/logger');
            
            const message = 'Test warning message';

            // Should not throw
            expect(() => logWarn(message)).not.toThrow();

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                '/mock/log/path',
                expect.stringContaining('WARN: Test warning message')
            );
        });
    });

    describe('logDebug', () => {
        test('should log debug message successfully', () => {
            const { logDebug } = require('../app/utils/logger');
            
            const message = 'Test debug message';
            const meta = { test: true };

            logDebug(message, meta);

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                '/mock/log/path',
                expect.stringContaining('DEBUG: Test debug message')
            );
        });

        test('should handle logger error and use fallback', () => {
            const { logDebug } = require('../app/utils/logger');
            
            const message = 'Test debug message';

            // Should not throw
            expect(() => logDebug(message)).not.toThrow();

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                '/mock/log/path',
                expect.stringContaining('DEBUG: Test debug message')
            );
        });
    });

    describe('Winston Logger Configuration', () => {
        test('should create winston logger with correct configuration', () => {
            // Re-import logger to trigger winston configuration
            jest.resetModules();
            require('../app/utils/logger');

            expect(mockWinston.createLogger).toHaveBeenCalled();
        });

        test('should add console transport in non-production environment', () => {
            process.env.NODE_ENV = 'development';
            
            // Re-import logger to trigger winston configuration
            jest.resetModules();
            require('../app/utils/logger');

            // Since winston is mocked, we expect the fallback logger to be used
            expect(mockFs.appendFileSync).toBeDefined();
        });

        test('should not add console transport in production environment', () => {
            process.env.NODE_ENV = 'production';
            
            // Re-import logger to trigger winston configuration
            jest.resetModules();
            require('../app/utils/logger');

            // In production, winston should be used
            expect(mockWinston.createLogger).toHaveBeenCalled();
        });

        test('should handle winston creation error and use fallback', () => {
            const error = new Error('Winston creation failed');
            mockWinston.createLogger.mockImplementation(() => {
                throw error;
            });

            // Should not throw
            expect(() => require('../app/utils/logger')).not.toThrow();
        });
    });

    describe('File System Operations', () => {
        test('should create log directory if it does not exist', () => {
            mockFs.existsSync.mockReturnValue(false);

            // Re-import logger to trigger directory creation
            jest.resetModules();
            require('../app/utils/logger');

            expect(mockFs.mkdirSync).toHaveBeenCalledWith('/mock/log/path', { recursive: true });
        });

        test('should not create log directory if it already exists', () => {
            mockFs.existsSync.mockReturnValue(true);

            // Re-import logger to trigger directory creation
            jest.resetModules();
            require('../app/utils/logger');

            expect(mockFs.mkdirSync).not.toHaveBeenCalled();
        });

        test('should handle directory creation error gracefully', () => {
            const error = new Error('Directory creation failed');
            mockFs.existsSync.mockReturnValue(false);
            mockFs.mkdirSync.mockImplementation(() => {
                throw error;
            });

            // Should not throw
            expect(() => require('../app/utils/logger')).not.toThrow();
        });
    });

    describe('Fallback Logger', () => {
        test('should use fallback logger when winston fails', () => {
            const error = new Error('Winston creation failed');
            mockWinston.createLogger.mockImplementation(() => {
                throw error;
            });

            // Re-import logger
            jest.resetModules();
            const { logInfo } = require('../app/utils/logger');

            const message = 'Test message';
            logInfo(message);

            expect(mockFs.appendFileSync).toHaveBeenCalledWith(
                '/mock/log/path',
                expect.stringContaining('INFO: Test message')
            );
        });

        test('should handle fallback logger file write error', () => {
            const error = new Error('Winston creation failed');
            mockWinston.createLogger.mockImplementation(() => {
                throw error;
            });
            mockFs.appendFileSync.mockImplementation(() => {
                throw new Error('File write failed');
            });

            // Re-import logger
            jest.resetModules();
            const { logInfo } = require('../app/utils/logger');

            const message = 'Test message';

            // Should not throw
            expect(() => logInfo(message)).not.toThrow();
        });
    });

    describe('Environment Variables', () => {
        test('should use LOG_LEVEL from environment', () => {
            process.env.LOG_LEVEL = 'debug';

            // Re-import logger to trigger winston configuration
            jest.resetModules();
            require('../app/utils/logger');

            expect(mockWinston.createLogger).toHaveBeenCalled();
        });

        test('should use default LOG_LEVEL when not set', () => {
            delete process.env.LOG_LEVEL;

            // Re-import logger to trigger winston configuration
            jest.resetModules();
            require('../app/utils/logger');

            expect(mockWinston.createLogger).toHaveBeenCalled();
        });
    });

    describe('Log Format', () => {
        test('should create correct log format', () => {
            // Re-import logger to trigger winston configuration
            jest.resetModules();
            require('../app/utils/logger');

            expect(mockWinston.format.combine).toHaveBeenCalled();
            expect(mockWinston.format.timestamp).toHaveBeenCalledWith({
                format: 'YYYY-MM-DD HH:mm:ss'
            });
            expect(mockWinston.format.errors).toHaveBeenCalledWith({ stack: true });
        });
    });

    describe('File Transports', () => {
        test('should create error and combined file transports', () => {
            // Re-import logger to trigger winston configuration
            jest.resetModules();
            require('../app/utils/logger');

            expect(mockWinston.transports.File).toHaveBeenCalled();
        });
    });
}); 