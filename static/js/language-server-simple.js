// Advanced Language Server Client - Inline Text Highlighting
class AdvancedLanguageServer {
    constructor() {
        this.verseAnalyses = new Map(); // "windowId:verseIndex" -> analysis data (WINDOW-SPECIFIC!)
        this.enhancedTextareas = new Map(); // "windowId:verseIndex" -> {textarea, contentDiv, issues}
        this.windowSettings = new Map(); // windowId -> {enabled: boolean}
        this.analysisTimeouts = new Map(); // verseIndex -> timeout ID
        this.currentTooltip = null; // Store current tooltip element
        this.tooltipHideTimeout = null; // Delay hiding tooltip
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
        
        // Default: enabled for all windows except explicitly disabled ones
        const defaultEnabled = textWindow.type !== 'reference';
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
                // Check if we have cached analysis for this verse in this window
                const analysisKey = `${windowId}:${verseIndex}`;
                const cachedAnalysis = this.verseAnalyses.get(analysisKey);
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
    processVerseWithAnalysis(verseData, specificWindowId = null) {
        console.log(`🔤 Processing verse ${verseData.index} with analysis for window ${specificWindowId}:`, verseData.analysis);
        console.log(`🔤 Verse has target_text: "${verseData.target_text}"`);
        
        // Store analysis if provided (backend now always provides this)
        // CRITICAL FIX: Store analysis by window+verse, not just verse
        if (verseData.analysis && specificWindowId) {
            const analysisKey = `${specificWindowId}:${verseData.index}`;
            this.verseAnalyses.set(analysisKey, verseData.analysis);
            console.log(`🔤 Stored analysis for ${analysisKey} with ${verseData.analysis.suggestions?.length || 0} suggestions`);
        }
        
        // Apply highlighting immediately if we have content and analysis
        if (verseData.target_text && verseData.target_text.trim()) {
            setTimeout(() => {
                // If specific window provided, only look for textareas in that window
                let textareas;
                if (specificWindowId) {
                    const textWindow = window.translationEditor?.textWindows?.get(specificWindowId);
                    if (textWindow?.element) {
                        textareas = textWindow.element.querySelectorAll(`textarea[data-verse-index="${verseData.index}"]`);
                        console.log(`🔤 Found ${textareas.length} textareas for verse ${verseData.index} in specific window ${specificWindowId}`);
                    } else {
                        console.log(`🔤 Window ${specificWindowId} not found or has no element`);
                        textareas = [];
                    }
                } else {
                    // Fallback: search all textareas (legacy behavior)
                    textareas = document.querySelectorAll(`textarea[data-verse-index="${verseData.index}"]`);
                    console.log(`🔤 Found ${textareas.length} textareas for verse ${verseData.index} (all windows)`);
                }
                
                textareas.forEach(textarea => {
                    const windowId = this.getWindowIdForTextarea(textarea);
                    console.log(`🔤 Textarea in window ${windowId}, enabled: ${this.isEnabledForWindow(windowId)}`);
                    
                    // If specific window provided, only process that window
                    if (specificWindowId && windowId !== specificWindowId) {
                        console.log(`🔤 Skipping window ${windowId} (not target ${specificWindowId}) for verse ${verseData.index}`);
                        return;
                    }
                    
                    if (windowId && this.isEnabledForWindow(windowId)) {
                        const textareaContent = textarea.value || '';
                        const analyzedContent = verseData.target_text || '';
                        
                        console.log(`🔤 Comparing content: textarea="${textareaContent}" vs analyzed="${analyzedContent}"`);
                        
                        if (textareaContent === analyzedContent) {
                            console.log(`🔤 Content matches for verse ${verseData.index} in window ${windowId}, applying analysis`);
                            
                            // Use the analysis from the verse data (window-specific!)
                            const analysisKey = `${windowId}:${verseData.index}`;
                            const analysis = this.verseAnalyses.get(analysisKey);
                            if (analysis && analysis.suggestions && analysis.suggestions.length > 0) {
                                console.log(`🔤 Applying ${analysis.suggestions.length} suggestions to verse ${verseData.index} from ${analysisKey}`);
                                this.enhanceTextareaSpecific(textarea, verseData.index, analysis);
                            } else {
                                console.log(`🔤 No suggestions to apply for verse ${verseData.index} (key: ${analysisKey})`);
                            }
                        } else {
                            console.log(`🔤 Content mismatch for verse ${verseData.index} in window ${windowId}`);
                        }
                    }
                });
            }, 100);
        } else {
            console.log(`🔤 No target_text for verse ${verseData.index}, skipping highlighting`);
        }
    }
    
    // Handle analysis from save operations
    handleAnalysis(verseIndex, analysis, targetId = null) {
        console.log(`🔤 Handling analysis for verse ${verseIndex} from targetId ${targetId}:`, analysis);
        
        // Always store the analysis (even if empty) - window-specific!
        if (targetId) {
            const analysisKey = `${targetId}:${verseIndex}`;
            this.verseAnalyses.set(analysisKey, analysis || {"suggestions": []});
            console.log(`🔤 Stored save analysis for ${analysisKey}`);
        }
        
        if (!analysis?.suggestions || analysis.suggestions.length === 0) {
            console.log('🔤 No analysis suggestions found, clearing enhancements');
            if (targetId) {
                // Clear enhancement for specific window
                const enhancementKey = `${targetId}:${verseIndex}`;
                this.clearEnhancementByKey(enhancementKey);
            } else {
                // Fallback: clear all enhancements for this verse
                this.clearEnhancement(verseIndex);
            }
            return;
        }
        
        // Apply analysis to textareas that belong to the specific targetId
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
        // Handle hover and clicks on language issues
        contentDiv.addEventListener('mouseenter', async (e) => {
            if (e.target.classList.contains('language-suggestion')) {
                // Cancel any pending hide timeout
                if (this.tooltipHideTimeout) {
                    clearTimeout(this.tooltipHideTimeout);
                    this.tooltipHideTimeout = null;
                }
                
                const suggestionDataSafe = e.target.dataset.suggestionSafe;
                const suggestionData = JSON.parse(atob(suggestionDataSafe));
                await this.showSuggestionTooltip(suggestionData, e.target, verseIndex);
            }
        }, true);
        
        contentDiv.addEventListener('mouseleave', (e) => {
            if (e.target.classList.contains('language-suggestion')) {
                // Delay hiding to allow moving to tooltip
                this.tooltipHideTimeout = setTimeout(() => {
                    this.hideSuggestionTooltip();
                }, 300);
            }
        }, true);
        
        // Click on suggestions is now handled by hover tooltip - no modal needed
        
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
    
    clearAllHighlightingForVerse(verseIndex) {
        // Clear all enhancements for this verse across all windows
        const keysToDelete = [];
        this.enhancedTextareas.forEach((enhancement, key) => {
            if (key.endsWith(`:${verseIndex}`)) {
                this.clearEnhancementByKey(key);
                keysToDelete.push(key);
            }
        });
        
        // Clear cached analysis for this verse across all windows
        this.verseAnalyses.forEach((analysis, key) => {
            if (key.endsWith(`:${verseIndex}`)) {
                this.verseAnalyses.set(key, {suggestions: []});
            }
        });
        
        console.log(`🔤 Cleared all highlighting for verse ${verseIndex} across all windows`);
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
        
        // Check if we have similar words to suggest
        const hasSimilarWords = suggestion.similar_words && suggestion.similar_words.length > 0;
        
        let similarWordsHtml = '';
        if (hasSimilarWords) {
            similarWordsHtml = `
                <div style="margin: 12px 0;">
                    <h4 style="margin: 0 0 8px 0; color: #333; font-size: 14px; font-weight: bold;">
                        Did you mean:
                    </h4>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                        ${suggestion.similar_words.map(word => `
                            <button class="similar-word-btn" data-word="${this.escapeHtml(word)}" 
                                style="
                                    padding: 6px 12px; 
                                    border: 1px solid #3b82f6; 
                                    border-radius: 4px; 
                                    background: #eff6ff; 
                                    color: #1d4ed8; 
                                    cursor: pointer; 
                                    font-size: 13px; 
                                    transition: all 0.2s ease;
                                    font-weight: 500;
                                "
                            >
                                ${this.escapeHtml(word)}
                            </button>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        modal.innerHTML = `
            <div style="margin-bottom: 16px;">
                <h3 style="margin: 0 0 8px 0; color: ${color}; font-size: 18px; font-weight: bold;">
                    Unknown Word
                </h3>
                <div style="background: #f8f9fa; padding: 8px 12px; border-radius: 4px; margin-bottom: 8px;">
                    <span style="font-weight: bold; color: ${color};">"${this.escapeHtml(suggestion.substring)}"</span>
                </div>
                <p style="margin: 0; color: #666; font-size: 14px;">${this.escapeHtml(suggestion.message)}</p>
                ${similarWordsHtml}
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
        const similarWordBtns = modal.querySelectorAll('.similar-word-btn');
        
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
        
        // Add similar word click handlers - just add the word to dictionary
        similarWordBtns.forEach(btn => {
            btn.addEventListener('mouseenter', () => {
                btn.style.background = '#dbeafe';
                btn.style.transform = 'translateY(-1px)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = '#eff6ff';
                btn.style.transform = 'translateY(0)';
            });
            
            btn.addEventListener('click', async () => {
                const word = btn.dataset.word;
                this.removeSuggestionHighlighting(suggestion, verseIndex);
                await this.addWordToDictionary(word, verseIndex);
                backdrop.remove();
            });
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
    
    async showSuggestionTooltip(suggestion, element, verseIndex) {
        // Remove any existing tooltip
        this.hideSuggestionTooltip();
        
        // Fetch suggestions on-demand for better performance
        const similarWords = await this.fetchWordSuggestions(suggestion.substring);
        
        // Create suggestion tooltip with actions
        const tooltip = document.createElement('div');
        tooltip.className = 'language-suggestion-tooltip';
        tooltip.style.cssText = `
            position: absolute;
            background: white;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 1000;
            font-size: 12px;
            max-width: 200px;
            pointer-events: auto;
        `;
        
        // Word suggestions section
        let suggestionsHtml = '';
        if (similarWords && similarWords.length > 0) {
            suggestionsHtml = `
                                 <div class="mb-2">
                     <div class="font-semibold text-gray-700 mb-1 text-xs">
                         "${this.escapeHtml(suggestion.substring)}" → Suggestions:
                     </div>
                     <div class="flex flex-wrap gap-1">
                                                 ${similarWords.slice(0, 4).map(word => `
                             <button class="tooltip-suggestion-btn px-2 py-1 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 rounded text-xs font-medium transition-all duration-200 hover:scale-105" 
                                     data-word="${this.escapeHtml(word)}" 
                                     data-verse-index="${verseIndex}"
                                     title="Replace with '${this.escapeHtml(word)}' and add to dictionary">
                                 ${this.escapeHtml(word)}
                             </button>
                         `).join('')}
                    </div>
                </div>
            `;
                 } else {
             suggestionsHtml = `
                 <div class="mb-2">
                     <div class="font-semibold text-gray-700 mb-1 text-xs">
                         "${this.escapeHtml(suggestion.substring)}" not in dictionary
                     </div>
                 </div>
             `;
        }
        
        // Action buttons section with icons
        const actionsHtml = `
            <div class="flex gap-2 border-t border-gray-200 pt-2">
                <button class="tooltip-add-btn flex items-center gap-1 px-2 py-1 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-700 rounded text-xs font-medium transition-all duration-200 hover:scale-105" 
                        data-word="${this.escapeHtml(suggestion.substring)}" 
                        data-verse-index="${verseIndex}"
                        title="Add '${this.escapeHtml(suggestion.substring)}' to dictionary">
                    <span class="text-sm">✓</span>
                    <span>Add</span>
                </button>
                <button class="tooltip-add-all-btn flex items-center gap-1 px-2 py-1 bg-blue-100 hover:bg-blue-200 border border-blue-300 text-blue-700 rounded text-xs font-medium transition-all duration-200 hover:scale-105" 
                        data-verse-index="${verseIndex}"
                        title="Add all unknown words in this verse to dictionary">
                    <span class="text-sm">✓✓</span>
                    <span>All</span>
                </button>
            </div>
        `;
        
        tooltip.innerHTML = suggestionsHtml + actionsHtml;
        
        // Add click handlers for suggestion buttons
        tooltip.addEventListener('click', async (e) => {
            e.stopPropagation();
            
            if (e.target.classList.contains('tooltip-suggestion-btn') || e.target.closest('.tooltip-suggestion-btn')) {
                const btn = e.target.classList.contains('tooltip-suggestion-btn') ? e.target : e.target.closest('.tooltip-suggestion-btn');
                const correctedWord = btn.dataset.word;
                const verseIndex = parseInt(btn.dataset.verseIndex);
                
                // Replace the misspelled word with the suggestion
                this.replaceWordInText(suggestion.substring, correctedWord, verseIndex);
                
                // Add corrected word to dictionary
                await this.addWordToDictionary(correctedWord, verseIndex);
                
                // Hide tooltip
                this.hideSuggestionTooltip();
            }
                         else if (e.target.classList.contains('tooltip-add-btn') || e.target.closest('.tooltip-add-btn')) {
                 const btn = e.target.classList.contains('tooltip-add-btn') ? e.target : e.target.closest('.tooltip-add-btn');
                 const word = btn.dataset.word;
                 const verseIndex = parseInt(btn.dataset.verseIndex);
                 
                 // Remove highlighting and add original word to dictionary
                 this.removeSuggestionHighlighting(suggestion, verseIndex);
                 await this.addWordToDictionary(word, verseIndex);
                 
                 // Hide tooltip
                 this.hideSuggestionTooltip();
             }
             else if (e.target.classList.contains('tooltip-add-all-btn') || e.target.closest('.tooltip-add-all-btn')) {
                 const btn = e.target.classList.contains('tooltip-add-all-btn') ? e.target : e.target.closest('.tooltip-add-all-btn');
                 const verseIndex = parseInt(btn.dataset.verseIndex);
                 
                 // Add all words and let reanalysis handle highlighting
                 await this.addAllWordsToDictionary(verseIndex);
                 
                 // Hide tooltip
                 this.hideSuggestionTooltip();
             }
        });
        
        // Hover effects are now handled by Tailwind classes
        
        // Handle tooltip hover to keep it visible
        tooltip.addEventListener('mouseenter', () => {
            if (this.tooltipHideTimeout) {
                clearTimeout(this.tooltipHideTimeout);
                this.tooltipHideTimeout = null;
            }
        });
        
        tooltip.addEventListener('mouseleave', () => {
            this.hideSuggestionTooltip();
        });
        
        // Position the tooltip
        document.body.appendChild(tooltip);
        this.positionTooltip(tooltip, element);
        
        this.currentTooltip = tooltip;
    }
    
    createSimpleTooltip(suggestion, element) {
        const tooltip = document.createElement('div');
        tooltip.className = 'language-suggestion-tooltip';
        tooltip.style.cssText = `
            position: absolute;
            background: #1f2937;
            color: white;
            border-radius: 4px;
            padding: 8px 12px;
            font-size: 12px;
            z-index: 1000;
            pointer-events: none;
        `;
        
        tooltip.textContent = suggestion.message || `"${suggestion.substring}" not in dictionary`;
        
        document.body.appendChild(tooltip);
        this.positionTooltip(tooltip, element);
        
        this.currentTooltip = tooltip;
    }
    
    positionTooltip(tooltip, element) {
        const elementRect = element.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        
        // Position above the element by default
        let top = elementRect.top - tooltipRect.height - 8;
        let left = elementRect.left + (elementRect.width / 2) - (tooltipRect.width / 2);
        
        // Adjust if tooltip would go off screen
        if (top < 10) {
            // Position below instead
            top = elementRect.bottom + 8;
        }
        
        if (left < 10) {
            left = 10;
        } else if (left + tooltipRect.width > window.innerWidth - 10) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        
        tooltip.style.top = `${top + window.scrollY}px`;
        tooltip.style.left = `${left + window.scrollX}px`;
    }
    
    hideSuggestionTooltip() {
        if (this.tooltipHideTimeout) {
            clearTimeout(this.tooltipHideTimeout);
            this.tooltipHideTimeout = null;
        }
        
        if (this.currentTooltip) {
            this.currentTooltip.remove();
            this.currentTooltip = null;
        }
    }
    
    replaceWordInText(originalWord, correctedWord, verseIndex) {
        // Find the enhanced textarea for this verse
        this.enhancedTextareas.forEach((enhancement, key) => {
            if (key.includes(`:${verseIndex}`) && enhancement.contentDiv) {
                const contentDiv = enhancement.contentDiv;
                const originalTextarea = enhancement.textarea;
                
                // Replace in contentDiv HTML (preserve highlighting for other words)
                let innerHTML = contentDiv.innerHTML;
                const regex = new RegExp(`\\b${this.escapeRegex(originalWord)}\\b`, 'gi');
                innerHTML = innerHTML.replace(regex, correctedWord);
                contentDiv.innerHTML = innerHTML;
                
                // Update the original textarea
                const plainText = contentDiv.textContent || contentDiv.innerText || '';
                originalTextarea.value = plainText;
                
                // Trigger input event for auto-save
                const inputEvent = new Event('input', { bubbles: true });
                originalTextarea.dispatchEvent(inputEvent);
                
                console.log(`🔤 Replaced "${originalWord}" with "${correctedWord}" in verse ${verseIndex}`);
            }
        });
    }
    
    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    
    async fetchWordSuggestions(word) {
        console.log(`🔤 Fetching suggestions for word: "${word}"`);
        try {
            const projectId = window.translationEditor?.projectId;
            if (!projectId) {
                console.log('🔤 No project ID available for suggestions');
                return [];
            }
            
            const url = `/project/${projectId}/language-server/suggestions/${encodeURIComponent(word)}`;
            console.log(`🔤 Making request to: ${url}`);
            
            const response = await fetch(url);
            const result = await response.json();
            
            console.log(`🔤 Suggestions response:`, result);
            
            if (result.success) {
                console.log(`🔤 Found ${result.suggestions?.length || 0} suggestions for "${word}":`, result.suggestions);
                return result.suggestions || [];
            } else {
                console.warn('🔤 Failed to fetch word suggestions:', result.error);
                return [];
            }
        } catch (error) {
            console.warn('🔤 Error fetching word suggestions:', error);
            return [];
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
            
            // Always reanalyze to update server-side stored analysis with new dictionary
            console.log(`🔤 Words added to dictionary, re-analyzing verse ${verseIndex} to update server analysis`);
            setTimeout(() => {
                this.reanalyzeVerse(verseIndex);
            }, 500);
            
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
        
        // Also remove from cached analysis so it doesn't reappear (check all windows)
        this.verseAnalyses.forEach((analysis, key) => {
            if (key.endsWith(`:${verseIndex}`) && analysis.suggestions) {
                analysis.suggestions = analysis.suggestions.filter(item => 
                    !(item.substring === suggestion.substring && 
                      item.start === suggestion.start && 
                      item.end === suggestion.end)
                );
            }
        });
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
        
        // Handle suggestion hover and click
        contentDiv.addEventListener('mouseenter', async (e) => {
            if (e.target.classList.contains('language-suggestion')) {
                // Cancel any pending hide timeout
                if (this.tooltipHideTimeout) {
                    clearTimeout(this.tooltipHideTimeout);
                    this.tooltipHideTimeout = null;
                }
                
                const suggestionDataSafe = e.target.dataset.suggestionSafe;
                const suggestionData = JSON.parse(atob(suggestionDataSafe));
                await this.showSuggestionTooltip(suggestionData, e.target, verseIndex);
            }
        }, true);
        
        contentDiv.addEventListener('mouseleave', (e) => {
            if (e.target.classList.contains('language-suggestion')) {
                // Delay hiding to allow moving to tooltip
                this.tooltipHideTimeout = setTimeout(() => {
                    this.hideSuggestionTooltip();
                }, 300);
            }
        }, true);
        
        // Click on suggestions is now handled by hover tooltip - no modal needed
        
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
console.log('🔤 AdvancedLanguageServer initialized and ready');

// Hide tooltips when clicking elsewhere or scrolling
document.addEventListener('click', (e) => {
    if (!e.target.closest('.language-suggestion-tooltip') && !e.target.classList.contains('language-suggestion')) {
        window.languageServer.hideSuggestionTooltip();
    }
});

document.addEventListener('scroll', () => {
    window.languageServer.hideSuggestionTooltip();
}, true);

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
window.processVerseWithAnalysis = (verseData, specificWindowId = null) => {
    window.languageServer.processVerseWithAnalysis(verseData, specificWindowId);
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

 