// Advanced Language Server Client - Inline Text Highlighting
class AdvancedLanguageServer {
    constructor() {
        this.verseAnalyses = new Map(); // verseIndex -> analysis data
        this.enhancedTextareas = new Map(); // "windowId:verseIndex" -> {textarea, contentDiv, issues}
        this.windowSettings = new Map(); // windowId -> {enabled: boolean}
        this.analysisTimeouts = new Map(); // verseIndex -> timeout ID
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
                if (cachedAnalysis && cachedAnalysis.suggestions?.length > 0) {
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
                    if (verseData.analysis && verseData.analysis.suggestions && verseData.analysis.suggestions.length > 0) {
                console.log(`🔤 Processing verse ${verseData.index} with ${verseData.analysis.suggestions.length} suggestions`);
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
        
        if (!analysis?.suggestions) {
            console.log('🔤 No analysis suggestions found');
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
    
    // Enhanced textarea for a specific textarea element using overlay approach
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
        
        console.log(`🔤 Enhancing specific textarea for verse ${verseIndex} in window ${windowId}`, analysis.suggestions);
        
        // Clear any existing enhancement for this specific window and verse
        const enhancementKey = `${windowId}:${verseIndex}`;
        this.clearEnhancementByKey(enhancementKey);
        
        // Create highlight overlay instead of replacing textarea
        this.createHighlightOverlay(textarea, verseIndex, analysis.suggestions, windowId);
    }
    
    // Create highlight overlay that doesn't interfere with original textarea
    createHighlightOverlay(originalTextarea, verseIndex, issues, windowId) {
        // BACK TO CONTENTEDITABLE BUT WITH PROPER AUTO-SAVE SYNC
        const text = originalTextarea.value;
        
        // Create contenteditable div that looks like the textarea
        const contentDiv = document.createElement('div');
        contentDiv.contentEditable = true;
        contentDiv.className = originalTextarea.className;
        
        // Copy styles from textarea
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
            box-sizing: border-box;
        `;
        
        // Copy direction and unicode-bidi properties for RTL support
        if (originalTextarea.dir) {
            contentDiv.dir = originalTextarea.dir;
            contentDiv.style.direction = originalTextarea.style.direction || computedStyle.direction;
            contentDiv.style.unicodeBidi = originalTextarea.style.unicodeBidi || computedStyle.unicodeBidi;
        }
        
        // Create highlighted HTML
        let highlightedHtml = '';
        let lastIndex = 0;
        const sortedIssues = [...issues].sort((a, b) => a.start - b.start);
        
        for (const issue of sortedIssues) {
            highlightedHtml += this.escapeHtml(text.slice(lastIndex, issue.start));
            
            const color = issue.color || '#ff6b6b';
            const suggestionDataSafe = btoa(JSON.stringify(issue));
            
            highlightedHtml += `<span class="language-suggestion" 
                data-suggestion-safe="${suggestionDataSafe}" 
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
        highlightedHtml += this.escapeHtml(text.slice(lastIndex));
        
        contentDiv.innerHTML = highlightedHtml;
        
        // Hide original textarea and insert contentDiv
        originalTextarea.style.display = 'none';
        originalTextarea.parentNode.insertBefore(contentDiv, originalTextarea.nextSibling);
        
        // FIXED SYNC: Proper bidirectional sync with auto-save compatibility
        this.setupProperSync(contentDiv, originalTextarea, verseIndex);
        
        // Store references
        const enhancementKey = `${windowId}:${verseIndex}`;
        this.enhancedTextareas.set(enhancementKey, {
            textarea: originalTextarea,
            contentDiv: contentDiv,
            issues: issues
        });
        
        console.log(`✅ Enhanced textarea for verse ${verseIndex} in window ${windowId} with ${issues.length} suggestions`);
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
        
        console.log(`🔤 Enhancing textarea for verse ${verseIndex} in window ${windowId}`, analysis.suggestions);
        
        // Clear any existing enhancement for this specific window and verse
        const enhancementKey = `${windowId}:${verseIndex}`;
        this.clearEnhancementByKey(enhancementKey);
        
        // Create enhanced contenteditable div
        this.createEnhancedTextarea(textarea, verseIndex, analysis.suggestions, text);
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
            const suggestionDataSafe = btoa(JSON.stringify(issue));
            
            highlightedHtml += `<span class="language-suggestion" 
                data-suggestion-safe="${suggestionDataSafe}" 
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
                    if (e.target.classList.contains('language-suggestion')) {
            e.preventDefault();
            const suggestionDataSafe = e.target.dataset.suggestionSafe;
            const suggestionData = JSON.parse(atob(suggestionDataSafe));
            this.showSuggestionModal(suggestionData, verseIndex, e.target);
        }
        });
        
        // Sync changes back to original textarea
        const syncToTextarea = () => {
            const plainText = contentDiv.textContent || contentDiv.innerText || '';
            const oldValue = originalTextarea.value;
            originalTextarea.value = plainText;
            
            // Only trigger input event if value actually changed
            if (oldValue !== plainText) {
                console.log(`🔤 Syncing text change to textarea for verse ${verseIndex}: "${oldValue}" → "${plainText}"`);
                // Trigger input event on original textarea with proper event properties
                const inputEvent = new Event('input', { bubbles: true });
                inputEvent.target = originalTextarea;
                originalTextarea.dispatchEvent(inputEvent);
            }
        };
        
        // Auto-analysis with 2-second debounce
        contentDiv.addEventListener('input', () => {
            syncToTextarea();
            console.log(`🔤 Text changed in verse ${verseIndex}, setting 2-second re-analysis timer`);
            clearTimeout(this.analysisTimeouts.get(verseIndex));
            const timeout = setTimeout(() => {
                console.log(`🔤 Auto re-analysis triggered for verse ${verseIndex}`);
                this.reanalyzeVerse(verseIndex);
            }, 2000);
            this.analysisTimeouts.set(verseIndex, timeout);
        });
        contentDiv.addEventListener('blur', () => {
            syncToTextarea();
            // Trigger blur on original textarea for save functionality
            console.log(`🔤 Content div blur for verse ${verseIndex}, triggering textarea blur`);
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
        
        // Prevent contentDiv from losing focus when clicking suggestions
        contentDiv.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('language-suggestion')) {
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
            // Remove contentDiv if it exists and restore textarea
            if (enhancement.contentDiv) {
                enhancement.contentDiv.remove();
                enhancement.textarea.style.display = '';
            }
            
            this.enhancedTextareas.delete(enhancementKey);
            
            // Clear any pending analysis timeout for this verse
            const verseIndex = parseInt(enhancementKey.split(':')[1]);
            if (!isNaN(verseIndex)) {
                clearTimeout(this.analysisTimeouts.get(verseIndex));
                this.analysisTimeouts.delete(verseIndex);
            }
            
            console.log(`🔤 Cleared enhancement for ${enhancementKey}`);
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
                    this.showSuggestionModal(issue, verseIndex, null);
    }
    
    showSuggestionModal(suggestion, verseIndex, element) {
        // Create modal backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'language-suggestion-backdrop';
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
        modal.className = 'language-suggestion-modal';
        modal.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 24px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            max-width: 400px;
            min-width: 320px;
            position: relative;
        `;
        
        const color = suggestion.color || '#ff6b6b';
        
        modal.innerHTML = `
            <div style="margin-bottom: 16px;">
                <h3 style="margin: 0 0 8px 0; color: ${color}; font-size: 18px; font-weight: bold;">
                    Suggestion
                </h3>
                <div style="background: #f8f9fa; padding: 8px 12px; border-radius: 4px; margin-bottom: 8px;">
                    <span style="font-weight: bold; color: ${color};">"${this.escapeHtml(suggestion.substring)}"</span>
                </div>
                <p style="margin: 0; color: #666; font-size: 14px;">${this.escapeHtml(suggestion.message)}</p>
            </div>
            
            <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: stretch; flex-wrap: nowrap;">
                <button class="btn-secondary" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 6px; background: #f8f9fa; color: #333; cursor: pointer; font-size: 14px; transition: all 0.2s ease; min-height: 36px; display: flex; align-items: center;">
                    Ignore
                </button>
                <button class="btn-primary" style="padding: 8px 16px; border: 1px solid ${color}; border-radius: 6px; background: ${color}; color: white; cursor: pointer; font-size: 14px; transition: all 0.2s ease; min-height: 36px; display: flex; align-items: center;">
                    Add to Dictionary
                </button>
                <button class="btn-add-all" style="padding: 8px 16px; border: 1px solid #10b981; border-radius: 6px; background: #10b981; color: white; cursor: pointer; font-size: 14px; transition: all 0.2s ease; min-height: 36px; display: flex; align-items: center;">
                    Add All Words
                </button>
            </div>
        `;
        
        // Add event handlers
        const ignoreBtn = modal.querySelector('.btn-secondary');
        const addBtn = modal.querySelector('.btn-primary');
        const addAllBtn = modal.querySelector('.btn-add-all');
        
        // Add hover effects
        ignoreBtn.addEventListener('mouseenter', () => {
            ignoreBtn.style.background = '#e9ecef';
            ignoreBtn.style.transform = 'translateY(-1px)';
        });
        ignoreBtn.addEventListener('mouseleave', () => {
            ignoreBtn.style.background = '#f8f9fa';
            ignoreBtn.style.transform = 'translateY(0)';
        });
        
        addBtn.addEventListener('mouseenter', () => {
            addBtn.style.transform = 'translateY(-1px)';
            addBtn.style.boxShadow = `0 4px 8px ${color}40`;
        });
        addBtn.addEventListener('mouseleave', () => {
            addBtn.style.transform = 'translateY(0)';
            addBtn.style.boxShadow = 'none';
        });
        
        addAllBtn.addEventListener('mouseenter', () => {
            addAllBtn.style.transform = 'translateY(-1px)';
            addAllBtn.style.boxShadow = '0 4px 8px #10b98140';
        });
        addAllBtn.addEventListener('mouseleave', () => {
            addAllBtn.style.transform = 'translateY(0)';
            addAllBtn.style.boxShadow = 'none';
        });
        
        ignoreBtn.addEventListener('click', () => {
            this.removeSuggestionHighlighting(suggestion, verseIndex);
            backdrop.remove();
            // Re-analyze the verse after ignoring suggestion
            console.log(`🔤 Ignore clicked for verse ${verseIndex}, triggering re-analysis`);
            this.reanalyzeVerse(verseIndex);
        });
        
        addBtn.addEventListener('click', async () => {
            this.removeSuggestionHighlighting(suggestion, verseIndex);
            await this.addWordToDictionary(suggestion.substring, verseIndex);
            backdrop.remove();
        });
        
        addAllBtn.addEventListener('click', async () => {
            await this.addAllWordsToDictionary(verseIndex);
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
                this.showToast(`Added "${word}" to dictionary`, 'success');
                // Re-analyze the verse after adding to dictionary
                console.log(`🔤 Dictionary add successful for verse ${verseIndex}, triggering re-analysis`);
                this.reanalyzeVerse(verseIndex);
            } else {
                console.error(`Failed to add "${word}" to dictionary`);
                this.showToast('Failed to add word to dictionary', 'error');
            }
        } catch (error) {
            console.error('Error adding word to dictionary:', error);
            this.showToast('Error adding word to dictionary', 'error');
        }
    }

    async addAllWordsToDictionary(verseIndex) {
        try {
            const verseText = this.getCurrentVerseText(verseIndex);
            if (!verseText) {
                console.error('No verse text found for bulk addition');
                this.showToast('Could not find verse text', 'error');
                return;
            }

            const words = this.extractUniqueWords(verseText);
            if (words.length === 0) {
                this.showToast('No words found to add', 'warning');
                return;
            }

            const projectId = window.translationEditor?.projectId;
            if (!projectId) {
                console.error('No project ID available');
                return;
            }

            console.log(`🔤 Adding ${words.length} words individually: ${words.join(', ')}`);
            
            // Use single word endpoint for each word (more reliable than bulk)
            let addedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;
            
            for (const word of words) {
                try {
                    const response = await fetch(`/project/${projectId}/language-server/dictionary`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ word: word })
                    });
                    
                    if (response.ok) {
                        const result = await response.json();
                        if (result.added) {
                            addedCount++;
                            console.log(`✅ Added "${word}" to dictionary`);
                        } else {
                            skippedCount++;
                            console.log(`⏭️ Skipped "${word}" (already in dictionary)`);
                        }
                    } else {
                        errorCount++;
                        console.error(`❌ Failed to add "${word}" to dictionary`);
                    }
                } catch (error) {
                    errorCount++;
                    console.error(`❌ Error adding "${word}" to dictionary:`, error);
                }
            }
            
            // Show results
            if (addedCount > 0) {
                this.showToast(`Added ${addedCount} new words to dictionary`, 'success');
            }
            if (skippedCount > 0 && addedCount === 0) {
                this.showToast(`All ${skippedCount} words were already in dictionary`, 'info');
            }
            if (errorCount > 0) {
                this.showToast(`Failed to add ${errorCount} words`, 'warning');
            }
            
            // Clear all highlighting and re-analyze
            this.clearEnhancement(verseIndex);
            this.reanalyzeVerse(verseIndex);
            
        } catch (error) {
            console.error('Error adding words to dictionary:', error);
            this.showToast('Error adding words to dictionary', 'error');
        }
    }

