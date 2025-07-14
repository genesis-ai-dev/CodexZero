// PERFORMANCE: Simplified Translation Save System
class TranslationSave {
    constructor(translationEditor) {
        this.editor = translationEditor;
        
        // PERFORMANCE: Cache the save button element
        this.saveBtn = document.getElementById('save-changes-btn');
        
        // Track currently focused textarea for auto-save
        this.currentFocusedTextarea = null;
    }
    
    bufferVerseChange(verseIndex, text) {
        // PERFORMANCE: Direct update to editor's unsaved changes
        this.editor.unsavedChanges.set(verseIndex, text);
        this.editor.hasUnsavedChanges = true;
        
        // PERFORMANCE: Simple save button update
        this.updateSaveButtonState();
        
        // Auto-save immediately when user moves between cells
        this.autoSaveVerse(verseIndex, text);
    }
    
    async autoSaveVerse(verseIndex, text) {
        // Find the target to save to
        const targetId = this.editor.currentTranslation || this.editor.primaryTextId;
        
        if (!targetId) {
            console.log('No target to save to for auto-save');
            return;
        }
        
        try {
            // Find the textarea for this verse to determine correct target
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
            
            // Remove from unsaved changes since it's now saved
            this.editor.unsavedChanges.delete(verseIndex);
            this.editor.hasUnsavedChanges = this.editor.unsavedChanges.size > 0;
            this.updateSaveButtonState();
            
            // Show subtle success indicator
            if (textarea) {
                const originalBorder = textarea.style.borderColor;
                textarea.style.borderColor = '#10b981';
                setTimeout(() => {
                    textarea.style.borderColor = originalBorder;
                }, 500);
            }
            
        } catch (error) {
            console.error(`Auto-save failed for verse ${verseIndex}:`, error);
            // Keep in unsaved changes on error
        }
    }
    
    updateSaveButtonState() {
        // PERFORMANCE: Use cached button element
        if (this.saveBtn) {
            const hasChanges = this.editor.unsavedChanges.size > 0;
            this.saveBtn.disabled = !hasChanges;
            if (hasChanges) {
                this.saveBtn.textContent = `Save ${this.editor.unsavedChanges.size} Changes`;
            } else {
                this.saveBtn.textContent = 'Auto-Saved';
            }
        }
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
        // Auto-save now happens immediately on focus changes
        // Also save when clicking outside of textareas
        document.addEventListener('click', (e) => {
            // If clicking outside any textarea, save the currently focused one
            if (!e.target.closest('textarea') && this.currentFocusedTextarea) {
                const prevTextarea = this.currentFocusedTextarea;
                const prevVerseIndex = parseInt(prevTextarea.dataset.verseIndex);
                const prevValue = prevTextarea.value || '';
                
                if (!isNaN(prevVerseIndex)) {
                    this.bufferVerseChange(prevVerseIndex, prevValue);
                }
                
                this.currentFocusedTextarea = null;
            }
        });
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
    
    async saveVerse(verseIndex, text, targetId = null, metadata = null) {
        const saveTargetId = targetId || this.editor.primaryTextId;
        
        if (!saveTargetId) {
            console.error('No target specified for saving verse', verseIndex);
            throw new Error('No target specified');
        }
        
        try {
            const requestBody = {
                text: text,
                source: metadata?.source || 'manual',
                confidence: metadata?.confidence || null,
                comment: metadata?.comment || null
            };
            
            const response = await fetch(`/project/${this.editor.projectId}/translation/${saveTargetId}/verse/${verseIndex}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
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