const ImapListener = require('../app/services/imapListener');
const { simpleParser } = require('mailparser');

// Mock dependencies
jest.mock('node-imap');
jest.mock('mailparser');
jest.mock('../app/utils/logger');

const mockImap = require('node-imap');
const mockLogger = require('../app/utils/logger');

describe('ImapListener', () => {
    let imapListener;
    let mockConnection;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Mock IMAP connection
        mockConnection = {
            connect: jest.fn(),
            disconnect: jest.fn(),
            openBox: jest.fn(),
            search: jest.fn(),
            fetch: jest.fn(),
            on: jest.fn(),
            once: jest.fn(),
            end: jest.fn(),
            state: 'disconnected'
        };

        mockImap.mockImplementation(() => mockConnection);
        
        // Mock environment variables
        process.env.IMAP_HOST = 'imap.test.com';
        process.env.IMAP_USER = 'test@test.com';
        process.env.IMAP_PASSWORD = 'testpass';
        process.env.IMAP_PORT = '993';
        process.env.IMAP_TLS = 'true';
        
        imapListener = new ImapListener();
    });

    afterEach(() => {
        if (imapListener) {
            imapListener.disconnect();
        }
    });

    describe('Constructor', () => {
        test('should initialize with correct configuration', () => {
            expect(imapListener).toBeDefined();
            expect(imapListener.imap).toBeDefined();
            expect(imapListener.isConnected).toBe(false);
            expect(imapListener.isListening).toBe(false);
            expect(imapListener.retryAttempts).toBe(0);
            expect(imapListener.maxRetryAttempts).toBe(3);
            expect(imapListener.retryDelay).toBe(5000);
        });

        test('should create IMAP connection with correct config', () => {
            expect(mockImap).toHaveBeenCalledWith({
                host: 'imap.test.com',
                port: 993,
                user: 'test@test.com',
                password: 'testpass',
                tls: true,
                tlsOptions: { rejectUnauthorized: false }
            });
        });
    });

    describe('connect', () => {
        test('should connect successfully', () => {
            mockConnection.state = 'connected';
            
            imapListener.connect();
            
            expect(mockConnection.connect).toHaveBeenCalled();
            expect(mockLogger.logInfo).toHaveBeenCalledWith('IMAP bağlantısı başlatılıyor');
        });

        test('should handle connection error', () => {
            const error = new Error('Connection failed');
            mockConnection.connect.mockImplementation(() => {
                mockConnection.on.mock.calls.find(call => call[0] === 'error')[1](error);
            });

            imapListener.connect();

            expect(mockLogger.logError).toHaveBeenCalledWith('IMAP bağlantı hatası', error);
        });

        test('should not connect if already connected', () => {
            imapListener.isConnected = true;
            
            imapListener.connect();
            
            expect(mockConnection.connect).not.toHaveBeenCalled();
        });
    });

    describe('disconnect', () => {
        test('should disconnect successfully', () => {
            imapListener.isConnected = true;
            
            imapListener.disconnect();
            
            expect(mockConnection.end).toHaveBeenCalled();
            expect(imapListener.isConnected).toBe(false);
            expect(imapListener.isListening).toBe(false);
            expect(mockLogger.logInfo).toHaveBeenCalledWith('IMAP bağlantısı kapatıldı');
        });

        test('should handle disconnect when not connected', () => {
            imapListener.disconnect();
            
            expect(mockConnection.end).not.toHaveBeenCalled();
        });
    });

    describe('startListening', () => {
        test('should start listening successfully', () => {
            mockConnection.state = 'connected';
            
            imapListener.startListening();
            
            expect(mockConnection.openBox).toHaveBeenCalledWith('INBOX', false);
            expect(imapListener.isListening).toBe(true);
            expect(mockLogger.logInfo).toHaveBeenCalledWith('IMAP dinleme başlatıldı');
        });

        test('should handle openBox error', () => {
            const error = new Error('OpenBox failed');
            mockConnection.openBox.mockImplementation((mailbox, readOnly, callback) => {
                callback(error);
            });

            imapListener.startListening();

            expect(mockLogger.logError).toHaveBeenCalledWith('IMAP mailbox açma hatası', error);
        });

        test('should not start listening if not connected', () => {
            imapListener.startListening();
            
            expect(mockConnection.openBox).not.toHaveBeenCalled();
            expect(mockLogger.logWarn).toHaveBeenCalledWith('IMAP bağlantısı yok, dinleme başlatılamıyor');
        });
    });

    describe('stopListening', () => {
        test('should stop listening successfully', () => {
            imapListener.isListening = true;
            
            imapListener.stopListening();
            
            expect(imapListener.isListening).toBe(false);
            expect(mockLogger.logInfo).toHaveBeenCalledWith('IMAP dinleme durduruldu');
        });
    });

    describe('checkNewEmails', () => {
        test('should check for new emails successfully', () => {
            const mockMessages = [1, 2, 3];
            mockConnection.search.mockImplementation((criteria, callback) => {
                callback(null, mockMessages);
            });

            imapListener.checkNewEmails();

            expect(mockConnection.search).toHaveBeenCalledWith(['UNSEEN'], expect.any(Function));
            expect(mockConnection.fetch).toHaveBeenCalledWith(mockMessages, expect.any(Object));
        });

        test('should handle search error', () => {
            const error = new Error('Search failed');
            mockConnection.search.mockImplementation((criteria, callback) => {
                callback(error);
            });

            imapListener.checkNewEmails();

            expect(mockLogger.logError).toHaveBeenCalledWith('IMAP e-posta arama hatası', error);
        });

        test('should handle empty results', () => {
            mockConnection.search.mockImplementation((criteria, callback) => {
                callback(null, []);
            });

            imapListener.checkNewEmails();

            expect(mockConnection.fetch).not.toHaveBeenCalled();
        });
    });

    describe('fetchEmails', () => {
        test('should fetch emails successfully', () => {
            const messageCount = 2;
            const mockMessages = [1, 2];
            
            imapListener.fetchEmails(messageCount);

            expect(mockConnection.fetch).toHaveBeenCalledWith(mockMessages, {
                bodies: '',
                struct: true,
                markSeen: true
            });
        });

        test('should handle fetch error', () => {
            const error = new Error('Fetch failed');
            mockConnection.fetch.mockImplementation((messages, options) => {
                const stream = {
                    on: jest.fn((event, callback) => {
                        if (event === 'error') {
                            callback(error);
                        }
                        return stream;
                    })
                };
                return stream;
            });

            imapListener.fetchEmails(1);

            expect(mockLogger.logError).toHaveBeenCalledWith('IMAP e-posta getirme hatası', error);
        });
    });

    describe('processEmail', () => {
        test('should process email successfully', async () => {
            const mockBuffer = Buffer.from('test email');
            const mockAttributes = {
                uid: 123,
                flags: ['\\Seen'],
                envelope: {
                    subject: 'Test Subject',
                    from: [{ name: 'Test User', address: 'test@example.com' }],
                    to: [{ name: 'Recipient', address: 'recipient@example.com' }],
                    date: new Date()
                }
            };

            const mockParsedEmail = {
                messageId: 'test-message-id',
                from: 'test@example.com',
                to: 'recipient@example.com',
                subject: 'Test Subject',
                text: 'Test email content',
                html: '<p>Test email content</p>',
                date: new Date(),
                attachments: []
            };

            simpleParser.mockResolvedValue(mockParsedEmail);

            const callback = jest.fn();
            imapListener.setEmailReceivedCallback(callback);

            await imapListener.processEmail(mockBuffer, mockAttributes);

            expect(simpleParser).toHaveBeenCalledWith(mockBuffer);
            expect(callback).toHaveBeenCalledWith(mockParsedEmail);
            expect(mockLogger.logInfo).toHaveBeenCalledWith('E-posta işlendi', {
                messageId: mockParsedEmail.messageId,
                subject: mockParsedEmail.subject
            });
        });

        test('should handle parsing error', async () => {
            const mockBuffer = Buffer.from('invalid email');
            const mockAttributes = { uid: 123 };

            const error = new Error('Parsing failed');
            simpleParser.mockRejectedValue(error);

            await imapListener.processEmail(mockBuffer, mockAttributes);

            expect(mockLogger.logError).toHaveBeenCalledWith('E-posta ayrıştırma hatası', error, {
                uid: mockAttributes.uid
            });
        });
    });

    describe('setEmailReceivedCallback', () => {
        test('should set email received callback', () => {
            const callback = jest.fn();
            
            imapListener.setEmailReceivedCallback(callback);
            
            expect(imapListener.emailReceivedCallback).toBe(callback);
        });
    });

    describe('getStatus', () => {
        test('should return correct status', () => {
            imapListener.isConnected = true;
            imapListener.isListening = true;
            imapListener.retryAttempts = 2;

            const status = imapListener.getStatus();

            expect(status).toEqual({
                isConnected: true,
                isListening: true,
                retryAttempts: 2,
                maxRetryAttempts: 3,
                retryDelay: 5000
            });
        });
    });

    describe('Event Handlers', () => {
        test('should handle ready event', () => {
            imapListener.connect();
            
            const readyHandler = mockConnection.on.mock.calls.find(call => call[0] === 'ready')[1];
            readyHandler();

            expect(imapListener.isConnected).toBe(true);
            expect(mockLogger.logInfo).toHaveBeenCalledWith('IMAP bağlantısı hazır');
        });

        test('should handle error event', () => {
            const error = new Error('Connection error');
            imapListener.connect();
            
            const errorHandler = mockConnection.on.mock.calls.find(call => call[0] === 'error')[1];
            errorHandler(error);

            expect(mockLogger.logError).toHaveBeenCalledWith('IMAP bağlantı hatası', error);
            expect(imapListener.isConnected).toBe(false);
        });

        test('should handle end event', () => {
            imapListener.connect();
            
            const endHandler = mockConnection.on.mock.calls.find(call => call[0] === 'end')[1];
            endHandler();

            expect(mockLogger.logInfo).toHaveBeenCalledWith('IMAP bağlantısı sonlandı');
            expect(imapListener.isConnected).toBe(false);
        });

        test('should handle close event', () => {
            imapListener.connect();
            
            const closeHandler = mockConnection.on.mock.calls.find(call => call[0] === 'close')[1];
            closeHandler();

            expect(mockLogger.logInfo).toHaveBeenCalledWith('IMAP bağlantısı kapatıldı');
            expect(imapListener.isConnected).toBe(false);
        });
    });

    describe('Retry Logic', () => {
        test('should retry connection on failure', () => {
            jest.useFakeTimers();
            
            const error = new Error('Connection failed');
            mockConnection.connect.mockImplementation(() => {
                const errorHandler = mockConnection.on.mock.calls.find(call => call[0] === 'error')[1];
                errorHandler(error);
            });

            imapListener.connect();

            expect(imapListener.retryAttempts).toBe(1);
            expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 5000);

            jest.runAllTimers();

            expect(mockConnection.connect).toHaveBeenCalledTimes(2);
            jest.useRealTimers();
        });

        test('should stop retrying after max attempts', () => {
            jest.useFakeTimers();
            
            imapListener.retryAttempts = 3;
            
            const error = new Error('Connection failed');
            mockConnection.connect.mockImplementation(() => {
                const errorHandler = mockConnection.on.mock.calls.find(call => call[0] === 'error')[1];
                errorHandler(error);
            });

            imapListener.connect();

            expect(mockLogger.logError).toHaveBeenCalledWith('Maksimum yeniden deneme sayısına ulaşıldı');
            expect(setTimeout).not.toHaveBeenCalled();

            jest.useRealTimers();
        });
    });

    describe('Environment Variables', () => {
        test('should handle missing environment variables', () => {
            delete process.env.IMAP_HOST;
            delete process.env.IMAP_USER;
            delete process.env.IMAP_PASSWORD;

            expect(() => new ImapListener()).toThrow();
        });

        test('should handle invalid port number', () => {
            process.env.IMAP_PORT = 'invalid';

            const listener = new ImapListener();
            expect(listener.imap.config.port).toBe(993); // Default value
        });
    });
}); 