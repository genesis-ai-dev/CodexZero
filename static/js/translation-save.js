// PERFORMANCE: Simplified Translation Save System
class TranslationSave {
    constructor(translationEditor) {
        console.log('🏗️  TranslationSave: Creating new instance');
        this.editor = translationEditor;
        
        // PERFORMANCE: Cache the save button element
        this.saveBtn = document.getElementById('save-changes-btn');
        
        // Track currently focused textarea for auto-save
        this.currentFocusedTextarea = null;
        // Add deduplication tracking
        this.recentSaves = new Map(); // verseIndex -> {text, timestamp}
        this.saveDelay = 300; // Back to 300ms since we fixed the root cause
        
        // Track save operations to prevent sync conflicts
        this.isCurrentlySaving = false;
        
        // Cleanup old entries every 5 minutes to prevent memory leaks
        setInterval(() => {
            this.cleanupOldSaves();
        }, 5 * 60 * 1000);
    }
    
    cleanupOldSaves() {
        const now = Date.now();
        const cutoff = now - (this.saveDelay * 10); // Keep entries for 10x the delay time
        
        for (const [verseIndex, saveInfo] of this.recentSaves.entries()) {
            if (saveInfo.timestamp < cutoff) {
                this.recentSaves.delete(verseIndex);
            }
        }
    }
    
