const KeywordChecker = require('../app/services/keywordChecker');
const fs = require('fs');
const path = require('path');

jest.mock('fs');
jest.mock('../app/utils/logger');

describe('KeywordChecker', () => {
    let keywordChecker;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock fs.readFileSync to return a default config
        const defaultConfig = {
            keywordGroups: [
                {
                    keywords: ['urgent', 'acil'],
                    recipients: ['manager@company.com'],
                    description: 'Acil durumlar'
                }
            ],
            caseSensitive: false,
            matchWholeWord: false,
            defaultRecipients: ['default@company.com']
        };

        fs.readFileSync.mockReturnValue(JSON.stringify(defaultConfig));
        keywordChecker = new KeywordChecker();
    });

    describe('loadKeywords', () => {
        test('should load keyword groups successfully', () => {
            const mockConfig = {
                keywordGroups: [
                    {
                        keywords: ['urgent', 'acil'],
                        recipients: ['manager@company.com'],
                        description: 'Acil durumlar'
                    },
                    {
                        keywords: ['bug', 'hata'],
                        recipients: ['tech@company.com'],
                        description: 'Teknik sorunlar'
                    }
                ],
                caseSensitive: false,
                matchWholeWord: false,
                defaultRecipients: ['default@company.com']
            };

            fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

            keywordChecker.loadKeywords();

            expect(keywordChecker.keywordGroups).toHaveLength(2);
            expect(keywordChecker.caseSensitive).toBe(false);
            expect(keywordChecker.matchWholeWord).toBe(false);
            expect(keywordChecker.defaultRecipients).toEqual(['default@company.com']);
        });

        test('should handle legacy keywords format', () => {
            const mockConfig = {
                keywords: ['urgent', 'acil'],
                caseSensitive: true,
                matchWholeWord: true,
                defaultRecipients: ['default@company.com']
            };

            fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

            keywordChecker.loadKeywords();

            expect(keywordChecker.keywordGroups).toHaveLength(1);
            expect(keywordChecker.keywordGroups[0].keywords).toEqual(['urgent', 'acil']);
            expect(keywordChecker.keywordGroups[0].recipients).toEqual(['default@company.com']);
            expect(keywordChecker.caseSensitive).toBe(true);
            expect(keywordChecker.matchWholeWord).toBe(true);
        });

        test('should handle file read error', () => {
            const error = new Error('File not found');
            fs.readFileSync.mockImplementation(() => {
                throw error;
            });

            expect(() => keywordChecker.loadKeywords()).toThrow('File not found');
        });
    });

    describe('checkKeywords', () => {
        beforeEach(() => {
            const mockConfig = {
                keywordGroups: [
                    {
                        keywords: ['urgent', 'acil'],
                        recipients: ['manager@company.com'],
                        description: 'Acil durumlar'
                    },
                    {
                        keywords: ['bug', 'hata'],
                        recipients: ['tech@company.com'],
                        description: 'Teknik sorunlar'
                    },
                    {
                        keywords: ['purchase', 'satın almak'],
                        recipients: ['sales@company.com'],
                        description: 'Satış işlemleri'
                    }
                ],
                caseSensitive: false,
                matchWholeWord: false,
                defaultRecipients: ['default@company.com']
            };

            fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
            keywordChecker.loadKeywords();
        });

        test('should find matches and return correct recipients', () => {
            const email = {
                subject: 'Urgent bug report',
                text: 'There is a critical bug that needs immediate attention.',
                html: '<p>Urgent bug report</p>'
            };

            const result = keywordChecker.checkKeywords(email);

            expect(result.hasMatch).toBe(true);
            expect(result.matchedKeywords).toContain('urgent');
            expect(result.matchedKeywords).toContain('bug');
            expect(result.recipients).toContain('manager@company.com');
            expect(result.recipients).toContain('tech@company.com');
            expect(result.matchedGroups).toHaveLength(2);
        });

        test('should handle case insensitive matching', () => {
            const email = {
                subject: 'URGENT issue',
                text: 'This is an URGENT matter.',
                html: '<p>URGENT</p>'
            };

            const result = keywordChecker.checkKeywords(email);

            expect(result.hasMatch).toBe(true);
            expect(result.matchedKeywords).toContain('urgent');
            expect(result.recipients).toContain('manager@company.com');
        });

        test('should handle whole word matching', () => {
            keywordChecker.matchWholeWord = true;

            const email = {
                subject: 'Urgent matter',
                text: 'This is urgent and needs attention.',
                html: '<p>Urgent</p>'
            };

            const result = keywordChecker.checkKeywords(email);

            expect(result.hasMatch).toBe(true);
            expect(result.matchedKeywords).toContain('urgent');
        });

        test('should return default recipients when no match found', () => {
            const email = {
                subject: 'Regular update',
                text: 'This is a regular update with no keywords.',
                html: '<p>Regular update</p>'
            };

            const result = keywordChecker.checkKeywords(email);

            expect(result.hasMatch).toBe(false);
            expect(result.recipients).toEqual(['default@company.com']);
        });

        test('should handle multiple matches in same group', () => {
            const email = {
                subject: 'Urgent and acil situation',
                text: 'This is both urgent and acil.',
                html: '<p>Urgent and acil</p>'
            };

            const result = keywordChecker.checkKeywords(email);

            expect(result.hasMatch).toBe(true);
            expect(result.matchedKeywords).toContain('urgent');
            expect(result.matchedKeywords).toContain('acil');
            expect(result.recipients).toEqual(['manager@company.com']);
        });

        test('should handle purchase keywords correctly', () => {
            const email = {
                subject: 'Purchase order',
                text: 'We want to satın almak new equipment.',
                html: '<p>Purchase order</p>'
            };

            const result = keywordChecker.checkKeywords(email);

            expect(result.hasMatch).toBe(true);
            expect(result.matchedKeywords).toContain('purchase');
            expect(result.matchedKeywords).toContain('satın almak');
            expect(result.recipients).toEqual(['sales@company.com']);
        });

        test('should handle empty email content', () => {
            const email = {
                subject: '',
                text: '',
                html: ''
            };

            const result = keywordChecker.checkKeywords(email);

            expect(result.hasMatch).toBe(false);
            expect(result.recipients).toEqual(['default@company.com']);
        });

        test('should handle missing email properties', () => {
            const email = {};

            const result = keywordChecker.checkKeywords(email);

            expect(result.hasMatch).toBe(false);
            expect(result.recipients).toEqual(['default@company.com']);
        });
    });

    describe('getRecipientsForKeyword', () => {
        beforeEach(() => {
            const mockConfig = {
                keywordGroups: [
                    {
                        keywords: ['urgent', 'acil'],
                        recipients: ['manager@company.com'],
                        description: 'Acil durumlar'
                    },
                    {
                        keywords: ['bug', 'hata'],
                        recipients: ['tech@company.com'],
                        description: 'Teknik sorunlar'
                    }
                ],
                defaultRecipients: ['default@company.com']
            };

            fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
            keywordChecker.loadKeywords();
        });

        test('should return recipients for specific keyword', () => {
            const recipients = keywordChecker.getRecipientsForKeyword('urgent');
            expect(recipients).toEqual(['manager@company.com']);
        });

        test('should return default recipients for unknown keyword', () => {
            const recipients = keywordChecker.getRecipientsForKeyword('unknown');
            expect(recipients).toEqual(['default@company.com']);
        });
    });

    describe('getRecipientsForGroup', () => {
        beforeEach(() => {
            const mockConfig = {
                keywordGroups: [
                    {
                        keywords: ['urgent', 'acil'],
                        recipients: ['manager@company.com'],
                        description: 'Acil durumlar'
                    }
                ],
                defaultRecipients: ['default@company.com']
            };

            fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
            keywordChecker.loadKeywords();
        });

        test('should return recipients for specific group', () => {
            const recipients = keywordChecker.getRecipientsForGroup('Acil durumlar');
            expect(recipients).toEqual(['manager@company.com']);
        });

        test('should return default recipients for unknown group', () => {
            const recipients = keywordChecker.getRecipientsForGroup('Unknown Group');
            expect(recipients).toEqual(['default@company.com']);
        });
    });

    describe('getKeywordGroups', () => {
        test('should return keyword groups', () => {
            const mockConfig = {
                keywordGroups: [
                    {
                        keywords: ['urgent'],
                        recipients: ['manager@company.com'],
                        description: 'Acil durumlar'
                    }
                ]
            };

            fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
            keywordChecker.loadKeywords();

            const groups = keywordChecker.getKeywordGroups();
            expect(groups).toHaveLength(1);
            expect(groups[0].description).toBe('Acil durumlar');
        });
    });

    describe('getDefaultRecipients', () => {
        test('should return default recipients', () => {
            const mockConfig = {
                keywordGroups: [],
                defaultRecipients: ['default@company.com', 'backup@company.com']
            };

            fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
            keywordChecker.loadKeywords();

            const recipients = keywordChecker.getDefaultRecipients();
            expect(recipients).toEqual(['default@company.com', 'backup@company.com']);
        });
    });

    describe('reloadKeywords', () => {
        test('should reload keywords successfully', () => {
            const mockConfig = {
                keywordGroups: [
                    {
                        keywords: ['new'],
                        recipients: ['new@company.com'],
                        description: 'New group'
                    }
                ]
            };

            fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

            keywordChecker.reloadKeywords();

            expect(keywordChecker.keywordGroups).toHaveLength(1);
            expect(keywordChecker.keywordGroups[0].keywords).toEqual(['new']);
        });
    });

    describe('getKeywords', () => {
        test('should return all keywords from all groups', () => {
            const mockConfig = {
                keywordGroups: [
                    {
                        keywords: ['urgent', 'acil'],
                        recipients: ['manager@company.com'],
                        description: 'Acil durumlar'
                    },
                    {
                        keywords: ['bug', 'hata'],
                        recipients: ['tech@company.com'],
                        description: 'Teknik sorunlar'
                    }
                ]
            };

            fs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));
            keywordChecker.loadKeywords();

            const keywords = keywordChecker.getKeywords();
            expect(keywords).toContain('urgent');
            expect(keywords).toContain('acil');
            expect(keywords).toContain('bug');
            expect(keywords).toContain('hata');
            expect(keywords).toHaveLength(4);
        });
    });
}); 