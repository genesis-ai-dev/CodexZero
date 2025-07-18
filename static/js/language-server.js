class LanguageServerManager {
    constructor(projectId) {
        this.projectId = projectId;
        this.cache = new Map(); // Cache analysis results
        this.activeAnalyses = new Set(); // Track ongoing analyses
        this.enabled = true;
        
        // Default color for suggestions when none specified
        this.defaultColor = '#ff6b6b';
    }
    
    /**
     * Analyze a verse and highlight issues
     */
    async analyzeVerse(textId, verseIndex, textarea = null) {
        if (!this.enabled) return;
        
        const cacheKey = `${textId}:${verseIndex}`;
        
        // Check cache first
        if (this.cache.has(cacheKey)) {
            const cachedResult = this.cache.get(cacheKey);
            this.highlightIssues(textarea, cachedResult.analysis);
            return cachedResult;
        }
        
        // Avoid duplicate requests
        if (this.activeAnalyses.has(cacheKey)) {
            return;
        }
        
        this.activeAnalyses.add(cacheKey);
        
        try {
            const response = await fetch(`/project/${this.projectId}/language-server/analyze/${textId}/${verseIndex}`);
            const data = await response.json();
            
            if (data.success) {
                // Cache the result
                this.cache.set(cacheKey, data);
                
                // Highlight issues if textarea provided
                if (textarea) {
                    this.highlightIssues(textarea, data.analysis);
                }
                
                return data;
            } else {
                console.error('Language server analysis failed:', data.error);
            }
        } catch (error) {
            console.error('Error analyzing verse:', error);
        } finally {
            this.activeAnalyses.delete(cacheKey);
        }
    }
    
    /**
     * Highlight issues in a textarea
     */
    highlightIssues(textarea, analysis) {
        if (!textarea || !analysis || !analysis.suggestions || analysis.suggestions.length === 0) {
            this.clearHighlights(textarea);
            return;
        }
        
        // Store original styling
        if (!textarea.dataset.originalBackground) {
            textarea.dataset.originalBackground = textarea.style.backgroundColor || '';
        }
        
        // Create overlay for highlights
        this.createHighlightOverlay(textarea, analysis.suggestions);
        
        // Add issue count indicator
        this.updateIssueIndicator(textarea, analysis.statistics);
    }
    
    /**
     * Create highlight overlay for textarea
     */
    createHighlightOverlay(textarea, issues) {
        // Remove existing overlay
        const existingOverlay = textarea.parentNode.querySelector('.language-server-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
        
        if (issues.length === 0) return;
        
        // Create overlay container
        const overlay = document.createElement('div');
        overlay.className = 'language-server-overlay';
        overlay.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: none;
            font-family: ${window.getComputedStyle(textarea).fontFamily};
            font-size: ${window.getComputedStyle(textarea).fontSize};
            line-height: ${window.getComputedStyle(textarea).lineHeight};
            padding: ${window.getComputedStyle(textarea).padding};
            border: ${window.getComputedStyle(textarea).borderWidth} solid transparent;
            white-space: pre-wrap;
            word-wrap: break-word;
            overflow: hidden;
            z-index: 1;
        `;
        
        // Make textarea container relative for positioning
        const container = textarea.parentNode;
        if (window.getComputedStyle(container).position === 'static') {
            container.style.position = 'relative';
        }
        
        // Create highlighted text
        const text = textarea.value;
        let highlightedText = '';
        let lastIndex = 0;
        
        // Sort issues by start position
        const sortedIssues = [...issues].sort((a, b) => a.start - b.start);
        
        for (const issue of sortedIssues) {
            // Add text before issue
            highlightedText += this.escapeHtml(text.slice(lastIndex, issue.start));
            
            // Add highlighted issue
            const color = issue.color || this.defaultColor;
            highlightedText += `<span class="language-suggestion" data-suggestion='${JSON.stringify(issue)}' style="background-color: ${color}33; border-bottom: 2px solid ${color};">${this.escapeHtml(issue.substring)}</span>`;
            
            lastIndex = issue.end;
        }
        
        // Add remaining text
        highlightedText += this.escapeHtml(text.slice(lastIndex));
        
        overlay.innerHTML = highlightedText;
        container.appendChild(overlay);
        
        // Add click handlers for issues
        this.addIssueClickHandlers(overlay);
    }
    
    /**
     * Add click handlers for language issues
     */
    addIssueClickHandlers(overlay) {
        const suggestions = overlay.querySelectorAll('.language-suggestion');
        
        suggestions.forEach(suggestionElement => {
            suggestionElement.style.cursor = 'pointer';
            suggestionElement.style.pointerEvents = 'auto';
            
            suggestionElement.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                try {
                    const suggestionData = JSON.parse(suggestionElement.dataset.suggestion);
                    this.showSuggestionModal(suggestionData, suggestionElement);
                } catch (error) {
                    console.error('Error parsing suggestion data:', error);
                }
            });
            
            // Add hover effect
            suggestionElement.addEventListener('mouseenter', () => {
                suggestionElement.style.opacity = '0.8';
            });
            
            suggestionElement.addEventListener('mouseleave', () => {
                suggestionElement.style.opacity = '1';
            });
        });
    }
    
    /**
     * Show modal for issue actions
     */
    showSuggestionModal(suggestion, element) {
        // Remove existing modal
        const existingModal = document.querySelector('.language-suggestion-modal');
        if (existingModal) {
            existingModal.remove();
        }
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'language-suggestion-modal';
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            max-width: 400px;
            min-width: 300px;
        `;
        
        // Modal content
        let alternativesHtml = '';
        if (suggestion.alternatives && suggestion.alternatives.length > 0) {
            alternativesHtml = `
                <div style="margin: 10px 0;">
                    <strong>Suggestions:</strong>
                    <div style="margin-top: 5px;">
                        ${suggestion.alternatives.map(alt => 
                            `<button class="suggestion-btn" data-suggestion="${this.escapeHtml(alt)}" style="margin: 2px; padding: 4px 8px; border: 1px solid #ddd; border-radius: 4px; background: #f9f9f9; cursor: pointer;">${this.escapeHtml(alt)}</button>`
                        ).join('')}
                    </div>
                </div>
            `;
        }
        
        modal.innerHTML = `
            <div style="margin-bottom: 15px;">
                <h3 style="margin: 0 0 10px 0; color: ${suggestion.color || this.defaultColor};">
                    Suggestion
                </h3>
                <p style="margin: 0; color: #666; font-style: italic;">"${this.escapeHtml(suggestion.substring)}"</p>
                <p style="margin: 5px 0 0 0; font-size: 14px;">${this.escapeHtml(suggestion.message)}</p>
            </div>
            
            ${alternativesHtml}
            
            <div style="margin-top: 15px; text-align: right;">
                ${suggestion.actions.includes('ignore') ? '<button class="action-btn" data-action="ignore" style="margin-left: 5px; padding: 6px 12px; border: 1px solid #ddd; border-radius: 4px; background: #f5f5f5; cursor: pointer;">Ignore</button>' : ''}
                ${suggestion.actions.includes('add_to_dictionary') ? '<button class="action-btn" data-action="add_to_dictionary" style="margin-left: 5px; padding: 6px 12px; border: 1px solid #007bff; border-radius: 4px; background: #007bff; color: white; cursor: pointer;">Add to Dictionary</button>' : ''}
                <button class="close-modal" style="margin-left: 5px; padding: 6px 12px; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer;">Close</button>
            </div>
        `;
        
        // Add backdrop
        const backdrop = document.createElement('div');
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 999;
        `;
        
        document.body.appendChild(backdrop);
        document.body.appendChild(modal);
        
        // Event handlers
        modal.querySelector('.close-modal').addEventListener('click', () => {
            modal.remove();
            backdrop.remove();
        });
        
        backdrop.addEventListener('click', () => {
            modal.remove();
            backdrop.remove();
        });
        
        // Suggestion button handlers
        modal.querySelectorAll('.suggestion-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const suggestion = btn.dataset.suggestion;
                this.applySuggestion(issue, suggestion);
                modal.remove();
                backdrop.remove();
            });
        });
        
        // Action button handlers
        modal.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const action = btn.dataset.action;
                await this.executeAction(issue, action);
                modal.remove();
                backdrop.remove();
            });
        });
    }
    
    /**
     * Apply a suggestion to the text
     */
    applySuggestion(issue, suggestion) {
        const textarea = this.findTextareaForIssue(issue);
        if (!textarea) return;
        
        const text = textarea.value;
        const newText = text.slice(0, issue.start) + suggestion + text.slice(issue.end);
        
        textarea.value = newText;
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        
        // Clear highlights and re-analyze
        this.clearCache();
        setTimeout(() => {
            this.analyzeVerse(this.getCurrentTextId(), this.getCurrentVerseIndex(textarea), textarea);
        }, 100);
    }
    
    /**
     * Execute an action (ignore, add to dictionary, etc.)
     */
    async executeAction(issue, action) {
        try {
            // Remove highlighting immediately
            this.removeSuggestionHighlighting(issue);

            const response = await fetch(`/project/${this.projectId}/language-server/action`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: action,
                    text_id: this.getCurrentTextId(),
                    verse_index: this.getCurrentVerseIndex(),
                    substring: issue.substring,
                    category: 'user'
                })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showToast(data.message || `Action "${action}" completed`, 'success');
            } else {
                this.showToast(data.error || 'Action failed', 'error');
            }
        } catch (error) {
            console.error('Error executing action:', error);
            this.showToast('Error executing action', 'error');
        }
    }

    /**
     * Remove highlighting for a specific suggestion
     */
    removeSuggestionHighlighting(issue) {
        const textarea = this.findTextareaForIssue(issue);
        if (!textarea) return;

        const overlay = textarea.parentNode.querySelector('.language-server-overlay');
        if (!overlay) return;

        // Find and remove the specific suggestion span
        const suggestionSpans = overlay.querySelectorAll('.language-suggestion');
        suggestionSpans.forEach(span => {
            try {
                const suggestionData = JSON.parse(span.dataset.suggestion);
                if (suggestionData.substring === issue.substring && 
                    suggestionData.start === issue.start) {
                    // Replace the highlighted span with plain text
                    const textNode = document.createTextNode(suggestionData.substring);
                    span.parentNode.replaceChild(textNode, span);
                }
            } catch (error) {
                console.error('Error parsing suggestion data:', error);
            }
        });
    }
    
    /**
     * Clear highlights from textarea
     */
    clearHighlights(textarea) {
        if (!textarea) return;
        
        const overlay = textarea.parentNode.querySelector('.language-server-overlay');
        if (overlay) {
            overlay.remove();
        }
        
        const indicator = textarea.parentNode.querySelector('.issue-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
    
    /**
     * Update issue count indicator
     */
    updateIssueIndicator(textarea, statistics) {
        // Remove existing indicator
        const existingIndicator = textarea.parentNode.querySelector('.issue-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        if (!statistics || statistics.total_issues === 0) return;
        
        // Create indicator
        const indicator = document.createElement('div');
        indicator.className = 'issue-indicator';
        indicator.style.cssText = `
            position: absolute;
            top: 5px;
            right: 5px;
            background: #ff6b6b;
            color: white;
            border-radius: 10px;
            padding: 2px 6px;
            font-size: 11px;
            font-weight: bold;
            z-index: 2;
            pointer-events: none;
        `;
        indicator.textContent = statistics.total_issues;
        indicator.title = `${statistics.total_issues} language issues found`;
        
        textarea.parentNode.appendChild(indicator);
    }
    
    /**
     * Utility functions
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    findTextareaForIssue(issue) {
        // Try to find the current textarea - this would need to be adapted
        // based on your specific UI structure
        return document.querySelector('textarea[data-verse-index]:focus') || 
               document.querySelector('textarea[data-verse-index]');
    }
    
    getCurrentTextId() {
        // This would need to be implemented based on your UI
        return window.translationEditor?.currentTranslation || window.translationEditor?.primaryTextId;
    }
    
    getCurrentVerseIndex(textarea = null) {
        // This would need to be implemented based on your UI
        if (textarea && textarea.dataset.verseIndex) {
            return parseInt(textarea.dataset.verseIndex);
        }
        return 0;
    }
    
    clearCache() {
        this.cache.clear();
    }
    
    showToast(message, type = 'info') {
        // Simple toast notification
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 4px;
            color: white;
            z-index: 1001;
            font-size: 14px;
            background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#6c757d'};
        `;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
    
    /**
     * Enable/disable the language server
     */
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            // Clear all highlights
            document.querySelectorAll('.language-server-overlay').forEach(overlay => overlay.remove());
            document.querySelectorAll('.issue-indicator').forEach(indicator => indicator.remove());
        }
    }
}

// Global instance
window.LanguageServerManager = LanguageServerManager; 