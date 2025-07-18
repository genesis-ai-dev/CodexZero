// Advanced Language Server Client - Inline Text Highlighting
class AdvancedLanguageServer {
    constructor() {
        this.verseAnalyses = new Map(); // verseIndex -> analysis data
        this.enhancedTextareas = new Map(); // "windowId:verseIndex" -> {textarea, contentDiv, issues}
        this.windowSettings = new Map(); // windowId -> {enabled: boolean}
        console.log('🔤 AdvancedLanguageServer: Initialized');
    }
    
    // Check if language server should be enabled for this window
    isEnabledForWindow(windowId) {
        // Get window from translation editor
        const textWindow = window.translationEditor?.textWindows?.get(windowId);
        if (!textWindow) return false;
        
        // Check if we have a stored setting for this window
        if (this.windowSettings.has(windowId)) {
            return this.windowSettings.get(windowId).enabled;
        }
        
        // Default: enabled for primary windows, disabled for reference windows
        const defaultEnabled = textWindow.type === 'primary';
        this.windowSettings.set(windowId, { enabled: defaultEnabled });
        return defaultEnabled;
    }
    
    // Toggle language server for a specific window
    toggleWindow(windowId) {
        const currentSetting = this.windowSettings.get(windowId) || { enabled: false };
        const newEnabled = !currentSetting.enabled;
        
        this.windowSettings.set(windowId, { enabled: newEnabled });
        
        if (newEnabled) {
            // Re-analyze all verses in this window
            this.reanalyzeWindow(windowId);
        } else {
            // Clear all enhancements in this window
            this.clearWindowEnhancements(windowId);
        }
        
        // Update toggle button state
        this.updateToggleButton(windowId, newEnabled);
        
        console.log(`🔤 Language server ${newEnabled ? 'enabled' : 'disabled'} for window ${windowId}`);
        return newEnabled;
    }
    
    // Clear all enhancements in a specific window
    clearWindowEnhancements(windowId) {
        const textWindow = window.translationEditor?.textWindows?.get(windowId);
        if (!textWindow?.element) return;
        
        // Find all enhanced textareas in this window and clear them
        const keysToDelete = [];
        this.enhancedTextareas.forEach((enhancement, key) => {
            if (key.startsWith(`${windowId}:`)) {
                this.clearEnhancementByKey(key);
                keysToDelete.push(key);
            }
        });
        
        // Remove the keys from the map
        keysToDelete.forEach(key => this.enhancedTextareas.delete(key));
    }
    
    // Re-analyze all verses in a window
    reanalyzeWindow(windowId) {
        const textWindow = window.translationEditor?.textWindows?.get(windowId);
        if (!textWindow?.element) return;
        
        // Find all textareas in this window and re-analyze if they have content
        const textareas = textWindow.element.querySelectorAll('textarea[data-verse-index]');
        textareas.forEach(textarea => {
            const verseIndex = parseInt(textarea.dataset.verseIndex);
            if (!isNaN(verseIndex) && textarea.value?.trim()) {
                // Check if we have cached analysis for this verse
                const cachedAnalysis = this.verseAnalyses.get(verseIndex);
                if (cachedAnalysis && cachedAnalysis.substrings?.length > 0) {
                    this.enhanceTextareaSpecific(textarea, verseIndex, cachedAnalysis);
                }
            }
        });
    }
    
    // Refresh all toggle buttons after window re-rendering
    refreshToggleButtons() {
        if (!window.translationEditor?.textWindows) return;
        
        window.translationEditor.textWindows.forEach((textWindow, windowId) => {
            if (textWindow.element) {
                this.updateToggleButton(windowId, this.isEnabledForWindow(windowId));
            }
        });
    }
    
