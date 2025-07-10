// Translation Save System
class TranslationSave {
    constructor(translationEditor) {
        this.editor = translationEditor;
        this.setupAutoSave();
        this.setupPageUnloadWarning();
    }
    
    setupPageUnloadWarning() {
        window.addEventListener('beforeunload', (e) => {
            if (this.editor.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        });
    }
    
    setupAutoSave() {
        setInterval(async () => {
            if (this.editor.hasUnsavedChanges) {
                try {
                    await this.saveAllChanges();
                } catch (error) {
                    console.error('Auto-save failed:', error);
                }
            }
        }, 30000);
    }
    
    bufferVerseChange(verseIndex, text) {
        if (verseIndex !== null && verseIndex !== undefined && !isNaN(verseIndex)) {
            // Find the textarea to check if it's in test mode
            const textarea = document.querySelector(`textarea[data-verse-index="${verseIndex}"]`);
            const hasExistingContent = textarea?.value?.trim();
            
            // Don't buffer changes if this appears to be test mode
            if (hasExistingContent && textarea?.style.borderColor === '#3b82f6') {
                console.log('Skipping buffer for potential test mode verse:', verseIndex);
                return;
            }
            
            this.editor.unsavedChanges.set(verseIndex, text);
            this.editor.hasUnsavedChanges = this.editor.unsavedChanges.size > 0;
            this.updateSaveButtonState();
        }
    }
    
    updateSaveButtonState() {
        const saveBtn = document.getElementById('save-changes-btn');
        
        if (!saveBtn) return;
        
        const changeCount = this.editor.unsavedChanges.size;
        const hasChanges = this.editor.hasUnsavedChanges && changeCount > 0;
        
        // Update save button
        saveBtn.disabled = !hasChanges;
        saveBtn.textContent = hasChanges ? `SAVE CHANGES (${changeCount})` : 'NO CHANGES TO SAVE';
        
        const styles = hasChanges ? 
            { background: '#dcfce7', color: '#166534', borderColor: '#166534' } :
            { background: '#e5e5e5', color: '#2d2d2d', borderColor: '#2d2d2d' };
            
        Object.assign(saveBtn.style, styles);
    }
    
    async saveAllChanges() {
        // Get the target to save to - prioritize currentTranslation, fallback to primaryTextId
        const targetId = this.editor.currentTranslation || this.editor.primaryTextId;
        
        if (!targetId || this.editor.unsavedChanges.size === 0) {
            console.log('No target to save to or no unsaved changes');
            return;
        }
        
        const saveBtn = document.getElementById('save-changes-btn');
        
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
        }
        
        const savedVerses = new Set();
        const failedVerses = new Map();
        
        for (const [verseIndex, text] of this.editor.unsavedChanges.entries()) {
            try {
                // Find the textarea for this verse index to determine correct target
                const textarea = document.querySelector(`textarea[data-verse-index="${verseIndex}"]`);
                let correctTargetId = targetId;
                
                if (textarea && !correctTargetId) {
                    // Find which window contains this textarea
                    for (const [id, window] of this.editor.textWindows) {
                        if (window.element?.contains(textarea)) {
                            correctTargetId = id;
                            break;
                        }
                    }
                }
                
                await this.saveVerse(verseIndex, text, correctTargetId);
                savedVerses.add(verseIndex);
            } catch (error) {
                failedVerses.set(verseIndex, error.message);
                console.error(`Failed to save verse ${verseIndex}:`, error);
            }
        }
        
        // Remove successfully saved verses from unsaved changes
        for (const verseIndex of savedVerses) {
            this.editor.unsavedChanges.delete(verseIndex);
        }
        
        this.editor.hasUnsavedChanges = this.editor.unsavedChanges.size > 0;
        this.updateSaveButtonState();
        
        if (savedVerses.size > 0) {
            // Refresh metadata for successful saves
            await this.editor.refreshTextMetadata();
            this.editor.saveLayoutState();
        }
        
        // Show appropriate feedback
        if (failedVerses.size === 0) {
            // All successful
            if (saveBtn) {
                saveBtn.textContent = 'Saved!';
                setTimeout(() => this.updateSaveButtonState(), 2000);
            }
        } else if (savedVerses.size > 0) {
            // Partial success
            if (saveBtn) {
                saveBtn.textContent = `${savedVerses.size} Saved, ${failedVerses.size} Failed`;
                saveBtn.disabled = false;
            }
        } else {
            // All failed
            if (saveBtn) {
                saveBtn.textContent = 'Save Failed - Retry';
                saveBtn.disabled = false;
            }
        }
    }
    
    async saveVerse(verseIndex, text, targetId = null) {
        const saveTargetId = targetId || this.editor.primaryTextId;
        
        if (!saveTargetId) {
            console.error('No target specified for saving verse', verseIndex);
            throw new Error('No target specified');
        }
        
        try {
            const response = await fetch(`/project/${this.editor.projectId}/translation/${saveTargetId}/verse/${verseIndex}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            if (!data.success) {
                throw new Error(data.error || 'Save failed');
            }
            
            return data;
        } catch (error) {
            console.error(`Failed to save verse ${verseIndex} to ${saveTargetId}:`, error);
            throw error;
        }
    }
}

// Make available globally
window.TranslationSave = TranslationSave; 