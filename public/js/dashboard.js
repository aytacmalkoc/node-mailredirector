/**
 * Dashboard functionality
 */

// Update status indicator
function updateStatusIndicator(elementId, isConnected, message) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.innerHTML = `
        <span class="status-indicator ${isConnected ? 'success' : 'error'}"></span>
        ${message}
    `;
}

// Load dashboard data
async function loadDashboard() {
    try {
        // Load status
        const statusResponse = await API.getStatus();
        if (statusResponse.success) {
            const status = statusResponse.data;
            
            // Update system status
            const imapConnected = status.imap && status.imap.isConnected === true;
            updateStatusIndicator('imapStatus', imapConnected, 
                imapConnected ? 'Bağlı' : 'Bağlı Değil');
            
            const smtpConnected = status.smtp && status.smtp.isConnected === true;
            updateStatusIndicator('smtpStatus', smtpConnected, 
                smtpConnected ? 'Bağlı' : 'Bağlı Değil');
            
            const dbInitialized = status.database && status.database.isInitialized === true;
            updateStatusIndicator('dbStatus', dbInitialized, 
                dbInitialized ? 'Aktif' : 'Pasif');
            
            const keywordsLoaded = status.keywords && status.keywords.loaded === true;
            const keywordsTotal = status.keywords ? (status.keywords.total || 0) : 0;
            updateStatusIndicator('keywordsStatus', keywordsLoaded, 
                keywordsLoaded ? `${keywordsTotal} kelime yüklü` : 'Yüklenmedi');
        } else {
            // If status request failed, show error
            updateStatusIndicator('imapStatus', false, 'Durum alınamadı');
            updateStatusIndicator('smtpStatus', false, 'Durum alınamadı');
            updateStatusIndicator('dbStatus', false, 'Durum alınamadı');
            updateStatusIndicator('keywordsStatus', false, 'Durum alınamadı');
        }

        // Load database stats
        const statsResponse = await API.getDatabaseStats();
        if (statsResponse.success) {
            const stats = statsResponse.data;
            document.getElementById('totalProcessed').textContent = stats.totalProcessed || 0;
            document.getElementById('totalForwarded').textContent = stats.totalForwarded || 0;
            document.getElementById('totalSkipped').textContent = stats.totalSkipped || 0;
            document.getElementById('totalErrors').textContent = stats.totalErrors || 0;
        }

        // Load recent activity
        await loadRecentActivity();
    } catch (error) {
        console.error('Error loading dashboard:', error);
        showAlert('Dashboard verileri yüklenirken hata oluştu: ' + error.message, 'error');
    }
}

// Load recent activity
async function loadRecentActivity() {
    try {
        const response = await API.getProcessedEmails(10, 0);
        const container = document.getElementById('recentActivity');
        
        if (response.success && response.data.emails.length > 0) {
            container.innerHTML = response.data.emails.map(email => `
                <div class="activity-item">
                    <div class="activity-info">
                        <strong>${escapeHtml(email.subject || 'Konu yok')}</strong>
                        <div style="font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.25rem;">
                            ${escapeHtml(email.from || 'Bilinmeyen gönderen')}
                        </div>
                    </div>
                    <div class="activity-time">
                        ${formatDate(email.processed_at)}
                        ${email.forwarded ? '<span class="badge badge-success" style="margin-left: 0.5rem;">Yönlendirildi</span>' : 
                          '<span class="badge badge-warning" style="margin-left: 0.5rem;">Atlandı</span>'}
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="loading-spinner">Henüz aktivite yok</div>';
        }
    } catch (error) {
        console.error('Error loading recent activity:', error);
        document.getElementById('recentActivity').innerHTML = 
            '<div class="loading-spinner">Aktivite yüklenirken hata oluştu</div>';
    }
}

// Generate daily report
async function generateDailyReport() {
    try {
        const button = event.target;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Oluşturuluyor...';
        
        const response = await API.generateDailyReport();
        
        if (response.success) {
            showAlert('Günlük rapor başarıyla oluşturuldu ve gönderildi!', 'success');
        } else {
            showAlert('Rapor oluşturulurken hata oluştu: ' + (response.error || 'Bilinmeyen hata'), 'error');
        }
        
        button.disabled = false;
        button.textContent = originalText;
    } catch (error) {
        console.error('Error generating daily report:', error);
        showAlert('Rapor oluşturulurken hata oluştu: ' + error.message, 'error');
        event.target.disabled = false;
    }
}

// Reload config
async function reloadConfig() {
    try {
        const button = event.target;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Yenileniyor...';
        
        const response = await API.reloadConfig();
        
        if (response.success) {
            showAlert('Yapılandırma başarıyla yenilendi!', 'success');
            // Reload dashboard after a short delay
            setTimeout(() => {
                loadDashboard();
            }, 1000);
        } else {
            showAlert('Yapılandırma yenilenirken hata oluştu: ' + (response.error || 'Bilinmeyen hata'), 'error');
        }
        
        button.disabled = false;
        button.textContent = originalText;
    } catch (error) {
        console.error('Error reloading config:', error);
        showAlert('Yapılandırma yenilenirken hata oluştu: ' + error.message, 'error');
        event.target.disabled = false;
    }
}

// Utility functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return 'Bilinmeyen';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Az önce';
    if (minutes < 60) return `${minutes} dakika önce`;
    if (hours < 24) return `${hours} saat önce`;
    if (days < 7) return `${days} gün önce`;
    
    return date.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showAlert(message, type = 'info') {
    // Remove existing alerts
    const existing = document.querySelector('.alert');
    if (existing) existing.remove();
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    const container = document.querySelector('.container');
    container.insertBefore(alert, container.firstChild);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

// Initialize dashboard on load
document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    // Refresh every 30 seconds
    setInterval(loadDashboard, 30000);
});

