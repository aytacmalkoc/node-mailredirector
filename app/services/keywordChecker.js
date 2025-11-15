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
     * Checks if time-based rule conditions are met
     * @param {Object} rule - Rule object with time conditions
     * @param {Date} emailDate - Email date
     * @returns {boolean} True if time conditions are met
     */
    checkTimeConditions(rule, emailDate) {
        if (!rule.timeConditions) {
            return true; // No time conditions = always valid
        }

        const now = emailDate ? new Date(emailDate) : new Date();
        const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
        const hour = now.getHours();
        const minute = now.getMinutes();

        const conditions = rule.timeConditions;

        // Check day of week
        if (conditions.daysOfWeek && Array.isArray(conditions.daysOfWeek)) {
            if (!conditions.daysOfWeek.includes(dayOfWeek)) {
                return false;
            }
        }

        // Check time range
        if (conditions.timeRange) {
            const { start, end } = conditions.timeRange;
            if (start && end) {
                const [startHour, startMin] = start.split(':').map(Number);
                const [endHour, endMin] = end.split(':').map(Number);
                
                const currentMinutes = hour * 60 + minute;
                const startMinutes = startHour * 60 + startMin;
                const endMinutes = endHour * 60 + endMin;

                if (startMinutes > endMinutes) {
                    // Time range spans midnight
                    if (currentMinutes < startMinutes && currentMinutes > endMinutes) {
                        return false;
                    }
                } else {
                    // Normal time range
                    if (currentMinutes < startMinutes || currentMinutes > endMinutes) {
                        return false;
                    }
                }
            }
        }

        return true;
    }

    /**
     * Checks if a keyword matches using regex or simple matching
     * @param {string} keyword - Keyword or regex pattern
     * @param {string} content - Content to search
     * @param {Object} options - Matching options
     * @returns {boolean} True if matches
     */
    checkKeywordMatch(keyword, content, options = {}) {
        const isRegex = options.isRegex || false;
        const caseSensitive = options.caseSensitive !== undefined ? options.caseSensitive : this.caseSensitive;
        const matchWholeWord = options.matchWholeWord !== undefined ? options.matchWholeWord : this.matchWholeWord;

        const searchText = caseSensitive ? content : content.toLowerCase();
        const searchKeyword = caseSensitive ? keyword : keyword.toLowerCase();

        if (isRegex) {
            try {
                const flags = caseSensitive ? 'g' : 'gi';
                const regex = new RegExp(keyword, flags);
                return regex.test(searchText);
            } catch (error) {
                // Invalid regex, fall back to simple string matching
                logWarn(`Invalid regex pattern: ${keyword}, falling back to simple match`);
                return searchText.includes(searchKeyword);
            }
        } else if (matchWholeWord) {
            // Tam kelime eşleşmesi
            const wordRegex = new RegExp(`\\b${this.escapeRegex(searchKeyword)}\\b`, caseSensitive ? 'g' : 'gi');
            return wordRegex.test(searchText);
        } else {
            // Kısmi eşleşme
            return searchText.includes(searchKeyword);
        }
    }

    /**
     * Checks email content for keywords and returns matching recipients
     * @param {Object} email - Email object
     * @param {string} email.subject - Email subject
     * @param {string} email.text - Email text content
     * @param {string} email.html - Email HTML content
     * @param {string} email.from - Email sender
     * @param {string} email.date - Email date
     * @returns {Object} Match results and recipients
     */
    checkKeywords(email) {
        try {
            const { subject = '', text = '', html = '', from = '', date } = email;
            const content = `${subject} ${text} ${html}`;
            const emailDate = date ? new Date(date) : new Date();

            const matches = [];
            const matchedKeywords = [];
            const matchedRecipients = new Set(); // Prevents duplicate recipients
            const matchedGroups = [];

            // Her anahtar kelime grubunu kontrol et
            for (const group of this.keywordGroups) {
                // Check time conditions for the group
                // Support both timeConditions object and direct daysOfWeek/timeRange
                const timeConditions = group.timeConditions || (group.daysOfWeek || group.timeRange ? {
                    daysOfWeek: group.daysOfWeek,
                    timeRange: group.timeRange
                } : null);
                
                if (timeConditions && !this.checkTimeConditions({ timeConditions }, emailDate)) {
                    continue; // Skip this group if time conditions not met
                }

                // Check sender filter if specified
                if (group.fromFilter) {
                    const fromFilter = Array.isArray(group.fromFilter) ? group.fromFilter : [group.fromFilter];
                    const fromMatches = fromFilter.some(filter => {
                        if (filter.startsWith('/') && filter.endsWith('/')) {
                            // Regex pattern
                            try {
                                const regex = new RegExp(filter.slice(1, -1), 'i');
                                return regex.test(from);
                            } catch (error) {
                                return from.includes(filter);
                            }
                        } else {
                            return from.toLowerCase().includes(filter.toLowerCase());
                        }
                    });
                    if (!fromMatches) {
                        continue; // Skip this group if sender doesn't match
                    }
                }

                // Check subject filter if specified
                if (group.subjectFilter) {
                    const subjectFilter = Array.isArray(group.subjectFilter) ? group.subjectFilter : [group.subjectFilter];
                    const subjectMatches = subjectFilter.some(filter => {
                        if (filter.startsWith('/') && filter.endsWith('/')) {
                            // Regex pattern
                            try {
                                const regex = new RegExp(filter.slice(1, -1), 'i');
                                return regex.test(subject);
                            } catch (error) {
                                return subject.includes(filter);
                            }
                        } else {
                            return subject.toLowerCase().includes(filter.toLowerCase());
                        }
                    });
                    if (!subjectMatches) {
                        continue; // Skip this group if subject doesn't match
                    }
                }

                const groupMatches = [];
                let groupHasMatch = false;

                // Gruptaki her anahtar kelimeyi kontrol et
                for (const keyword of group.keywords) {
                    // Support both string keywords and keyword objects with options
                    let keywordValue, keywordOptions = {};
                    
                    if (typeof keyword === 'object' && keyword !== null) {
                        keywordValue = keyword.pattern || keyword.keyword || '';
                        keywordOptions = {
                            isRegex: keyword.regex || keyword.isRegex || false,
                            caseSensitive: keyword.caseSensitive,
                            matchWholeWord: keyword.matchWholeWord
                        };
                    } else {
                        keywordValue = keyword;
                    }

                    if (!keywordValue) continue;

                    const isMatch = this.checkKeywordMatch(keywordValue, content, keywordOptions);

                    if (isMatch) {
                        groupHasMatch = true;
                        matchedKeywords.push(keywordValue);
                        groupMatches.push({
                            keyword: keywordValue,
                            isRegex: keywordOptions.isRegex || false,
                            foundIn: this.findMatchLocations(content, keywordValue)
                        });
                    }
                }

                // Eğer grupta eşleşme varsa, alıcıları ekle
                if (groupHasMatch) {
                    matches.push(...groupMatches);
                    matchedGroups.push({
                        description: group.description,
                        keywords: group.keywords.filter(k => {
                            const kw = typeof k === 'object' ? (k.pattern || k.keyword) : k;
                            return matchedKeywords.includes(kw);
                        }),
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
     * Saves keywords to configuration file
     * @param {Object} config - Configuration object with keywordGroups, defaultRecipients, etc.
     * @returns {boolean} Success status
     */
    saveKeywords(config) {
        try {
            const configPath = path.join(__dirname, '../config/keywords.json');
            
            // Validate config structure
            if (!config.keywordGroups || !Array.isArray(config.keywordGroups)) {
                throw new Error('Invalid config: keywordGroups must be an array');
            }

            // Prepare config object
            const configToSave = {
                keywordGroups: config.keywordGroups,
                caseSensitive: config.caseSensitive !== undefined ? config.caseSensitive : this.caseSensitive,
                matchWholeWord: config.matchWholeWord !== undefined ? config.matchWholeWord : this.matchWholeWord,
                defaultRecipients: config.defaultRecipients || this.defaultRecipients
            };

            // Write to file
            fs.writeFileSync(
                configPath,
                JSON.stringify(configToSave, null, 4),
                'utf8'
            );

            // Reload keywords
            this.loadKeywords();

            logInfo('Keywords saved successfully', {
                groupCount: configToSave.keywordGroups.length,
                defaultRecipientsCount: configToSave.defaultRecipients.length
            });

            return true;
        } catch (error) {
            logError('Failed to save keywords', error);
            throw error;
        }
    }

    /**
     * Adds a new keyword group
     * @param {Object} group - Keyword group object
     * @returns {boolean} Success status
     */
    addKeywordGroup(group) {
        try {
            if (!group.keywords || !Array.isArray(group.keywords) || group.keywords.length === 0) {
                throw new Error('Keywords array is required and cannot be empty');
            }
            if (!group.recipients || !Array.isArray(group.recipients) || group.recipients.length === 0) {
                throw new Error('Recipients array is required and cannot be empty');
            }

            const currentConfig = {
                keywordGroups: this.keywordGroups,
                caseSensitive: this.caseSensitive,
                matchWholeWord: this.matchWholeWord,
                defaultRecipients: this.defaultRecipients
            };

            // Add new group
            currentConfig.keywordGroups.push({
                description: group.description || 'New Group',
                keywords: group.keywords,
                recipients: group.recipients,
                fromFilter: group.fromFilter || null,
                subjectFilter: group.subjectFilter || null,
                daysOfWeek: group.daysOfWeek || null,
                timeRange: group.timeRange || null
            });

            return this.saveKeywords(currentConfig);
        } catch (error) {
            logError('Failed to add keyword group', error);
            throw error;
        }
    }

    /**
     * Updates a keyword group by index
     * @param {number} index - Group index
     * @param {Object} group - Updated group object
     * @returns {boolean} Success status
     */
    updateKeywordGroup(index, group) {
        try {
            if (index < 0 || index >= this.keywordGroups.length) {
                throw new Error('Invalid group index');
            }

            const currentConfig = {
                keywordGroups: [...this.keywordGroups],
                caseSensitive: this.caseSensitive,
                matchWholeWord: this.matchWholeWord,
                defaultRecipients: this.defaultRecipients
            };

            // Update group
            currentConfig.keywordGroups[index] = {
                ...currentConfig.keywordGroups[index],
                ...group
            };

            return this.saveKeywords(currentConfig);
        } catch (error) {
            logError('Failed to update keyword group', error);
            throw error;
        }
    }

    /**
     * Deletes a keyword group by index
     * @param {number} index - Group index
     * @returns {boolean} Success status
     */
    deleteKeywordGroup(index) {
        try {
            if (index < 0 || index >= this.keywordGroups.length) {
                throw new Error('Invalid group index');
            }

            const currentConfig = {
                keywordGroups: this.keywordGroups.filter((_, i) => i !== index),
                caseSensitive: this.caseSensitive,
                matchWholeWord: this.matchWholeWord,
                defaultRecipients: this.defaultRecipients
            };

            return this.saveKeywords(currentConfig);
        } catch (error) {
            logError('Failed to delete keyword group', error);
            throw error;
        }
    }

    /**
     * Updates default recipients
     * @param {Array} recipients - Default recipients array
     * @returns {boolean} Success status
     */
    updateDefaultRecipients(recipients) {
        try {
            if (!Array.isArray(recipients)) {
                throw new Error('Recipients must be an array');
            }

            const currentConfig = {
                keywordGroups: this.keywordGroups,
                caseSensitive: this.caseSensitive,
                matchWholeWord: this.matchWholeWord,
                defaultRecipients: recipients
            };

            return this.saveKeywords(currentConfig);
        } catch (error) {
            logError('Failed to update default recipients', error);
            throw error;
        }
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
