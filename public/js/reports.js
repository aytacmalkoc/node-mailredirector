/**
 * Reports page functionality
 */

async function generateDailyReport() {
    try {
        const button = event.target;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Oluşturuluyor...';
        
        const response = await API.generateDailyReport();
        const container = document.getElementById('reportResults');
        
        if (response.success) {
            container.innerHTML = `
                <div class="alert alert-success">
                    Günlük rapor başarıyla oluşturuldu ve gönderildi!
                </div>
                ${response.data && response.data.stats ? renderStats(response.data.stats, 'Günlük') : ''}
            `;
        } else {
            container.innerHTML = `
                <div class="alert alert-error">
                    Rapor oluşturulurken hata oluştu: ${escapeHtml(response.error || 'Bilinmeyen hata')}
                </div>
            `;
        }
        
        button.disabled = false;
        button.textContent = originalText;
    } catch (error) {
        console.error('Error generating daily report:', error);
        document.getElementById('reportResults').innerHTML = 
            '<div class="alert alert-error">Rapor oluşturulurken hata oluştu: ' + escapeHtml(error.message) + '</div>';
        event.target.disabled = false;
    }
}

async function generateWeeklyReport() {
    try {
        const button = event.target;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Oluşturuluyor...';
        
        const response = await API.generateWeeklyReport();
        const container = document.getElementById('reportResults');
        
        if (response.success) {
            container.innerHTML = `
                <div class="alert alert-success">
                    Haftalık rapor başarıyla oluşturuldu ve gönderildi!
                </div>
                ${response.data && response.data.stats ? renderStats(response.data.stats, 'Haftalık') : ''}
            `;
        } else {
            container.innerHTML = `
                <div class="alert alert-error">
                    Rapor oluşturulurken hata oluştu: ${escapeHtml(response.error || 'Bilinmeyen hata')}
                </div>
            `;
        }
        
        button.disabled = false;
        button.textContent = originalText;
    } catch (error) {
        console.error('Error generating weekly report:', error);
        document.getElementById('reportResults').innerHTML = 
            '<div class="alert alert-error">Rapor oluşturulurken hata oluştu: ' + escapeHtml(error.message) + '</div>';
        event.target.disabled = false;
    }
}

async function generateCustomReport() {
    try {
        const fromDate = document.getElementById('fromDate').value;
        const toDate = document.getElementById('toDate').value;
        
        if (!fromDate || !toDate) {
            showAlert('Lütfen başlangıç ve bitiş tarihlerini seçin', 'error');
            return;
        }
        
        if (new Date(fromDate) > new Date(toDate)) {
            showAlert('Başlangıç tarihi bitiş tarihinden sonra olamaz', 'error');
            return;
        }
        
        const button = event.target;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Oluşturuluyor...';
        
        const response = await API.getReportStats(fromDate, toDate);
        const container = document.getElementById('reportResults');
        
        if (response.success) {
            container.innerHTML = renderStats(response.data, 'Özel Tarih Aralığı');
        } else {
            container.innerHTML = `
                <div class="alert alert-error">
                    Rapor oluşturulurken hata oluştu: ${escapeHtml(response.error || 'Bilinmeyen hata')}
                </div>
            `;
        }
        
        button.disabled = false;
        button.textContent = originalText;
    } catch (error) {
        console.error('Error generating custom report:', error);
        document.getElementById('reportResults').innerHTML = 
            '<div class="alert alert-error">Rapor oluşturulurken hata oluştu: ' + escapeHtml(error.message) + '</div>';
        event.target.disabled = false;
    }
}

function renderStats(stats, reportType) {
    return `
        <div class="card" style="background-color: var(--bg-color);">
            <h4>${reportType} Rapor İstatistikleri</h4>
            <div class="stats-grid" style="margin-top: 1rem;">
                <div class="stat-card">
                    <div class="stat-icon">📊</div>
                    <div class="stat-content">
                        <div class="stat-value">${stats.totalProcessed || 0}</div>
                        <div class="stat-label">Toplam İşlenen</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">✅</div>
                    <div class="stat-content">
                        <div class="stat-value">${stats.totalForwarded || 0}</div>
                        <div class="stat-label">Yönlendirilen</div>
                    </div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⏭️</div>
                    <div class="stat-content">
                        <div class="stat-value">${stats.totalSkipped || 0}</div>
                        <div class="stat-label">Atlanan</div>
                    </div>
                </div>
                <div class="stat-card error">
                    <div class="stat-icon">❌</div>
                    <div class="stat-content">
                        <div class="stat-value">${stats.totalErrors || 0}</div>
                        <div class="stat-label">Hatalar</div>
                    </div>
                </div>
            </div>
            ${stats.topRecipients && stats.topRecipients.length > 0 ? `
                <div style="margin-top: 1.5rem;">
                    <h5>En Çok Yönlendirilen Alıcılar</h5>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
                        ${stats.topRecipients.map(recipient => 
                            `<span class="badge badge-info">${escapeHtml(recipient.email || recipient)}: ${recipient.count || 0}</span>`
                        ).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

async function loadSchedulerStatus() {
    try {
        const response = await API.getSchedulerStatus();
        const container = document.getElementById('schedulerStatus');
        
        if (response.success && response.data) {
            const scheduler = response.data;
            container.innerHTML = `
                <div class="status-item">
                    <span class="status-label">Durum:</span>
                    <span class="status-value">
                        <span class="status-indicator ${scheduler.isRunning ? 'success' : 'error'}"></span>
                        ${scheduler.isRunning ? 'Çalışıyor' : 'Durduruldu'}
                    </span>
                </div>
                <div style="margin-top: 1rem;">
                    <h4>Aktif İşler (${scheduler.activeJobs || 0})</h4>
                    ${scheduler.jobs && scheduler.jobs.length > 0 ? `
                        <div style="margin-top: 0.5rem;">
                            ${scheduler.jobs.map(job => `
                                <div class="status-item" style="margin-top: 0.5rem;">
                                    <span class="status-label">${escapeHtml(job.description || job.id)}:</span>
                                    <span class="status-value">${escapeHtml(job.schedule || 'N/A')}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : '<div class="loading-spinner">Zamanlanmış iş yok</div>'}
                </div>
            `;
        } else {
            container.innerHTML = '<div class="loading-spinner">Zamanlayıcı durumu yüklenemedi</div>';
        }
    } catch (error) {
        console.error('Error loading scheduler status:', error);
        document.getElementById('schedulerStatus').innerHTML = 
            '<div class="alert alert-error">Zamanlayıcı durumu yüklenirken hata oluştu: ' + escapeHtml(error.message) + '</div>';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showAlert(message, type = 'info') {
    const existing = document.querySelector('.alert');
    if (existing) existing.remove();
    
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    const container = document.querySelector('.container');
    container.insertBefore(alert, container.firstChild);
    
    setTimeout(() => {
        alert.remove();
    }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
    // Set default dates (today and 7 days ago)
    const today = new Date();
    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);
    
    document.getElementById('toDate').value = today.toISOString().split('T')[0];
    document.getElementById('fromDate').value = weekAgo.toISOString().split('T')[0];
    
    loadSchedulerStatus();
});

