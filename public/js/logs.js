/**
 * Logs page functionality
 */

let currentPage = 1;
let pageSize = 100;
let currentLevel = 'all';
let currentSearch = '';
let currentFilename = '';

async function loadLogFiles() {
    try {
        const response = await API.getLogFiles();
        const select = document.getElementById('logFileSelect');
        
        if (response.success && response.data.length > 0) {
            select.innerHTML = '<option value="">Tüm log dosyaları</option>' +
                response.data.map(file => 
                    `<option value="${escapeHtml(file.name)}">${escapeHtml(file.name)} (${file.type})</option>`
                ).join('');
        }
    } catch (error) {
        console.error('Error loading log files:', error);
    }
}

async function loadLogs() {
    try {
        const offset = (currentPage - 1) * pageSize;
        currentFilename = document.getElementById('logFileSelect').value;
        currentLevel = document.getElementById('levelSelect').value;
        
        const options = {
            limit: pageSize,
            offset: offset,
            level: currentLevel !== 'all' ? currentLevel : undefined,
            search: currentSearch || undefined,
            filename: currentFilename || undefined
        };
        
        const response = await API.getLogs(options);
        const container = document.getElementById('logsContainer');
        
        if (response.success && response.data.entries && response.data.entries.length > 0) {
            container.innerHTML = response.data.entries.map(entry => {
                const levelClass = entry.level ? entry.level.toLowerCase() : 'info';
                const levelColor = {
                    error: 'var(--error-color)',
                    warn: 'var(--warning-color)',
                    info: 'var(--info-color)',
                    debug: 'var(--text-secondary)'
                }[levelClass] || 'var(--text-primary)';
                
                return `
                    <div style="margin-bottom: 0.5rem; padding: 0.5rem; border-left: 3px solid ${levelColor}; background-color: white; border-radius: 4px;">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                            <span style="font-weight: 600; color: ${levelColor};">
                                [${entry.level || 'INFO'}] ${formatDate(entry.timestamp)}
                            </span>
                            ${entry.logFile ? `<span style="color: var(--text-secondary); font-size: 0.75rem;">${escapeHtml(entry.logFile)}</span>` : ''}
                        </div>
                        <div style="color: var(--text-primary);">
                            ${escapeHtml(entry.message || '')}
                        </div>
                        ${entry.meta ? `<div style="margin-top: 0.25rem; color: var(--text-secondary); font-size: 0.75rem;">
                            ${JSON.stringify(entry.meta, null, 2)}
                        </div>` : ''}
                    </div>
                `;
            }).join('');
            
            // Update pagination
            const total = response.data.total || 0;
            document.getElementById('totalCount').textContent = `Toplam: ${total} kayıt`;
            document.getElementById('currentPage').textContent = currentPage;
            document.getElementById('prevBtn').disabled = currentPage === 1;
            document.getElementById('nextBtn').disabled = !response.data.hasMore;
        } else {
            container.innerHTML = '<div class="loading-spinner">Log kaydı bulunamadı</div>';
        }
    } catch (error) {
        console.error('Error loading logs:', error);
        document.getElementById('logsContainer').innerHTML = 
            '<div class="alert alert-error">Loglar yüklenirken hata oluştu: ' + escapeHtml(error.message) + '</div>';
    }
}

function handleSearch() {
    currentSearch = document.getElementById('searchInput').value;
    currentPage = 1;
    loadLogs();
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        loadLogs();
    }
}

function nextPage() {
    currentPage++;
    loadLogs();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return 'Bilinmeyen';
    const date = new Date(dateString);
    return date.toLocaleString('tr-TR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadLogFiles();
    loadLogs();
});

