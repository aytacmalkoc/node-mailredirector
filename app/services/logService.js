const fs = require('fs');
const path = require('path');
const { logError, logDebug } = require('../utils/logger');

class LogService {
    constructor() {
        this.logDir = path.join(__dirname, '../logs');
    }

    /**
     * Gets available log files
     * @returns {Array} List of log files
     */
    getLogFiles() {
        try {
            if (!fs.existsSync(this.logDir)) {
                return [];
            }

            const files = fs.readdirSync(this.logDir);
            const logFiles = files
                .filter(file => file.endsWith('.log'))
                .map(file => {
                    const filePath = path.join(this.logDir, file);
                    const stats = fs.statSync(filePath);
                    return {
                        name: file,
                        size: stats.size,
                        modified: stats.mtime.toISOString(),
                        type: this.getLogType(file)
                    };
                })
                .sort((a, b) => new Date(b.modified) - new Date(a.modified));

            return logFiles;
        } catch (error) {
            logError('Error getting log files', error);
            return [];
        }
    }

    /**
     * Determines log type from filename
     * @param {string} filename - Log filename
     * @returns {string} Log type
     */
    getLogType(filename) {
        if (filename.includes('error')) return 'error';
        if (filename.includes('forwarded')) return 'forwarded';
        if (filename.includes('system')) return 'system';
        return 'unknown';
    }

    /**
     * Reads log file with pagination
     * @param {string} filename - Log filename
     * @param {Object} options - Read options
     * @returns {Object} Log entries
     */
    readLogFile(filename, options = {}) {
        const {
            limit = 100,
            offset = 0,
            level = 'all',
            search = null,
            fromDate = null,
            toDate = null
        } = options;

        try {
            const filePath = path.join(this.logDir, filename);
            
            // Security check: ensure file is in log directory (normalize paths for comparison)
            const normalizedFilePath = path.normalize(filePath);
            const normalizedLogDir = path.normalize(this.logDir);
            
            if (!normalizedFilePath.startsWith(normalizedLogDir)) {
                throw new Error('Invalid log file path');
            }

            if (!fs.existsSync(filePath)) {
                return {
                    success: false,
                    error: 'Log file not found',
                    entries: [],
                    total: 0,
                    limit,
                    offset
                };
            }

            // Read file content
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n').filter(line => line.trim());

            // Parse and filter log entries
            let entries = lines
                .map((line, index) => this.parseLogLine(line, index))
                .filter(entry => entry !== null);

            // Filter by level
            if (level !== 'all') {
                entries = entries.filter(entry => 
                    entry.level && entry.level.toLowerCase() === level.toLowerCase()
                );
            }

            // Filter by date range
            if (fromDate) {
                const from = new Date(fromDate);
                entries = entries.filter(entry => entry.timestamp && new Date(entry.timestamp) >= from);
            }

            if (toDate) {
                const to = new Date(toDate);
                entries = entries.filter(entry => entry.timestamp && new Date(entry.timestamp) <= to);
            }

            // Filter by search term
            if (search) {
                const searchLower = search.toLowerCase();
                entries = entries.filter(entry => 
                    entry.message && entry.message.toLowerCase().includes(searchLower) ||
                    entry.meta && JSON.stringify(entry.meta).toLowerCase().includes(searchLower)
                );
            }

            // Sort by timestamp (newest first)
            entries.sort((a, b) => {
                const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                return timeB - timeA;
            });

            const total = entries.length;

            // Apply pagination
            const paginatedEntries = entries.slice(offset, offset + limit);

            return {
                success: true,
                entries: paginatedEntries,
                total,
                limit,
                offset,
                hasMore: offset + limit < total
            };
        } catch (error) {
            logError('Error reading log file', error);
            return {
                success: false,
                error: error.message,
                entries: [],
                total: 0,
                limit,
                offset
            };
        }
    }