    getCurrentVerseText(verseIndex) {
        // Try to get text from enhanced textarea first
        for (const [key, enhancement] of this.enhancedTextareas.entries()) {
            if (key.endsWith(`:${verseIndex}`)) {
                if (enhancement.contentDiv) {
                    return enhancement.contentDiv.textContent || enhancement.contentDiv.innerText || '';
                }
                if (enhancement.textarea) {
                    return enhancement.textarea.value || '';
                }
            }
        }
        
        // Fallback to finding regular textarea
        const textarea = this.findTextarea(verseIndex);
        if (textarea) {
            return textarea.value || '';
        }
        
        return '';
    }

    extractUniqueWords(text) {
        // Extract all words (3+ letters, only alphabetic characters)
        const wordMatches = text.match(/\b[a-zA-Z]{3,}\b/g);
        if (!wordMatches) return [];
        
        // Return unique words, normalized to lowercase
        const uniqueWords = [...new Set(wordMatches.map(word => word.toLowerCase()))];
        return uniqueWords;
    }

    removeSuggestionHighlighting(suggestion, verseIndex) {
        console.log(`🔤 Removing specific suggestion for "${suggestion.substring}" at position ${suggestion.start}-${suggestion.end} in verse ${verseIndex}`);
        
        // Find the enhanced textarea for this verse
        this.enhancedTextareas.forEach((enhancement, key) => {
            if (key.includes(`:${verseIndex}`) && enhancement.contentDiv) {
                // Find all suggestion spans in this content div
                const suggestionSpans = enhancement.contentDiv.querySelectorAll('.language-suggestion');
                
                suggestionSpans.forEach(span => {
                    try {
                        const spanDataSafe = span.dataset.suggestionSafe;
                        const spanData = JSON.parse(atob(spanDataSafe));
                        
                        // Match the exact suggestion by position and text
                        if (spanData.substring === suggestion.substring && 
                            spanData.start === suggestion.start && 
                            spanData.end === suggestion.end) {
                            
                            // Replace the highlighted span with plain text
                            const textNode = document.createTextNode(suggestion.substring);
                            span.parentNode.replaceChild(textNode, span);
                            
                            console.log(`🔤 Removed highlighting for "${suggestion.substring}" at position ${suggestion.start}`);
                            return;
                        }
                    } catch (error) {
                        console.error('Error parsing suggestion data:', error);
                    }
                });
            }
        });
        
        // Also remove from cached analysis so it doesn't reappear
        const analysis = this.verseAnalyses.get(verseIndex);
        if (analysis && analysis.suggestions) {
            analysis.suggestions = analysis.suggestions.filter(item => 
                !(item.substring === suggestion.substring && 
                  item.start === suggestion.start && 
                  item.end === suggestion.end)
            );
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
    
    async reanalyzeVerse(verseIndex) {
        const projectId = window.translationEditor?.projectId;
        if (!projectId) {
            console.warn('🔤 No project ID available for re-analysis');
            return;
        }
        
        // Find the correct textarea - prioritize the one with language server enabled
        const textareas = document.querySelectorAll(`textarea[data-verse-index="${verseIndex}"]`);
        let targetTextarea = null;
        let targetWindowId = null;
        
        // First, try to find a textarea in a window where language server is enabled
        for (const textarea of textareas) {
            const windowId = this.getWindowIdForTextarea(textarea);
            if (windowId && this.isEnabledForWindow(windowId)) {
                targetTextarea = textarea;
                targetWindowId = windowId;
                console.log(`🔤 Found textarea in enabled window ${windowId} for verse ${verseIndex}`);
                break;
            }
        }
        
        // If no enabled window found, use the first textarea but skip re-analysis
        if (!targetTextarea && textareas.length > 0) {
            targetTextarea = textareas[0];
            targetWindowId = this.getWindowIdForTextarea(targetTextarea);
            console.log(`🔤 Language server disabled for window ${targetWindowId}, skipping re-analysis`);
            return;
        }
        
        if (!targetTextarea || !targetWindowId) {
            console.warn(`🔤 No suitable textarea found for verse ${verseIndex} re-analysis`);
            return;
        }
        
        // Convert window ID to text ID for API call
        const textId = targetWindowId.startsWith('text_') ? 
            targetWindowId.replace('text_', '') : 
            targetWindowId.startsWith('translation_') ? 
            targetWindowId.replace('translation_', '') : 
            targetWindowId;
        
        // Get current text from textarea
        const currentText = targetTextarea.value || '';
        
        console.log(`🔤 Re-analyzing verse ${verseIndex} for window ${targetWindowId} (textId: ${textId}) with current text: "${currentText}"`);
        
        try {
            const response = await fetch(`/project/${projectId}/language-server/analyze/text_${textId}/${verseIndex}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: currentText })
            });
            const result = await response.json();
            if (result.success && result.analysis) {
                console.log(`🔤 Re-analysis complete for verse ${verseIndex}:`, result.analysis);
                this.handleAnalysis(verseIndex, result.analysis, targetWindowId);
            } else {
                console.warn('🔤 Re-analysis failed or returned no results:', result);
            }
        } catch (error) {
            console.error('🔤 Error re-analyzing verse:', error);
        }
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

    setupProperSync(contentDiv, originalTextarea, verseIndex) {
        // Track changes properly to trigger auto-save
        let lastValue = originalTextarea.value;
        
        const syncToTextarea = () => {
            const plainText = contentDiv.textContent || contentDiv.innerText || '';
            const oldValue = originalTextarea.value;
            
            if (oldValue !== plainText) {
                // Update textarea value
                originalTextarea.value = plainText;
                
                // CRITICAL: Manually trigger the textarea's input event with the right approach
                // This ensures the text-window.js hasChanges tracking works
                console.log(`🔤 Syncing text change for verse ${verseIndex}: "${oldValue}" → "${plainText}"`);
                
                // Create and dispatch a proper input event
                const event = new Event('input', { bubbles: true });
                originalTextarea.dispatchEvent(event);
                
                lastValue = plainText;
            }
        };
        
        // Sync on every input change + add 2-second re-analysis timeout
        contentDiv.addEventListener('input', () => {
            syncToTextarea();
            
            // Add 2-second auto re-analysis timeout
            console.log(`🔤 Text changed in verse ${verseIndex}, setting 2-second re-analysis timer`);
            clearTimeout(this.analysisTimeouts.get(verseIndex));
            const timeout = setTimeout(() => {
                console.log(`🔤 Auto re-analysis triggered for verse ${verseIndex}`);
                this.reanalyzeVerse(verseIndex);
            }, 2000);
            this.analysisTimeouts.set(verseIndex, timeout);
        });
        
        // Also sync on blur to ensure auto-save triggers
        contentDiv.addEventListener('blur', () => {
            syncToTextarea();
            // Trigger blur on original textarea for auto-save
            console.log(`🔤 Content div blur for verse ${verseIndex}, triggering textarea blur`);
            originalTextarea.dispatchEvent(new Event('blur', { bubbles: true }));
        });
        
        // Handle focus tracking for save system
        contentDiv.addEventListener('focus', () => {
            if (window.translationEditor?.saveSystem) {
                window.translationEditor.saveSystem.currentFocusedTextarea = originalTextarea;
            }
            originalTextarea.dispatchEvent(new Event('focus', { bubbles: true }));
        });
        
        // Handle suggestion clicks
        contentDiv.addEventListener('click', (e) => {
            if (e.target.classList.contains('language-suggestion')) {
                e.preventDefault();
                const suggestionDataSafe = e.target.dataset.suggestionSafe;
                const suggestionData = JSON.parse(atob(suggestionDataSafe));
                this.showSuggestionModal(suggestionData, verseIndex, e.target);
            }
        });
        
        // Prevent losing focus when clicking suggestions
        contentDiv.addEventListener('mousedown', (e) => {
            if (e.target.classList.contains('language-suggestion')) {
                e.preventDefault();
            }
        });
    }
}

// Initialize global instance
window.languageServer = new AdvancedLanguageServer();

// Debug function to test re-analysis manually
window.testLanguageServerReanalysis = function(verseIndex) {
    console.log('🔤 Manual test: Re-analyzing verse', verseIndex);
    if (window.languageServer) {
        window.languageServer.reanalyzeVerse(verseIndex);
    } else {
        console.error('🔤 Language server not initialized');
    }
};

// Simple test function to verify API works
window.testLanguageServerAPI = async function(verseIndex = 1, testText = null) {
    const projectId = window.translationEditor?.projectId;
    if (!projectId) {
        console.error('🔤 No project ID available');
        return;
    }
    
    // Try to find any text window to get a text ID
    const textWindows = window.translationEditor?.textWindows;
    if (!textWindows || textWindows.size === 0) {
        console.error('🔤 No text windows available');
        return;
    }
    
    // Get the first available text window
    const firstWindow = textWindows.values().next().value;
    const windowId = firstWindow.id;
    
    // Convert window ID to text ID
    const textId = windowId.startsWith('text_') ? 
        windowId.replace('text_', '') : 
        windowId.replace('translation_', '');
    
    // Get test text from textarea if not provided
    if (!testText) {
        const textarea = document.querySelector(`textarea[data-verse-index="${verseIndex}"]`);
        testText = textarea?.value || 'hello world test unknownword';
    }
    
    console.log(`🔤 Testing API with textId: ${textId}, verseIndex: ${verseIndex}, text: "${testText}"`);
    
    try {
        const response = await fetch(`/project/${projectId}/language-server/analyze/text_${textId}/${verseIndex}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: testText })
        });
        const result = await response.json();
        console.log('🔤 API test result:', result);
        return result;
    } catch (error) {
        console.error('🔤 API test failed:', error);
        return null;
    }
};

