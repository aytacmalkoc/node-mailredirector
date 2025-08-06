const fs = require('fs');
const path = require('path');
const { logInfo, logError, logDebug } = require('../utils/logger');
const { MESSAGES } = require('../constants/messages');

class KeywordChecker {
    constructor() {
        this.keywordGroups = [];
        this.caseSensitive = false;
        this.matchWholeWord = false;
        this.defaultRecipients = [];
        this.loadKeywords();
    }

    /**
     * Loads keywords from configuration file
     */
    loadKeywords() {
        try {
            const configPath = path.join(__dirname, '../config/keywords.json');
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

            // New structure: keywordGroups
            if (config.keywordGroups) {
                this.keywordGroups = config.keywordGroups || [];
                this.caseSensitive = config.caseSensitive || false;
                this.matchWholeWord = config.matchWholeWord || false;
                this.defaultRecipients = config.defaultRecipients || [];

                logInfo(MESSAGES.KEYWORDS_LOADED, {
                    groupCount: this.keywordGroups.length,
                    caseSensitive: this.caseSensitive,
                    matchWholeWord: this.matchWholeWord,
                    defaultRecipientsCount: this.defaultRecipients.length
                });
            } else {
                // Legacy structure: keywords (for backward compatibility)
                this.keywordGroups = [{
                    keywords: config.keywords || [],
                    recipients: config.defaultRecipients || [],
                    description: 'Default group'
                }];
                this.caseSensitive = config.caseSensitive || false;
                this.matchWholeWord = config.matchWholeWord || false;
                this.defaultRecipients = config.defaultRecipients || [];

                logInfo(MESSAGES.KEYWORDS_LOADED_LEGACY, {
                    keywordCount: config.keywords?.length || 0,
                    caseSensitive: this.caseSensitive,
                    matchWholeWord: this.matchWholeWord
                });
            }

            // Calculate total keyword count
            const totalKeywords = this.keywordGroups.reduce((total, group) => total + group.keywords.length, 0);
            logInfo(MESSAGES.TOTAL_KEYWORDS_COUNT, { totalKeywords });

        } catch (error) {
            logError(MESSAGES.KEYWORDS_LOAD_FAILED, error);
            throw error;
        }
    }

    /**
     * Checks email content for keywords and returns matching recipients
     * @param {Object} email - Email object
     * @param {string} email.subject - Email subject
     * @param {string} email.text - Email text content
     * @param {string} email.html - Email HTML content
     * @returns {Object} Match results and recipients
     */
    checkKeywords(email) {
        try {
            const { subject = '', text = '', html = '' } = email;
            const content = `${subject} ${text} ${html}`;

            const matches = [];
            const matchedKeywords = [];
            const matchedRecipients = new Set(); // Prevents duplicate recipients
            const matchedGroups = [];

            // Her anahtar kelime grubunu kontrol et
            for (const group of this.keywordGroups) {
                const groupMatches = [];
                let groupHasMatch = false;

                // Gruptaki her anahtar kelimeyi kontrol et
                for (const keyword of group.keywords) {
                    const searchText = this.caseSensitive ? content : content.toLowerCase();
                    const searchKeyword = this.caseSensitive ? keyword : keyword.toLowerCase();

                    let isMatch = false;

                    if (this.matchWholeWord) {
                        // Tam kelime eşleşmesi
                        const wordRegex = new RegExp(`\\b${this.escapeRegex(searchKeyword)}\\b`, this.caseSensitive ? 'g' : 'gi');
                        isMatch = wordRegex.test(searchText);
                    } else {
                        // Kısmi eşleşme
                        isMatch = searchText.includes(searchKeyword);
                    }

                    if (isMatch) {
                        groupHasMatch = true;
                        matchedKeywords.push(keyword);
                        groupMatches.push({
                            keyword,
                            foundIn: this.findMatchLocations(content, keyword)
                        });
                    }
                }

                // Eğer grupta eşleşme varsa, alıcıları ekle
                if (groupHasMatch) {
                    matches.push(...groupMatches);
                    matchedGroups.push({
                        description: group.description,
                        keywords: group.keywords.filter(k => matchedKeywords.includes(k)),
                        recipients: group.recipients || []
                    });

                    // Gruptaki alıcıları ekle
                    if (group.recipients && group.recipients.length > 0) {
                        group.recipients.forEach(recipient => matchedRecipients.add(recipient));
                    }
                }
            }

            // Eşleşme yoksa varsayılan alıcıları kullan
            const finalRecipients = matchedRecipients.size > 0
                ? Array.from(matchedRecipients)
                : this.defaultRecipients;

            const result = {
                hasMatch: matches.length > 0,
                matchCount: matches.length,
                matchedKeywords,
                matches,
                matchedGroups,
                recipients: finalRecipients,
                contentLength: content.length
            };

            if (result.hasMatch) {
                logInfo('Keyword match found', {
                    matchedKeywords: result.matchedKeywords,
                    matchCount: result.matchCount,
                    matchedGroups: result.matchedGroups.map(g => g.description),
                    recipients: result.recipients,
                    subject: subject.substring(0, 100)
                });
            } else {
                logDebug('No keyword match found', {
                    subject: subject.substring(0, 100),
                    contentLength: result.contentLength,
                    defaultRecipients: result.recipients
                });
            }

            return result;
        } catch (error) {
            logError('Error during keyword check', error, { email });
            throw error;
        }
    }

