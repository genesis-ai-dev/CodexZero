// Purpose Management Utility - Unified handling for files and translations
class PurposeManager {
    static setupPurposeListeners(container) {
        if (!container) return;
        
        container.addEventListener('click', (e) => {
            if (e.target.closest('.save-purpose-btn')) {
                const btn = e.target.closest('.save-purpose-btn');
                const fileId = btn.getAttribute('data-file-id');
                const purposeInput = container.querySelector(`.purpose-input[data-file-id="${fileId}"]`);
                if (purposeInput) {
                    this.savePurpose(fileId, purposeInput, btn, 'file');
                }
            } else if (e.target.closest('.save-translation-purpose-btn')) {
                const btn = e.target.closest('.save-translation-purpose-btn');
                const translationId = btn.getAttribute('data-translation-id');
                const purposeInput = container.querySelector(`.translation-purpose-input[data-translation-id="${translationId}"]`);
                if (purposeInput) {
                    this.savePurpose(translationId, purposeInput, btn, 'translation');
                }
            }
        });
        
        container.addEventListener('input', (e) => {
            if (e.target.classList.contains('purpose-input') || e.target.classList.contains('translation-purpose-input')) {
                this.updateCharCounter(e.target);
            }
        });
    }
    
    static updateCharCounter(input) {
        const isTranslation = input.classList.contains('translation-purpose-input');
        const counterClass = isTranslation ? '.translation-char-counter' : '.char-counter';
        const charCounter = input.parentElement.querySelector(counterClass);
        
        if (charCounter) {
            const length = input.value.length;
            charCounter.textContent = `${length}/1,000`;
            
            if (length > 1000) {
                charCounter.style.color = '#dc2626';
                input.style.borderColor = '#dc2626';
            } else {
                charCounter.style.color = '#6b7280';
                input.style.borderColor = '';
            }
        }
    }
    
    static async savePurpose(id, purposeInput, button, type) {
        const purposeDescription = purposeInput.value.trim();
        
        if (purposeDescription.length > 1000) {
            alert('Purpose description must be 1000 characters or less');
            return;
        }
        
        const projectId = window.location.pathname.split('/')[2];
        
        // Visual feedback
        purposeInput.style.opacity = '0.6';
        purposeInput.disabled = true;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Saving...';
        
        try {
            const { url, requestBody } = this.getPurposeEndpoint(projectId, id, purposeDescription, type);
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showSuccess(purposeInput, button);
            } else {
                this.showError(purposeInput, button, data.error);
            }
        } catch (error) {
            this.showError(purposeInput, button, error.message);
        } finally {
            purposeInput.style.opacity = '';
            purposeInput.disabled = false;
            button.disabled = false;
        }
    }
    
    static getPurposeEndpoint(projectId, id, description, type) {
        if (type === 'translation' || id.startsWith('text_')) {
            return {
                url: `/project/${projectId}/texts/${id}/purpose`,
                requestBody: { description }
            };
        } else {
            return {
                url: `/project/${projectId}/files/${id}/purpose`,
                requestBody: { 
                    purpose_description: description,
                    file_purpose: description ? 'custom' : null
                }
            };
        }
    }
    
    static showSuccess(purposeInput, button) {
        purposeInput.style.borderColor = '#10b981';
        button.innerHTML = '<i class="fas fa-check mr-1"></i>Saved!';
        
        setTimeout(() => {
            purposeInput.style.borderColor = '';
            button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
        }, 2000);
    }
    
    static showError(purposeInput, button, errorMessage) {
        alert('Failed to save purpose: ' + (errorMessage || 'Unknown error'));
        purposeInput.style.borderColor = '#ef4444';
        button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
    }
}

// Make available globally
window.PurposeManager = PurposeManager; 