    bufferVerseChange(verseIndex, text) {
        // PERFORMANCE: Direct update to editor's unsaved changes
        this.editor.unsavedChanges.set(verseIndex, text);
        this.editor.hasUnsavedChanges = true;
        
        // Check for recent duplicate save
        const recent = this.recentSaves.get(verseIndex);
        const now = Date.now();
        
        if (recent && recent.text === text && (now - recent.timestamp) < this.saveDelay) {
            console.log(`🚫 Skipping duplicate save for verse ${verseIndex} - same content saved ${now - recent.timestamp}ms ago`);
            return;
        }
        
        // DEBUGGING: Log which textarea this change is coming from
        const focusedWindow = this.currentFocusedTextarea ? this.getWindowForTextarea(this.currentFocusedTextarea) : null;
        console.log(`💾 Auto-saving verse ${verseIndex}: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);
        if (focusedWindow) {
            console.log(`💾 Change from window: ${focusedWindow.title} (${focusedWindow.type})`);
        }
        
        // Auto-save immediately when user moves between cells
        this.autoSaveVerse(verseIndex, text);
    }
    
    // Helper method to get window for textarea
    getWindowForTextarea(textarea) {
        for (const [id, window] of this.editor.textWindows) {
            if (window.element?.contains(textarea)) {
                return window;
            }
        }
        return null;
    }
    
    async autoSaveVerse(verseIndex, text) {
        // Find the target to save to
        const targetId = this.editor.currentTranslation || this.editor.primaryTextId;
        
        if (!targetId) {
            console.log('No target to save to for auto-save');
            return;
        }

        try {
            // Set saving flag to prevent sync conflicts
            this.isCurrentlySaving = true;
            
            // CRITICAL FIX: Use the currently focused textarea to determine the correct target,
            // not just any textarea with the same verse index
            let correctTargetId = targetId;
            const focusedTextarea = this.currentFocusedTextarea;
            
            if (focusedTextarea && parseInt(focusedTextarea.dataset.verseIndex) === verseIndex) {
                // Find which window contains the focused textarea
                for (const [id, window] of this.editor.textWindows) {
                    if (window.element?.contains(focusedTextarea)) {
                        correctTargetId = id;
                        console.log(`💾 Saving verse ${verseIndex} from focused textarea in window ${id}`);
                        break;
                    }
                }
            } else {
                // Fallback: if we don't have the focused textarea, find the textarea that matches the text content
                const textareas = document.querySelectorAll(`textarea[data-verse-index="${verseIndex}"]`);
                for (const textarea of textareas) {
                    if (textarea.value === text) {
                        // Find which window contains this textarea
                        for (const [id, window] of this.editor.textWindows) {
                            if (window.element?.contains(textarea)) {
                                correctTargetId = id;
                                console.log(`💾 Saving verse ${verseIndex} from matching content in window ${id}`);
                                break;
                            }
                        }
                        break;
                    }
                }
            }

            await this.saveVerse(verseIndex, text, correctTargetId);
            
            // Track this save to prevent duplicates
            this.recentSaves.set(verseIndex, {
                text: text,
                timestamp: Date.now()
            });
            
            // Remove from unsaved changes since it's now saved
            this.editor.unsavedChanges.delete(verseIndex);
            this.editor.hasUnsavedChanges = this.editor.unsavedChanges.size > 0;
            
            // Show subtle success indicator on the correct textarea
            if (focusedTextarea && parseInt(focusedTextarea.dataset.verseIndex) === verseIndex) {
                const originalBorder = focusedTextarea.style.borderColor;
                focusedTextarea.style.borderColor = '#10b981';
                setTimeout(() => {
                    focusedTextarea.style.borderColor = originalBorder;
                }, 500);
            }
            
        } catch (error) {
            console.error('Error in auto-save:', error);
        } finally {
            // Clear saving flag
            this.isCurrentlySaving = false;
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
        
        try {
            // Set saving flag to prevent sync conflicts
            this.isCurrentlySaving = true;
            
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = 'Saving...';
            }
            
            const savedVerses = new Set();
            const failedVerses = new Map();
            
            for (const [verseIndex, text] of this.editor.unsavedChanges.entries()) {
                try {
                    // CRITICAL FIX: Find the specific textarea that matches the text content for this verse
                    let correctTargetId = targetId;
                    const textareas = document.querySelectorAll(`textarea[data-verse-index="${verseIndex}"]`);
                    
                    for (const textarea of textareas) {
                        if (textarea.value === text) {
                            // Find which window contains this specific textarea
                            for (const [id, window] of this.editor.textWindows) {
                                if (window.element?.contains(textarea)) {
                                    correctTargetId = id;
                                    console.log(`💾 Bulk save: verse ${verseIndex} from window ${id}`);
                                    break;
                                }
                            }
                            break;
                        }
                    }
                    
                    await this.saveVerse(verseIndex, text, correctTargetId);
                    savedVerses.add(verseIndex);
                } catch (error) {
                    console.error(`Failed to save verse ${verseIndex}:`, error);
                    failedVerses.set(verseIndex, error.message);
                }
            }
            
            // Update unsaved changes - remove successfully saved verses
            for (const verseIndex of savedVerses) {
                this.editor.unsavedChanges.delete(verseIndex);
            }
            this.editor.hasUnsavedChanges = this.editor.unsavedChanges.size > 0;
            
            // Show results
            if (failedVerses.size > 0) {
                const failedList = Array.from(failedVerses.entries())
                    .map(([index, error]) => `Verse ${index}: ${error}`)
                    .join('\n');
                alert(`Some verses failed to save:\n\n${failedList}`);
            } else if (savedVerses.size > 0) {
                console.log(`✅ Successfully saved ${savedVerses.size} verse(s)`);
            }
            
        } catch (error) {
            console.error('Error in bulk save:', error);
            alert('Error saving changes: ' + error.message);
        } finally {
            // Clear saving flag and reset button
            this.isCurrentlySaving = false;
            
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = 'Save Changes';
            }
        }
    }
    
    async saveVerse(verseIndex, text, targetId = null, metadata = null) {
        const saveTargetId = targetId || this.editor.primaryTextId;
        
        if (!saveTargetId) {
            console.error('No target specified for saving verse', verseIndex);
            throw new Error('No target specified');
        }
        
        console.log(`📡 API call: Saving verse ${verseIndex} to ${saveTargetId}`, metadata ? `(${metadata.source})` : '(manual)');
        
        // DEBUGGING: Check if we're accidentally saving to a different window type than expected
        const targetWindow = this.editor.textWindows.get(saveTargetId);
        if (targetWindow) {
            console.log(`📡 Target window type: ${targetWindow.type}, title: ${targetWindow.title}`);
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
            
            console.log(`✅ Successfully saved verse ${verseIndex}`);

            // Add small delay to ensure database consistency before any events that might trigger reloads
            await new Promise(resolve => setTimeout(resolve, 100));

            // Dispatch verse-saved event with analysis if available
            if (data.analysis) {
                document.dispatchEvent(new CustomEvent('verse-saved', {
                    detail: {
                        verseIndex: verseIndex,
                        analysis: data.analysis,
                        targetId: saveTargetId
                    }
                }));
            }

            return data;
        } catch (error) {
            console.error(`❌ Failed to save verse ${verseIndex} to ${saveTargetId}:`, error);
            throw error;
        }
    }
}

// Make available globally
window.TranslationSave = TranslationSave; 