    /**
     * Regex karakterlerini escape eder
     * @param {string} string - Escape edilecek string
     * @returns {string} Escape edilmiş string
     */
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Eşleşme konumlarını bulur
     * @param {string} content - İçerik
     * @param {string} keyword - Anahtar kelime
     * @returns {Array} Eşleşme konumları
     */
    findMatchLocations(content, keyword) {
        const locations = [];
        const searchText = this.caseSensitive ? content : content.toLowerCase();
        const searchKeyword = this.caseSensitive ? keyword : keyword.toLowerCase();

        let index = searchText.indexOf(searchKeyword);
        while (index !== -1) {
            locations.push({
                position: index,
                context: content.substring(Math.max(0, index - 20), index + keyword.length + 20)
            });
            index = searchText.indexOf(searchKeyword, index + 1);
        }

        return locations;
    }

    /**
     * Reloads keywords
     */
    reloadKeywords() {
        logInfo('Reloading keywords');
        this.loadKeywords();
    }

    /**
     * Mevcut anahtar kelimeleri döndürür
     * @returns {Array} Anahtar kelimeler listesi
     */
    getKeywords() {
        const allKeywords = [];
        this.keywordGroups.forEach(group => {
            allKeywords.push(...group.keywords);
        });
        return allKeywords;
    }

    /**
     * Anahtar kelime gruplarını döndürür
     * @returns {Array} Anahtar kelime grupları
     */
    getKeywordGroups() {
        return [...this.keywordGroups];
    }

    /**
     * Belirli bir anahtar kelime için alıcıları döndürür
     * @param {string} keyword - Anahtar kelime
     * @returns {Array} Alıcı listesi
     */
    getRecipientsForKeyword(keyword) {
        for (const group of this.keywordGroups) {
            if (group.keywords.includes(keyword)) {
                return group.recipients || [];
            }
        }
        return this.defaultRecipients;
    }

    /**
     * Belirli bir grup için alıcıları döndürür
     * @param {string} groupDescription - Grup açıklaması
     * @returns {Array} Alıcı listesi
     */
    getRecipientsForGroup(groupDescription) {
        const group = this.keywordGroups.find(g => g.description === groupDescription);
        return group ? (group.recipients || []) : this.defaultRecipients;
    }

    /**
     * Varsayılan alıcıları döndürür
     * @returns {Array} Varsayılan alıcı listesi
     */
    getDefaultRecipients() {
        return [...this.defaultRecipients];
    }
}

module.exports = KeywordChecker;
