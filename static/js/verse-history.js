class VerseHistory {
    constructor(translationEditor) {
        this.editor = translationEditor;
        this.currentTextId = null;
        this.currentVerseIndex = null;
        this.historyData = [];
    }
    
    async showHistory(textId, verseIndex) {
        this.currentTextId = textId;
        this.currentVerseIndex = verseIndex;
        
        try {
            const response = await fetch(
                `/project/${this.editor.projectId}/verse/${textId}/${verseIndex}/history`
            );
            
            if (!response.ok) throw new Error('Failed to load history');
            
            const data = await response.json();
            this.historyData = data.history;
            
            this.createModal();
        } catch (error) {
            console.error('Error loading history:', error);
            this.editor.showMessage?.('Failed to load edit history', 'error');
        }
    }
    
    createModal() {
        // Remove existing modal
        const existing = document.querySelector('.verse-history-modal');
        if (existing) existing.remove();
        
        const modal = document.createElement('div');
        modal.className = 'verse-history-modal fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = this.getModalHTML();
        
        // Event listeners
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
        });
        
        modal.querySelector('.close-history').addEventListener('click', () => this.closeModal());
        
        // Revert button listeners
        modal.querySelectorAll('.revert-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const editId = e.target.dataset.editId;
                this.revertToVersion(editId);
            });
        });
        
        document.body.appendChild(modal);
    }
    
    getModalHTML() {
        const verseRef = this.getVerseReference();
        
        return `
            <div class="bg-white rounded-lg max-w-4xl w-full max-h-[80vh] flex flex-col">
                <div class="flex justify-between items-center p-6 border-b">
                    <h2 class="text-xl font-bold text-gray-900">Edit History - ${verseRef}</h2>
                    <button class="close-history text-gray-400 hover:text-gray-600 text-2xl">×</button>
                </div>
                
                <div class="flex-1 overflow-y-auto p-6">
                    ${this.historyData.length === 0 ? this.getEmptyStateHTML() : this.getHistoryListHTML()}
                </div>
            </div>
        `;
    }
    
    getEmptyStateHTML() {
        return `
            <div class="text-center py-12">
                <div class="text-gray-400 text-6xl mb-4">📝</div>
                <h3 class="text-lg font-medium text-gray-900 mb-2">No Edit History</h3>
                <p class="text-gray-500">This verse hasn't been edited yet.</p>
            </div>
        `;
    }
    
    getHistoryListHTML() {
        return `
            <div class="space-y-4">
                ${this.historyData.map((edit, index) => this.getHistoryItemHTML(edit, index === 0)).join('')}
            </div>
        `;
    }
    
    getHistoryItemHTML(edit, isCurrent) {
        const editDate = new Date(edit.edited_at).toLocaleString();
        const isRevert = edit.edit_type === 'revert';
        const isAI = edit.edit_source === 'ai_translation';
        
        return `
            <div class="border rounded-lg p-4 ${isCurrent ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'}">
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-3">
                        <div class="flex items-center gap-2">
                            <span class="font-medium text-gray-900">${edit.edited_by}</span>
                            <span class="text-sm text-gray-500">${editDate}</span>
                        </div>
                        <div class="flex gap-2">
                            ${isCurrent ? '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">Current</span>' : ''}
                            ${isAI ? '<span class="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">AI</span>' : ''}
                            ${isRevert ? '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Revert</span>' : ''}
                            ${edit.confidence_score ? `<span class="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">${(edit.confidence_score * 100).toFixed(0)}%</span>` : ''}
                        </div>
                    </div>
                    ${!isCurrent ? `
                        <button class="revert-btn text-sm text-blue-600 hover:text-blue-800 font-medium" 
                                data-edit-id="${edit.id}">
                            Revert to this
                        </button>
                    ` : ''}
                </div>
                
                ${edit.comment ? `
                    <div class="text-sm text-gray-600 mb-3 italic">
                        "${edit.comment}"
                    </div>
                ` : ''}
                
                <div class="space-y-3">
                    ${edit.previous_text && edit.previous_text !== edit.new_text ? `
                        <div>
                            <div class="text-xs font-medium text-red-600 mb-1">Previous:</div>
                            <div class="text-sm text-red-700 bg-red-50 p-3 rounded border-l-2 border-red-200">
                                ${this.escapeHtml(edit.previous_text)}
                            </div>
                        </div>
                    ` : ''}
                    
                    <div>
                        <div class="text-xs font-medium text-green-600 mb-1">
                            ${edit.edit_type === 'create' ? 'Created:' : 'Updated to:'}
                        </div>
                        <div class="text-sm text-green-700 bg-green-50 p-3 rounded border-l-2 border-green-200">
                            ${this.escapeHtml(edit.new_text)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    async revertToVersion(editId) {
        if (!confirm('Are you sure you want to revert to this version? This will create a new edit entry.')) {
            return;
        }
        
        try {
            const response = await fetch(
                `/project/${this.editor.projectId}/verse/${this.currentTextId}/${this.currentVerseIndex}/revert`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ edit_id: editId })
                }
            );
            
            const data = await response.json();
            
            if (data.success) {
                // Refresh the verse in the editor
                await this.refreshVerseInEditor();
                
                // Close modal and show success
                this.closeModal();
                this.editor.showMessage?.('Verse reverted successfully', 'success');
            } else {
                throw new Error(data.error || 'Revert failed');
            }
        } catch (error) {
            console.error('Revert error:', error);
            this.editor.showMessage?.(error.message || 'Failed to revert verse', 'error');
        }
    }
    
    async refreshVerseInEditor() {
        // Find the textarea for this verse
        const textarea = document.querySelector(`textarea[data-verse-index="${this.currentVerseIndex}"]`);
        if (!textarea) return;
        
        try {
            // Get current verse content from server
            const response = await fetch(
                `/project/${this.editor.projectId}/translation/${this.editor.currentTranslation}/chapter/${this.editor.currentBook}/${this.editor.currentChapter}`
            );
            
            if (response.ok) {
                const data = await response.json();
                const verse = data.verses.find(v => v.index === this.currentVerseIndex);
                if (verse) {
                    textarea.value = verse.target_text;
                    // Remove from unsaved changes if it exists
                    this.editor.unsavedChanges?.delete(this.currentVerseIndex);
                    this.editor.updateSaveButtonState?.();
                }
            }
        } catch (error) {
            console.error('Error refreshing verse:', error);
        }
    }
    
    closeModal() {
        const modal = document.querySelector('.verse-history-modal');
        if (modal) modal.remove();
    }
    
    getVerseReference() {
        // Use existing verse reference system if available
        if (this.editor.currentBook && this.editor.currentChapter) {
            // Find the verse number from the current chapter data
            const verseNum = this.findVerseNumber(this.currentVerseIndex);
            return `${this.editor.currentBook} ${this.editor.currentChapter}:${verseNum}`;
        }
        return `Verse ${this.currentVerseIndex}`;
    }
    
    findVerseNumber(verseIndex) {
        // Try to find verse number from current chapter data
        if (this.editor.currentChapterVerses) {
            const verse = this.editor.currentChapterVerses.find(v => v.index === verseIndex);
            return verse ? verse.verse : verseIndex;
        }
        return verseIndex;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
} 