// Translation Save System
class TranslationSave {
    constructor(translationEditor) {
        this.editor = translationEditor;
        this.setupAutoSave();
        this.setupPageUnloadWarning();
    }
    
    setupPageUnloadWarning() {
        // Warn user about unsaved changes when leaving the page
        window.addEventListener('beforeunload', (e) => {
            if (this.editor.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
    }
    
    setupAutoSave() {
        // Auto-save every 30 seconds if there are unsaved changes
        setInterval(async () => {
            if (this.editor.hasUnsavedChanges) {
                try {
                    await this.saveAllChanges();
                    console.log('Auto-saved changes');
                } catch (error) {
                    console.error('Auto-save failed:', error);
                }
            }
        }, 30000); // 30 seconds
    }
    
    bufferVerseChange(verseIndex, text) {
        // Only buffer if the verse index is valid
        if (verseIndex !== null && verseIndex !== undefined && !isNaN(verseIndex)) {
            this.editor.unsavedChanges.set(verseIndex, text);
            this.editor.hasUnsavedChanges = this.editor.unsavedChanges.size > 0;
            this.updateSaveButtonState();
        }
    }
    
    updateSaveButtonState() {
        const saveBtn = document.getElementById('save-changes-btn');
        const mobileSaveBtn = document.getElementById('mobile-save-button');
        
        if (!saveBtn && !mobileSaveBtn) return;
        
        const changeCount = this.editor.unsavedChanges.size;
        const hasChanges = this.editor.hasUnsavedChanges && changeCount > 0;
        
        // Update desktop save button
        if (saveBtn) {
            saveBtn.disabled = !hasChanges;
            saveBtn.textContent = hasChanges ? `SAVE CHANGES (${changeCount})` : 'NO CHANGES TO SAVE';
            
            const styles = hasChanges ? 
                { background: '#dcfce7', color: '#166534', borderColor: '#166534' } :
                { background: '#e5e5e5', color: '#2d2d2d', borderColor: '#2d2d2d' };
                
            Object.assign(saveBtn.style, styles);
        }
        
        // Update mobile save button
        if (mobileSaveBtn) {
            mobileSaveBtn.disabled = !hasChanges;
            if (hasChanges) {
                mobileSaveBtn.classList.add('has-changes');
                mobileSaveBtn.innerHTML = `<i class="fas fa-save mr-2"></i> Save (${changeCount})`;
            } else {
                mobileSaveBtn.classList.remove('has-changes');
                mobileSaveBtn.innerHTML = '<i class="fas fa-save mr-2"></i> Save';
            }
        }
    }
    
    async saveAllChanges() {
        // Get the target to save to - prioritize currentTranslation, fallback to primaryTextId
        const targetId = this.editor.currentTranslation || this.editor.primaryTextId;
        
        if (!targetId || this.editor.unsavedChanges.size === 0) {
            console.log('No target to save to or no unsaved changes');
            return;
        }
        
        const saveBtn = document.getElementById('save-changes-btn');
        const mobileSaveBtn = document.getElementById('mobile-save-button');
        
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }
        if (mobileSaveBtn) {
            mobileSaveBtn.disabled = true;
            mobileSaveBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> Saving...';
        }
        
        try {
            const promises = Array.from(this.editor.unsavedChanges.entries()).map(([verseIndex, text]) => 
                this.saveVerse(verseIndex, text, targetId)
            );
            
            await Promise.all(promises);
            
            this.editor.unsavedChanges.clear();
            this.editor.hasUnsavedChanges = false;
            this.updateSaveButtonState();
            
            // Refresh text metadata after saving to update progress
            await this.editor.refreshTextMetadata();
            
            // Save layout state after successful save to ensure progress is reflected
            this.editor.saveLayoutState();
            
            // Show success feedback
            if (saveBtn) {
                saveBtn.textContent = 'Saved!';
                setTimeout(() => this.updateSaveButtonState(), 2000);
            }
            if (mobileSaveBtn) {
                mobileSaveBtn.innerHTML = '<i class="fas fa-check mr-2"></i> Saved!';
                setTimeout(() => this.updateSaveButtonState(), 2000);
            }
        } catch (error) {
            console.error('Error saving changes:', error);
            if (saveBtn) {
                saveBtn.textContent = 'Save Failed - Retry';
                saveBtn.disabled = false;
            }
            if (mobileSaveBtn) {
                mobileSaveBtn.innerHTML = '<i class="fas fa-exclamation-triangle mr-2"></i> Retry';
                mobileSaveBtn.disabled = false;
            }
        }
    }
    
    async saveVerse(verseIndex, text, targetId = null) {
        // Use provided targetId, or fallback to currentTranslation or primaryTextId
        const saveTargetId = targetId || this.editor.currentTranslation || this.editor.primaryTextId;
        
        if (!saveTargetId) {
            console.error('No target specified for saving verse');
            return;
        }
        
        const response = await fetch(`/project/${this.editor.projectId}/translation/${saveTargetId}/verse/${verseIndex}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                text: text
            })
        });
        
        const data = await response.json();
        return data;
    }
}

// Make available globally
window.TranslationSave = TranslationSave; 