    /**
     * Parses a log line into structured format
     * @param {string} line - Log line
     * @param {number} lineNumber - Line number
     * @returns {Object|null} Parsed log entry
     */
    parseLogLine(line, lineNumber) {
        try {
            // Winston format: [YYYY-MM-DD HH:mm:ss] LEVEL: message | Meta: {...}
            const winstonPattern = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]\s+(\w+):\s+(.+?)(?:\s+\|\s+(.+))?$/;
            const match = line.match(winstonPattern);

            if (match) {
                const [, timestamp, level, message, metaString] = match;
                let meta = {};

                // Parse meta information
                if (metaString) {
                    // Try to extract Location, Function, Meta, etc.
                    const locationMatch = metaString.match(/Location:\s*([^|]+)/);
                    const functionMatch = metaString.match(/Function:\s*([^|]+)/);
                    const metaMatch = metaString.match(/Meta:\s*({.+})/);

                    if (locationMatch) meta.location = locationMatch[1].trim();
                    if (functionMatch) meta.function = functionMatch[1].trim();
                    if (metaMatch) {
                        try {
                            meta = { ...meta, ...JSON.parse(metaMatch[1]) };
                        } catch (e) {
                            // Ignore JSON parse errors
                        }
                    }
                }

                return {
                    lineNumber,
                    timestamp: new Date(timestamp).toISOString(),
                    level: level.toUpperCase(),
                    message: message.trim(),
                    meta,
                    raw: line
                };
            }

            // Fallback: try to parse as simple format
            const simplePattern = /^\[(.+?)\]\s+(\w+):\s+(.+)$/;
            const simpleMatch = line.match(simplePattern);

            if (simpleMatch) {
                const [, timestamp, level, message] = simpleMatch;
                return {
                    lineNumber,
                    timestamp: new Date(timestamp).toISOString(),
                    level: level.toUpperCase(),
                    message: message.trim(),
                    meta: {},
                    raw: line
                };
            }

            // If no pattern matches, return as raw entry
            return {
                lineNumber,
                timestamp: new Date().toISOString(),
                level: 'UNKNOWN',
                message: line,
                meta: {},
                raw: line
            };
        } catch (error) {
            logDebug('Error parsing log line', { line, error: error.message });
            return null;
        }
    }

    /**
     * Gets log statistics
     * @param {string} filename - Log filename (optional)
     * @returns {Object} Log statistics
     */
    getLogStats(filename = null) {
        try {
            const files = filename ? [filename] : this.getLogFiles().map(f => f.name);
            const stats = {
                totalFiles: files.length,
                totalSize: 0,
                entriesByLevel: {},
                entriesByType: {}
            };

            files.forEach(file => {
                const filePath = path.join(this.logDir, file);
                if (fs.existsSync(filePath)) {
                    const fileStats = fs.statSync(filePath);
                    stats.totalSize += fileStats.size;

                    // Quick scan of first 1000 lines for level distribution
                    const content = fs.readFileSync(filePath, 'utf8');
                    const lines = content.split('\n').slice(0, 1000);
                    
                    lines.forEach(line => {
                        const entry = this.parseLogLine(line, 0);
                        if (entry && entry.level) {
                            stats.entriesByLevel[entry.level] = (stats.entriesByLevel[entry.level] || 0) + 1;
                        }
                    });

                    const logType = this.getLogType(file);
                    stats.entriesByType[logType] = (stats.entriesByType[logType] || 0) + 1;
                }
            });

            return stats;
        } catch (error) {
            logError('Error getting log stats', error);
            return {
                totalFiles: 0,
                totalSize: 0,
                entriesByLevel: {},
                entriesByType: {}
            };
        }
    }

    /**
     * Gets failed email sends from logs
     * @param {number} limit - Maximum number of entries
     * @returns {Array} Failed email entries
     */
    getFailedSends(limit = 50) {
        try {
            const errorFiles = this.getLogFiles()
                .filter(file => file.type === 'error')
                .map(file => file.name);

            const failedSends = [];

            errorFiles.forEach(filename => {
                const result = this.readLogFile(filename, {
                    limit: 1000,
                    level: 'error',
                    search: 'SMTP'
                });

                result.entries.forEach(entry => {
                    if (entry.message && (
                        entry.message.includes('SMTP') ||
                        entry.message.includes('email') ||
                        entry.message.includes('forward')
                    )) {
                        failedSends.push({
                            ...entry,
                            logFile: filename
                        });
                    }
                });
            });

            // Sort by timestamp and limit
            failedSends.sort((a, b) => 
                new Date(b.timestamp) - new Date(a.timestamp)
            );

            return failedSends.slice(0, limit);
        } catch (error) {
            logError('Error getting failed sends', error);
            return [];
        }
    }
}

module.exports = LogService;