// Listen for save results
document.addEventListener('verse-saved', (event) => {
    console.log('🔤 Received verse-saved event:', event.detail);
    if (event.detail?.analysis) {
        window.languageServer.handleAnalysis(event.detail.verseIndex, event.detail.analysis, event.detail.targetId);
    }
});

// Test function for bulk dictionary addition
window.testBulkDictionaryAdd = async function(verseIndex = 1, testText = null) {
    console.log('🔤 Testing bulk dictionary addition for verse', verseIndex);
    
    if (!window.languageServer) {
        console.error('🔤 Language server not initialized');
        return;
    }
    
    // Get or set test text
    let verseText = testText;
    if (!verseText) {
        verseText = window.languageServer.getCurrentVerseText(verseIndex);
        if (!verseText) {
            verseText = 'hello world test unknown word';
            console.log('🔤 No verse text found, using test text:', verseText);
        }
    }
    
    console.log('🔤 Extracting words from text:', verseText);
    const words = window.languageServer.extractUniqueWords(verseText);
    console.log('🔤 Extracted words:', words);
    
    if (words.length === 0) {
        console.log('🔤 No words to add');
        return;
    }
    
    try {
        await window.languageServer.addAllWordsToDictionary(verseIndex);
        console.log('🔤 Bulk addition test completed successfully');
    } catch (error) {
        console.error('🔤 Bulk addition test failed:', error);
    }
};

// Process verses that come with analysis data from initial load
window.processVerseWithAnalysis = (verseData) => {
    window.languageServer.processVerseWithAnalysis(verseData);
};

// Debug function to show language server status for all windows
window.showLanguageServerStatus = function() {
    if (!window.languageServer) {
        console.error('🔤 Language server not initialized');
        return;
    }
    
    const textWindows = window.translationEditor?.textWindows;
    if (!textWindows) {
        console.error('🔤 No text windows available');
        return;
    }
    
    console.log('🔤 Language Server Status:');
    textWindows.forEach((textWindow, windowId) => {
        const enabled = window.languageServer.isEnabledForWindow(windowId);
        console.log(`  - ${windowId} (${textWindow.title}, ${textWindow.type}): ${enabled ? 'ENABLED' : 'DISABLED'}`);
    });
};

console.log('🔤 Advanced Language Server ready'); 