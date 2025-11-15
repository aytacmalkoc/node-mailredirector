/**
 * API Client for Mail Redirector
 */
const API = {
    baseURL: '', // Same origin

    /**
     * Make API request
     */
    async request(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}`);
            }
            
            return data;
        } catch (error) {
            console.error('API Request failed:', error);
            throw error;
        }
    },

    /**
     * GET request
     */
    async get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },

    /**
     * POST request
     */
    async post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    /**
     * PUT request
     */
    async put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    },

    /**
     * DELETE request
     */
    async delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    },

    // Health check
    async getHealth() {
        return this.get('/api/health');
    },

    // Status
    async getStatus() {
        return this.get('/api/status');
    },

    // Keywords
    async getKeywords() {
        return this.get('/api/keywords');
    },

    // Processed emails
    async getProcessedEmails(limit = 50, offset = 0) {
        return this.get(`/api/emails/processed?limit=${limit}&offset=${offset}`);
    },

    // Database stats
    async getDatabaseStats() {
        return this.get('/api/database/stats');
    },

    // Logs
    async getLogs(options = {}) {
        const params = new URLSearchParams();
        if (options.limit) params.append('limit', options.limit);
        if (options.offset) params.append('offset', options.offset);
        if (options.level) params.append('level', options.level);
        if (options.search) params.append('search', options.search);
        if (options.fromDate) params.append('fromDate', options.fromDate);
        if (options.toDate) params.append('toDate', options.toDate);
        if (options.filename) params.append('filename', options.filename);
        
        return this.get(`/api/logs?${params.toString()}`);
    },

    async getLogFiles() {
        return this.get('/api/logs/files');
    },

    async getLogStats(filename = null) {
        const url = filename ? `/api/logs/stats?filename=${filename}` : '/api/logs/stats';
        return this.get(url);
    },

    async getFailedSends(limit = 50) {
        return this.get(`/api/logs/failed-sends?limit=${limit}`);
    },

    // Reports
    async generateDailyReport() {
        return this.post('/api/reports/daily');
    },

    async generateWeeklyReport() {
        return this.post('/api/reports/weekly');
    },

    async getReportStats(fromDate, toDate) {
        return this.get(`/api/reports/stats?fromDate=${fromDate}&toDate=${toDate}`);
    },

    async getSchedulerStatus() {
        return this.get('/api/reports/scheduler');
    },

    // Config
    async reloadConfig() {
        return this.post('/api/config/reload');
    },

    // Keywords CRUD
    async addKeywordGroup(group) {
        return this.post('/api/keywords/groups', group);
    },

    async updateKeywordGroup(index, group) {
        return this.put(`/api/keywords/groups/${index}`, group);
    },

    async deleteKeywordGroup(index) {
        return this.delete(`/api/keywords/groups/${index}`);
    },

    async updateDefaultRecipients(recipients) {
        return this.put('/api/keywords/default-recipients', { recipients });
    }
};