    // Update toggle button state in window header
    updateToggleButton(windowId, enabled) {
        const textWindow = window.translationEditor?.textWindows?.get(windowId);
        if (!textWindow?.element) return;
        
        const toggleBtn = textWindow.element.querySelector('.language-server-toggle');
        if (toggleBtn) {
            const icon = toggleBtn.querySelector('i');
            if (enabled) {
                icon.className = 'fas fa-spell-check text-xs text-blue-600';
                toggleBtn.classList.add('text-blue-600');
                toggleBtn.classList.remove('text-gray-400');
                toggleBtn.title = 'Language Server: ON - Click to disable';
            } else {
                icon.className = 'fas fa-spell-check text-xs';
                toggleBtn.classList.remove('text-blue-600');
                toggleBtn.classList.add('text-gray-400');
                toggleBtn.title = 'Language Server: OFF - Click to enable';
            }
        }
    }
    
    // Create toggle button for window header
    createToggleButton(windowId) {
        const isEnabled = this.isEnabledForWindow(windowId);
        
        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'language-server-toggle rounded p-1';
        toggleBtn.setAttribute('data-window-id', windowId);
        
        const icon = document.createElement('i');
        toggleBtn.appendChild(icon);
        
        // Set initial state
        this.updateToggleButton(windowId, isEnabled);
        
        // Add click handler
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleWindow(windowId);
        });
        
        return toggleBtn;
    }

    // Process verse data that comes with analysis (from initial load)
    processVerseWithAnalysis(verseData) {
        if (verseData.analysis && verseData.analysis.substrings && verseData.analysis.substrings.length > 0) {
            console.log(`🔤 Processing verse ${verseData.index} with ${verseData.analysis.substrings.length} issues`);
            this.verseAnalyses.set(verseData.index, verseData.analysis);
            
            // CRITICAL FIX: Only apply highlighting to textareas that have the exact same content
            // that the analysis was generated for. Don't apply to other windows with different content.
            setTimeout(() => {
                const textareas = document.querySelectorAll(`textarea[data-verse-index="${verseData.index}"]`);
                textareas.forEach(textarea => {
                    const windowId = this.getWindowIdForTextarea(textarea);
                    if (windowId && this.isEnabledForWindow(windowId)) {
                        // CRITICAL: Only apply analysis if the textarea content matches what was analyzed
                        const textareaContent = textarea.value || '';
                        const analyzedContent = verseData.target_text || '';
                        
                        if (textareaContent === analyzedContent) {
                            console.log(`🔤 Content matches for verse ${verseData.index} in window ${windowId}, applying analysis`);
                            this.enhanceTextareaSpecific(textarea, verseData.index, verseData.analysis);
                        } else {
                            console.log(`🔤 Content mismatch for verse ${verseData.index} in window ${windowId}, skipping analysis`);
                            console.log(`Textarea: "${textareaContent}"`);
                            console.log(`Analyzed: "${analyzedContent}"`);
                        }
                    }
                });
            }, 100);
        }
    }
    
    // Handle analysis from save operations
    handleAnalysis(verseIndex, analysis, targetId = null) {
        console.log(`🔤 Handling analysis for verse ${verseIndex} from targetId ${targetId}:`, analysis);
        
        if (!analysis?.substrings) {
            console.log('🔤 No analysis substrings found');
            this.clearEnhancement(verseIndex);
            return;
        }
        
        this.verseAnalyses.set(verseIndex, analysis);
        
        // CRITICAL FIX: Only apply analysis to textareas that belong to the specific targetId
        const textareas = document.querySelectorAll(`textarea[data-verse-index="${verseIndex}"]`);
        textareas.forEach(textarea => {
            const windowId = this.getWindowIdForTextarea(textarea);
            if (windowId && this.isEnabledForWindow(windowId)) {
                // Only apply to the specific window that was saved
                if (targetId && windowId === targetId) {
                    console.log(`🔤 Applying analysis to correct window ${windowId} for verse ${verseIndex}`);
                    this.enhanceTextareaSpecific(textarea, verseIndex, analysis);
                } else if (!targetId) {
                    // Fallback: if no targetId provided, apply to all (legacy behavior)
                    console.log(`🔤 No targetId provided, applying to window ${windowId} for verse ${verseIndex}`);
                    this.enhanceTextareaSpecific(textarea, verseIndex, analysis);
                } else {
                    console.log(`🔤 Skipping window ${windowId} (not target ${targetId}) for verse ${verseIndex}`);
                }
            }
        });
    }
    
    // Enhanced textarea for a specific textarea element
    enhanceTextareaSpecific(textarea, verseIndex, analysis) {
        const windowId = this.getWindowIdForTextarea(textarea);
        if (!windowId || !this.isEnabledForWindow(windowId)) {
            return;
        }
        
        const text = textarea.value;
        if (!text.trim()) {
            console.log(`🔤 No text to highlight in verse ${verseIndex} for window ${windowId}`);
            return;
        }
        
        console.log(`🔤 Enhancing specific textarea for verse ${verseIndex} in window ${windowId}`, analysis.substrings);
        
        // Clear any existing enhancement for this specific window and verse
        const enhancementKey = `${windowId}:${verseIndex}`;
        this.clearEnhancementByKey(enhancementKey);
        
        // Create enhanced contenteditable div
        this.createEnhancedTextareaForSpecific(textarea, verseIndex, analysis.substrings, text, windowId);
    }
    
    // Create enhanced textarea for a specific textarea (not using findTextarea)
    createEnhancedTextareaForSpecific(originalTextarea, verseIndex, issues, text, windowId) {
        // Create contenteditable div that looks and behaves like the textarea
        const contentDiv = document.createElement('div');
        contentDiv.contentEditable = true;
        contentDiv.className = originalTextarea.className;
        
        // Copy all styles from textarea
        const computedStyle = getComputedStyle(originalTextarea);
        contentDiv.style.cssText = `
            width: ${computedStyle.width};
            height: ${computedStyle.height};
            padding: ${computedStyle.padding};
            margin: ${computedStyle.margin};
            border: ${computedStyle.border};
            font-family: ${computedStyle.fontFamily};
            font-size: ${computedStyle.fontSize};
            line-height: ${computedStyle.lineHeight};
            font-weight: ${computedStyle.fontWeight};
            letter-spacing: ${computedStyle.letterSpacing};
            text-align: ${computedStyle.textAlign};
            background: ${computedStyle.background};
            color: ${computedStyle.color};
            resize: none;
            outline: none;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            min-height: ${computedStyle.minHeight};
        `;
        
        // Copy data attributes
        contentDiv.dataset.verse = originalTextarea.dataset.verse;
        contentDiv.dataset.verseIndex = originalTextarea.dataset.verseIndex;
        contentDiv.dataset.reference = originalTextarea.dataset.reference;
        
        // Sort issues by start position
        const sortedIssues = [...issues].sort((a, b) => a.start - b.start);
        
        // Create highlighted content
        let highlightedHtml = '';
        let lastIndex = 0;
        
        for (const issue of sortedIssues) {
            // Add text before issue
            highlightedHtml += this.escapeHtml(text.slice(lastIndex, issue.start));
            
            // Add highlighted issue
            const color = issue.color || '#ff6b6b';
            const issueDataSafe = btoa(JSON.stringify(issue));
            
            highlightedHtml += `<span class="language-issue" 
                data-issue-safe="${issueDataSafe}" 
                data-verse-index="${verseIndex}"
                style="
                    text-decoration: underline wavy ${color};
                    text-underline-offset: 3px;
                    cursor: pointer;
                    background-color: ${color}20;
                    border-radius: 2px;
                    padding: 1px 2px;
                    margin: 0 1px;
                "
                title="${this.escapeHtml(issue.message)}"
            >${this.escapeHtml(issue.substring)}</span>`;
            
            lastIndex = issue.end;
        }
        
        // Add remaining text
        highlightedHtml += this.escapeHtml(text.slice(lastIndex));
        
        contentDiv.innerHTML = highlightedHtml;
        
        // Replace textarea with contentDiv
        originalTextarea.style.display = 'none';
        originalTextarea.parentNode.insertBefore(contentDiv, originalTextarea.nextSibling);
        
        // Store references with window-specific key
        const enhancementKey = `${windowId}:${verseIndex}`;
        this.enhancedTextareas.set(enhancementKey, {
            textarea: originalTextarea,
            contentDiv: contentDiv,
            issues: issues
        });
        
        // Add event handlers
        this.addContentDivHandlers(contentDiv, originalTextarea, verseIndex);
        
        console.log(`✅ Enhanced specific textarea for verse ${verseIndex} in window ${windowId}`);
    }
    
    // Get window ID for a textarea
    getWindowIdForTextarea(textarea) {
        const windowElement = textarea.closest('[data-window-id]');
        return windowElement?.dataset.windowId;
    }

    // Replace textarea with enhanced contenteditable div
    enhanceTextarea(verseIndex, analysis) {
        const textarea = this.findTextarea(verseIndex);
        if (!textarea) {
            console.warn(`🔤 No textarea found for verse ${verseIndex}`);
            return;
        }
        
        // Check if language server is enabled for this window
        const windowId = this.getWindowIdForTextarea(textarea);
        if (!windowId || !this.isEnabledForWindow(windowId)) {
            console.log(`🔤 Language server disabled for window ${windowId}, skipping enhancement`);
            return;
        }
        
        const text = textarea.value;
        if (!text.trim()) {
            console.log(`🔤 No text to highlight in verse ${verseIndex}`);
            return;
        }
        
        console.log(`🔤 Enhancing textarea for verse ${verseIndex} in window ${windowId}`, analysis.substrings);
        
        // Clear any existing enhancement for this specific window and verse
        const enhancementKey = `${windowId}:${verseIndex}`;
        this.clearEnhancementByKey(enhancementKey);
        
        // Create enhanced contenteditable div
        this.createEnhancedTextarea(textarea, verseIndex, analysis.substrings, text);
    }
    
    createEnhancedTextarea(originalTextarea, verseIndex, issues, text) {
        // Create contenteditable div that looks and behaves like the textarea
        const contentDiv = document.createElement('div');
        contentDiv.contentEditable = true;
        contentDiv.className = originalTextarea.className;
        
        // Copy all styles from textarea
        const computedStyle = getComputedStyle(originalTextarea);
        contentDiv.style.cssText = `
            width: ${computedStyle.width};
            height: ${computedStyle.height};
            padding: ${computedStyle.padding};
            margin: ${computedStyle.margin};
            border: ${computedStyle.border};
            font-family: ${computedStyle.fontFamily};
            font-size: ${computedStyle.fontSize};
            line-height: ${computedStyle.lineHeight};
            font-weight: ${computedStyle.fontWeight};
            letter-spacing: ${computedStyle.letterSpacing};
            text-align: ${computedStyle.textAlign};
            background: ${computedStyle.background};
            color: ${computedStyle.color};
            resize: none;
            outline: none;
            overflow-y: auto;
            white-space: pre-wrap;
            word-wrap: break-word;
            min-height: ${computedStyle.minHeight};
        `;
        
        // Copy data attributes
        contentDiv.dataset.verse = originalTextarea.dataset.verse;
        contentDiv.dataset.verseIndex = originalTextarea.dataset.verseIndex;
        contentDiv.dataset.reference = originalTextarea.dataset.reference;
        
        // Sort issues by start position
        const sortedIssues = [...issues].sort((a, b) => a.start - b.start);
        
        // Create highlighted content
        let highlightedHtml = '';
        let lastIndex = 0;
        
        for (const issue of sortedIssues) {
            // Add text before issue
            highlightedHtml += this.escapeHtml(text.slice(lastIndex, issue.start));
            
            // Add highlighted issue
            const color = issue.color || '#ff6b6b';
            const issueDataSafe = btoa(JSON.stringify(issue));
            
            highlightedHtml += `<span class="language-issue" 
                data-issue-safe="${issueDataSafe}" 
                data-verse-index="${verseIndex}"
                style="
                    text-decoration: underline wavy ${color};
                    text-underline-offset: 3px;
                    cursor: pointer;
                    background-color: ${color}20;
                    border-radius: 2px;
                    padding: 1px 2px;
                    margin: 0 1px;
                "
                title="${this.escapeHtml(issue.message)}"
            >${this.escapeHtml(issue.substring)}</span>`;
            
            lastIndex = issue.end;
        }
        
        // Add remaining text
        highlightedHtml += this.escapeHtml(text.slice(lastIndex));
        
        contentDiv.innerHTML = highlightedHtml;
        
        // Replace textarea with contentDiv
        originalTextarea.style.display = 'none';
        originalTextarea.parentNode.insertBefore(contentDiv, originalTextarea.nextSibling);
        
        // Store references with window-specific key
        const windowId = this.getWindowIdForTextarea(originalTextarea);
        const enhancementKey = `${windowId}:${verseIndex}`;
        this.enhancedTextareas.set(enhancementKey, {
            textarea: originalTextarea,
            contentDiv: contentDiv,
            issues: issues
        });
        
        // Add event handlers
        this.addContentDivHandlers(contentDiv, originalTextarea, verseIndex);
        
        console.log(`✅ Enhanced textarea for verse ${verseIndex}`);
    }
    
    addContentDivHandlers(contentDiv, originalTextarea, verseIndex) {
        // Handle clicks on language issues
        contentDiv.addEventListener('click', (e) => {
            if (e.target.classList.contains('language-issue')) {
                e.preventDefault();
                const issueDataSafe = e.target.dataset.issueSafe;
                const issueData = JSON.parse(atob(issueDataSafe));
                this.showIssueModal(issueData, verseIndex, e.target);
            }
        });
        
        // Sync changes back to original textarea
        const syncToTextarea = () => {
            const plainText = contentDiv.textContent || contentDiv.innerText || '';
            originalTextarea.value = plainText;
            
            // Trigger input event on original textarea
            originalTextarea.dispatchEvent(new Event('input', { bubbles: true }));
        };
        
        contentDiv.addEventListener('input', syncToTextarea);
        contentDiv.addEventListener('blur', () => {
            syncToTextarea();
            // Trigger blur on original textarea for save functionality
            originalTextarea.dispatchEvent(new Event('blur', { bubbles: true }));
        });
        
        // Handle focus
        contentDiv.addEventListener('focus', () => {
            // Update the save system's focused textarea tracking
            if (window.translationEditor?.saveSystem) {
                window.translationEditor.saveSystem.currentFocusedTextarea = originalTextarea;
            }
            originalTextarea.dispatchEvent(new Event('focus', { bubbles: true }));
        });
        
        // Prevent contentDiv from losing focus when clicking issues
        contentDiv.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('language-issue')) {
                e.preventDefault();
            }
        });
    }
    
    clearEnhancement(verseIndex) {
        // Try to find the enhancement by checking all windows
        let foundKey = null;
        this.enhancedTextareas.forEach((enhancement, key) => {
            if (key.endsWith(`:${verseIndex}`)) {
                const textarea = this.findTextarea(verseIndex);
                if (textarea && enhancement.textarea === textarea) {
                    foundKey = key;
                }
            }
        });
        
        if (foundKey) {
            this.clearEnhancementByKey(foundKey);
        }
    }
    
    clearEnhancementByKey(enhancementKey) {
        const enhancement = this.enhancedTextareas.get(enhancementKey);
        if (enhancement) {
            enhancement.contentDiv.remove();
            enhancement.textarea.style.display = '';
            this.enhancedTextareas.delete(enhancementKey);
        }
    }
    
    showSimpleModal(word, verseIndex) {
        // Simple modal for when we only have the word
        const issue = {
            substring: word,
            type: 'spelling',
            message: `"${word}" not in dictionary`,
            color: '#ff6b6b'
        };
        this.showIssueModal(issue, verseIndex, null);
    }
    
    showIssueModal(issue, verseIndex, element) {
        // Create modal backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'language-issue-backdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        // Create modal
        const modal = document.createElement('div');
        modal.className = 'language-issue-modal';
        modal.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 24px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            max-width: 400px;
            min-width: 320px;
            position: relative;
        `;
        
        const color = issue.color || '#ff6b6b';
        
        modal.innerHTML = `
            <div style="margin-bottom: 16px;">
                <h3 style="margin: 0 0 8px 0; color: ${color}; font-size: 18px; font-weight: bold;">
                    ${this.capitalizeFirst(issue.type)} Issue
                </h3>
                <div style="background: #f8f9fa; padding: 8px 12px; border-radius: 4px; margin-bottom: 8px;">
                    <span style="font-weight: bold; color: ${color};">"${this.escapeHtml(issue.substring)}"</span>
                </div>
                <p style="margin: 0; color: #666; font-size: 14px;">${this.escapeHtml(issue.message)}</p>
            </div>
            
            <div style="display: flex; gap: 8px; justify-content: flex-end;">
                <button class="btn-secondary" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background: #f8f9fa; cursor: pointer;">
                    Ignore
                </button>
                <button class="btn-primary" style="padding: 8px 16px; border: 1px solid ${color}; border-radius: 4px; background: ${color}; color: white; cursor: pointer;">
                    Add to Dictionary
                </button>
            </div>
        `;
        
        // Add event handlers
        const ignoreBtn = modal.querySelector('.btn-secondary');
        const addBtn = modal.querySelector('.btn-primary');
        
        ignoreBtn.addEventListener('click', () => {
            backdrop.remove();
            // Could implement ignore functionality here
        });
        
        addBtn.addEventListener('click', async () => {
            await this.addWordToDictionary(issue.substring, verseIndex);
            backdrop.remove();
        });
        
        // Close on backdrop click
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                backdrop.remove();
            }
        });
        
        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);
    }
    
    async addWordToDictionary(word, verseIndex) {
        try {
            const projectId = window.translationEditor?.projectId;
            if (!projectId) {
                console.error('No project ID available');
                return;
            }
            
            const response = await fetch(`/project/${projectId}/language-server/dictionary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word: word })
            });
            
            if (response.ok) {
                console.log(`✅ Added "${word}" to dictionary`);
                
                // Remove the word from current analysis and refresh highlighting
                const analysis = this.verseAnalyses.get(verseIndex);
                if (analysis) {
                    analysis.substrings = analysis.substrings.filter(item => item.substring !== word);
                    this.enhanceTextarea(verseIndex, analysis);
                }
                
                // Show success message
                this.showToast(`Added "${word}" to dictionary`, 'success');
            } else {
                console.error(`Failed to add "${word}" to dictionary`);
                this.showToast('Failed to add word to dictionary', 'error');
            }
        } catch (error) {
            console.error('Error adding word to dictionary:', error);
            this.showToast('Error adding word to dictionary', 'error');
        }
    }
    
    findTextarea(verseIndex) {
        const selectors = [
            `textarea[data-verse-index="${verseIndex}"]`,
            `textarea[data-verse="${verseIndex}"]`,
            `[data-verse-index="${verseIndex}"] textarea`,
            `[data-verse="${verseIndex}"] textarea`
        ];
        
        for (const selector of selectors) {
            const textarea = document.querySelector(selector);
            if (textarea) {
                return textarea;
            }
        }
        
        return null;
    }
    
    // Utility functions
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    capitalizeFirst(str) {
        return str.charAt(0).toUpperCase() + str.slice(1);
    }
    
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#6b7280';
        
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 16px;
            border-radius: 6px;
            color: white;
            background: ${bgColor};
            z-index: 1001;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        toast.textContent = message;
        
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }
}

// Initialize global instance
window.languageServer = new AdvancedLanguageServer();

// Listen for save results
document.addEventListener('verse-saved', (event) => {
    console.log('🔤 Received verse-saved event:', event.detail);
    if (event.detail?.analysis) {
        window.languageServer.handleAnalysis(event.detail.verseIndex, event.detail.analysis, event.detail.targetId);
    }
});

// Process verses that come with analysis data from initial load
window.processVerseWithAnalysis = (verseData) => {
    window.languageServer.processVerseWithAnalysis(verseData);
};

console.log('🔤 Advanced Language Server ready'); 