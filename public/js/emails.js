/**
 * Emails page functionality
 */

let currentPage = 1;
let pageSize = 50;
let currentFilter = 'all';
let currentSearch = '';

async function loadEmails() {
    try {
        const offset = (currentPage - 1) * pageSize;
        const response = await API.getProcessedEmails(pageSize, offset);
        const tbody = document.getElementById('emailsTableBody');
        
        if (response.success && response.data && response.data.emails && response.data.emails.length > 0) {
            let emails = response.data.emails;
            
            // Apply filter
            if (currentFilter !== 'all') {
                emails = emails.filter(email => {
                    if (currentFilter === 'forwarded') return email.forwarded === 1;
                    if (currentFilter === 'skipped') return email.forwarded === 0 && !email.error_message;
                    if (currentFilter === 'error') return email.error_message;
                    return true;
                });
            }
            
            // Apply search
            if (currentSearch) {
                const searchLower = currentSearch.toLowerCase();
                emails = emails.filter(email => 
                    (email.subject && email.subject.toLowerCase().includes(searchLower)) ||
                    (email.from && email.from.toLowerCase().includes(searchLower))
                );
            }
            
            tbody.innerHTML = emails.map(email => {
                // forward_recipients should already be parsed by API, but handle both cases
                let recipients = [];
                if (email.forward_recipients) {
                    if (Array.isArray(email.forward_recipients)) {
                        recipients = email.forward_recipients;
                    } else if (typeof email.forward_recipients === 'string') {
                        try {
                            recipients = JSON.parse(email.forward_recipients);
                        } catch (e) {
                            console.warn('Error parsing recipients:', e);
                            recipients = [];
                        }
                    }
                }
                
                const statusBadge = email.forwarded === 1 ? 
                    '<span class="badge badge-success">Yönlendirildi</span>' :
                    email.error_message ?
                    '<span class="badge badge-error">Hata</span>' :
                    '<span class="badge badge-warning">Atlandı</span>';
                
                return `
                    <tr>
                        <td>${formatDate(email.processed_at)}</td>
                        <td>${escapeHtml(email.from || 'Bilinmeyen')}</td>
                        <td>${escapeHtml(email.subject || 'Konu yok')}</td>
                        <td>${statusBadge}</td>
                        <td>
                            ${recipients.length > 0 ? 
                                recipients.map(r => `<span class="badge badge-info" style="margin-right: 0.25rem;">${escapeHtml(r)}</span>`).join('') :
                                '-'
                            }
                        </td>
                    </tr>
                `;
            }).join('');
            
            // Update pagination
            const total = response.data ? (response.data.total || emails.length) : emails.length;
            document.getElementById('totalCount').textContent = `Toplam: ${total}`;
            document.getElementById('currentPage').textContent = currentPage;
            document.getElementById('prevBtn').disabled = currentPage === 1;
            const hasMore = response.data ? (response.data.hasMore || false) : (emails.length >= pageSize);
            document.getElementById('nextBtn').disabled = !hasMore;
        } else {
            tbody.innerHTML = '<tr><td colspan="5" class="loading-spinner">Henüz e-posta işlenmemiş</td></tr>';
            document.getElementById('totalCount').textContent = 'Toplam: 0';
            document.getElementById('prevBtn').disabled = true;
            document.getElementById('nextBtn').disabled = true;
        }
    } catch (error) {
        console.error('Error loading emails:', error);
        document.getElementById('emailsTableBody').innerHTML = 
            '<tr><td colspan="5" class="alert alert-error">E-postalar yüklenirken hata oluştu: ' + escapeHtml(error.message) + '</td></tr>';
    }
}

function handleSearch() {
    currentSearch = document.getElementById('searchInput').value;
    currentPage = 1;
    loadEmails();
}

function previousPage() {
    if (currentPage > 1) {
        currentPage--;
        loadEmails();
    }
}

function nextPage() {
    currentPage++;
    loadEmails();
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
    return date.toLocaleDateString('tr-TR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

document.addEventListener('DOMContentLoaded', () => {
    pageSize = parseInt(document.getElementById('pageSize').value);
    currentFilter = document.getElementById('filterSelect').value;
    loadEmails();
});

