// PERFORMANCE: Simplified Purpose Management - inline utility functions
class PurposeManager {
    static setupPurposeListeners(container) {
        if (!container) return;
        
        // PERFORMANCE: Use single delegated event listener instead of multiple listeners
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.save-purpose-btn, .save-translation-purpose-btn');
            if (!btn) return;
            
            const isTranslation = btn.classList.contains('save-translation-purpose-btn');
            const id = btn.getAttribute(isTranslation ? 'data-translation-id' : 'data-file-id');
            const inputClass = isTranslation ? '.translation-purpose-input' : '.purpose-input';
            const inputSelector = `${inputClass}[data-${isTranslation ? 'translation' : 'file'}-id="${id}"]`;
            const purposeInput = container.querySelector(inputSelector);
            
            if (purposeInput) {
                this.savePurpose(id, purposeInput, btn, isTranslation ? 'translation' : 'file');
            }
        });
        
        // PERFORMANCE: Use single delegated input listener
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
            
            // PERFORMANCE: Direct style assignment
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
        
        // PERFORMANCE: Direct style assignment for visual feedback
        purposeInput.style.cssText = 'opacity: 0.6; pointer-events: none;';
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Saving...';
        
        try {
            // PERFORMANCE: Inline endpoint logic instead of separate method
            const isTranslation = type === 'translation' || id.startsWith('text_');
            const numericId = isTranslation ? id.toString().replace('text_', '') : id;
            const url = isTranslation 
                ? `/project/${projectId}/texts/${numericId}/purpose`
                : `/project/${projectId}/files/${id}/purpose`;
            const requestBody = isTranslation
                ? { description: purposeDescription }
                : { purpose_description: purposeDescription, file_purpose: purposeDescription ? 'custom' : null };
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            
            if (data.success) {
                // PERFORMANCE: Direct style assignment for success
                purposeInput.style.cssText = 'border-color: #10b981;';
                button.innerHTML = '<i class="fas fa-check mr-1"></i>Saved!';
                
                setTimeout(() => {
                    purposeInput.style.cssText = '';
                    button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
                }, 2000);
            } else {
                throw new Error(data.error || 'Save failed');
            }
        } catch (error) {
            alert('Failed to save purpose: ' + error.message);
            purposeInput.style.cssText = 'border-color: #ef4444;';
            button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
        } finally {
            purposeInput.style.pointerEvents = '';
            purposeInput.style.opacity = '';
            button.disabled = false;
        }
    }
}

// Make available globally
window.PurposeManager = PurposeManager; 