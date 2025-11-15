/**
 * Keywords page functionality
 */

let editingIndex = null;

async function loadKeywords() {
    try {
        const response = await API.getKeywords();
        const container = document.getElementById('keywordsContainer');
        
        if (response.success && response.data.keywordGroups.length > 0) {
            container.innerHTML = response.data.keywordGroups.map((group, index) => `
                <div class="card" style="margin-bottom: 1rem; background-color: var(--bg-color);">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                        <h4 style="margin: 0; color: var(--primary-color);">
                            ${escapeHtml(group.description || `Grup ${index + 1}`)}
                        </h4>
                        <div style="display: flex; gap: 0.5rem;">
                            <button class="btn btn-secondary" style="padding: 0.5rem 1rem; font-size: 0.875rem;" onclick="editGroup(${index})">Düzenle</button>
                            <button class="btn btn-danger" style="padding: 0.5rem 1rem; font-size: 0.875rem;" onclick="deleteGroup(${index})">Sil</button>
                        </div>
                    </div>
                    ${group.fromFilter ? `<div style="margin-bottom: 0.5rem;"><strong>Gönderen Filtresi:</strong> ${escapeHtml(group.fromFilter)}</div>` : ''}
                    ${group.subjectFilter ? `<div style="margin-bottom: 0.5rem;"><strong>Konu Filtresi:</strong> ${escapeHtml(group.subjectFilter)}</div>` : ''}
                    ${group.daysOfWeek ? `<div style="margin-bottom: 0.5rem;"><strong>Günler:</strong> ${group.daysOfWeek.map(d => ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'][d]).join(', ')}</div>` : ''}
                    ${group.timeRange ? `<div style="margin-bottom: 0.5rem;"><strong>Saat Aralığı:</strong> ${group.timeRange.start} - ${group.timeRange.end}</div>` : ''}
                    <div style="margin-bottom: 0.5rem;">
                        <strong>Anahtar Kelimeler:</strong>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
                            ${group.keywords.map(kw => {
                                const keyword = typeof kw === 'object' ? (kw.pattern || kw.keyword || '') : kw;
                                const isRegex = typeof kw === 'object' && (kw.regex || kw.isRegex);
                                return `<span class="badge badge-info">${escapeHtml(keyword)}${isRegex ? ' (regex)' : ''}</span>`;
                            }).join('')}
                        </div>
                    </div>
                    <div>
                        <strong>Alıcılar:</strong>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.5rem;">
                            ${group.recipients.map(recipient => 
                                `<span class="badge badge-success">${escapeHtml(recipient)}</span>`
                            ).join('')}
                        </div>
                    </div>
                </div>
            `).join('');
        } else {
            container.innerHTML = '<div class="loading-spinner">Henüz keyword grubu tanımlanmamış. "Yeni Grup Ekle" butonuna tıklayarak başlayın.</div>';
        }

        // Load default recipients
        const defaultRecipientsContainer = document.getElementById('defaultRecipients');
        if (response.success) {
            const recipients = response.data.defaultRecipients || [];
            defaultRecipientsContainer.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div style="display: flex; flex-wrap: wrap; gap: 0.5rem; flex: 1;">
                        ${recipients.length > 0 ? recipients.map(recipient => 
                            `<span class="badge badge-info">${escapeHtml(recipient)}</span>`
                        ).join('') : '<span style="color: var(--text-secondary);">Varsayılan alıcı tanımlanmamış</span>'}
                    </div>
                    <button class="btn btn-secondary" onclick="editDefaultRecipients()" style="padding: 0.5rem 1rem; font-size: 0.875rem;">Düzenle</button>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading keywords:', error);
        document.getElementById('keywordsContainer').innerHTML = 
            '<div class="alert alert-error">Keywords yüklenirken hata oluştu: ' + escapeHtml(error.message) + '</div>';
    }
}

async function reloadKeywords() {
    try {
        const button = event.target;
        const originalText = button.textContent;
        button.disabled = true;
        button.textContent = 'Yenileniyor...';
        
        await API.reloadConfig();
        await loadKeywords();
        
        showAlert('Keywords başarıyla yenilendi!', 'success');
        
        button.disabled = false;
        button.textContent = originalText;
    } catch (error) {
        console.error('Error reloading keywords:', error);
        showAlert('Keywords yenilenirken hata oluştu: ' + error.message, 'error');
        event.target.disabled = false;
    }
}

function escapeHtml(text) {
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

function showAddGroupForm() {
    editingIndex = null;
    document.getElementById('modalTitle').textContent = 'Yeni Keyword Grubu';
    document.getElementById('groupForm').reset();
    document.getElementById('groupIndex').value = '';
    document.querySelectorAll('.day-checkbox').forEach(cb => cb.checked = false);
    document.getElementById('groupModal').style.display = 'block';
}

function editGroup(index) {
    editingIndex = index;
    API.getKeywords().then(response => {
        if (response.success && response.data.keywordGroups[index]) {
            const group = response.data.keywordGroups[index];
            document.getElementById('modalTitle').textContent = 'Keyword Grubunu Düzenle';
            document.getElementById('groupDescription').value = group.description || '';
            document.getElementById('groupKeywords').value = group.keywords.map(kw => {
                if (typeof kw === 'object') {
                    return JSON.stringify(kw);
                }
                return kw;
            }).join('\n');
            document.getElementById('groupRecipients').value = group.recipients.join('\n');
            document.getElementById('groupFromFilter').value = group.fromFilter || '';
            document.getElementById('groupSubjectFilter').value = group.subjectFilter || '';
            document.getElementById('groupTimeStart').value = group.timeRange?.start || '';
            document.getElementById('groupTimeEnd').value = group.timeRange?.end || '';
            document.getElementById('groupIndex').value = index;
            
            // Set days of week
            document.querySelectorAll('.day-checkbox').forEach(cb => {
                cb.checked = group.daysOfWeek ? group.daysOfWeek.includes(parseInt(cb.value)) : false;
            });
            
            document.getElementById('groupModal').style.display = 'block';
        }
    });
}

function closeModal() {
    document.getElementById('groupModal').style.display = 'none';
    editingIndex = null;
}

async function saveGroup(event) {
    event.preventDefault();
    
    try {
        const description = document.getElementById('groupDescription').value.trim();
        const keywordsText = document.getElementById('groupKeywords').value.trim();
        const recipientsText = document.getElementById('groupRecipients').value.trim();
        const fromFilter = document.getElementById('groupFromFilter').value.trim() || null;
        const subjectFilter = document.getElementById('groupSubjectFilter').value.trim() || null;
        const timeStart = document.getElementById('groupTimeStart').value || null;
        const timeEnd = document.getElementById('groupTimeEnd').value || null;
        
        // Parse keywords
        const keywords = keywordsText.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
                // Try to parse as JSON (for regex patterns)
                try {
                    const parsed = JSON.parse(line);
                    if (parsed.pattern || parsed.keyword) {
                        return parsed;
                    }
                } catch (e) {
                    // Not JSON, treat as plain keyword
                }
                return line;
            });
        
        // Parse recipients
        const recipients = recipientsText.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        // Get selected days
        const daysOfWeek = Array.from(document.querySelectorAll('.day-checkbox:checked'))
            .map(cb => parseInt(cb.value));
        
        const group = {
            description,
            keywords,
            recipients,
            fromFilter,
            subjectFilter
        };
        
        if (daysOfWeek.length > 0) {
            group.daysOfWeek = daysOfWeek;
        }
        
        if (timeStart && timeEnd) {
            group.timeRange = {
                start: timeStart,
                end: timeEnd
            };
        }
        
        let response;
        if (editingIndex !== null) {
            response = await API.updateKeywordGroup(editingIndex, group);
        } else {
            response = await API.addKeywordGroup(group);
        }
        
        if (response.success) {
            showAlert('Keyword grubu başarıyla kaydedildi!', 'success');
            closeModal();
            await loadKeywords();
        } else {
            showAlert('Hata: ' + (response.error || 'Bilinmeyen hata'), 'error');
        }
    } catch (error) {
        console.error('Error saving group:', error);
        showAlert('Hata: ' + error.message, 'error');
    }
}

async function deleteGroup(index) {
    if (!confirm('Bu keyword grubunu silmek istediğinizden emin misiniz?')) {
        return;
    }
    
    try {
        const response = await API.deleteKeywordGroup(index);
        if (response.success) {
            showAlert('Keyword grubu başarıyla silindi!', 'success');
            await loadKeywords();
        } else {
            showAlert('Hata: ' + (response.error || 'Bilinmeyen hata'), 'error');
        }
    } catch (error) {
        console.error('Error deleting group:', error);
        showAlert('Hata: ' + error.message, 'error');
    }
}

function editDefaultRecipients() {
    API.getKeywords().then(response => {
        if (response.success) {
            const current = response.data.defaultRecipients || [];
            const newValue = prompt('Varsayılan alıcıları güncelleyin (her satıra bir e-posta):', current.join('\n'));
            if (newValue !== null) {
                const recipients = newValue.split('\n')
                    .map(line => line.trim())
                    .filter(line => line.length > 0);
                
                API.updateDefaultRecipients(recipients).then(result => {
                    if (result.success) {
                        showAlert('Varsayılan alıcılar güncellendi!', 'success');
                        loadKeywords();
                    } else {
                        showAlert('Hata: ' + (result.error || 'Bilinmeyen hata'), 'error');
                    }
                }).catch(error => {
                    showAlert('Hata: ' + error.message, 'error');
                });
            }
        }
    });
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('groupModal');
    if (event.target === modal) {
        closeModal();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadKeywords();
});

