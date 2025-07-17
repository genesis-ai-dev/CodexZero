// PERFORMANCE: Optimized Hover-Based Drag and Drop Translation
class TranslationDragDrop {
    constructor(translationEditor) {
        this.editor = translationEditor;
        this.collectedVerses = [];
        this.collectedVerseNumbers = new Set();
        this.isDragging = false;
        this.sourceWindowId = null;
        this.lastHoveredWindow = null;
        
        // PERFORMANCE: Throttled handlers
        this.throttledDragEnter = UIUtilities.createThrottledCallback(this.handleDragEnter.bind(this), 16);
        this.throttledDragOver = UIUtilities.createThrottledCallback(this.handleDragOver.bind(this), 16);
        
        this.setupGlobalListeners();
    }
    
    setupGlobalListeners() {
        // PERFORMANCE: Use passive listeners where possible
        document.addEventListener('dragstart', this.handleDragStart.bind(this), { passive: true });
        document.addEventListener('dragend', this.handleDragEnd.bind(this), { passive: true });
        
        // PERFORMANCE: Throttled drag over handler
        document.addEventListener('dragover', this.throttledDragOver, { passive: false });
        document.addEventListener('drop', this.handleDrop.bind(this), { passive: false });
    }
    
    handleDragStart(e) {
        if (e.target.classList.contains('sparkle-drag-handle')) {
            this.isDragging = true;
            this.sourceWindowId = this.getSourceWindowId(e.target);
            this.showCounter();
        }
    }
    
    handleDragEnd(e) {
        if (this.isDragging) {
            this.endCollection();
        }
    }
    
    handleDragOver(e) {
        if (this.isDragging) {
            e.preventDefault();
            
            // PERFORMANCE: Track last hovered window more efficiently
            const textWindow = this.getTextWindowFromElement(e.target);
            if (textWindow && textWindow !== this.lastHoveredWindow) {
                this.lastHoveredWindow = textWindow;
                this.updateWindowHighlight(textWindow);
            }
        }
    }
    
    handleDragEnter(e) {
        if (!this.isDragging) return;
        
        const textarea = e.target.closest('textarea');
        if (!textarea) return;
        
        const verse = textarea.dataset.verse;
        const verseIndex = textarea.dataset.verseIndex;
        
        // Only collect if this is actually a verse textarea with proper data
        if (!verse || !verseIndex) return;
        
        // Make sure this textarea is in a verse container
        const verseContainer = textarea.closest('[data-verse]');
        if (!verseContainer) return;
        
        // Get the window containing this textarea
        const targetWindow = this.getTextWindow(textarea);
        if (!targetWindow || targetWindow.id !== this.sourceWindowId) return;
        
        // Check if already collected using Set for fast lookup
        if (this.collectedVerseNumbers.has(verse)) return;
        
        // Add to collection
        this.collectVerse(textarea, targetWindow);
    }
    
    handleDrop(e) {
        if (this.isDragging) {
            e.preventDefault();
            
            const dragData = this.endCollection();
            if (dragData && dragData.length > 0 && this.lastHoveredWindow) {
                this.editor.translateFromDrag(dragData, null, this.lastHoveredWindow);
            }
        }
    }
    
    setupTextareaForMultiSelect(textarea) {
        // PERFORMANCE: Remove expensive drag listeners for now
        // These were causing constant event firing during interactions
        // 
        // textarea.addEventListener('dragenter', this.throttledDragEnter, { passive: true });
        
        // Keep only essential functionality
        textarea.draggable = false; // Disable dragging entirely for performance
    }
    
    getSourceWindowId(element) {
        const windowElement = element.closest('[data-window-id]');
        return windowElement ? windowElement.dataset.windowId : null;
    }
    
    getTextWindowFromElement(element) {
        const windowElement = element.closest('[data-window-id]');
        if (!windowElement) return null;
        
        const windowId = windowElement.dataset.windowId;
        return this.editor.textWindows.get(windowId);
    }
    
    updateWindowHighlight(textWindow) {
        // PERFORMANCE: Batch remove previous highlights
        const previousHighlights = document.querySelectorAll('.drag-target-highlight');
        UIUtilities.batchToggleClasses(
            Array.from(previousHighlights),
            [],
            ['drag-target-highlight', 'bg-green-50', 'border-green-300']
        );
        
        // PERFORMANCE: Add highlight to current window
        if (textWindow.element) {
            UIUtilities.batchToggleClasses(
                [textWindow.element],
                ['drag-target-highlight', 'bg-green-50', 'border-green-300'],
                []
            );
        }
    }
    
    startCollection(initialVerse) {
        // Reset state
        this.collectedVerses = [];
        this.collectedVerseNumbers = new Set();
        this.isDragging = true;
        this.sourceWindowId = initialVerse.sourceId;
        this.lastHoveredWindow = null;
        
        // Automatically add the initial verse that was dragged
        this.collectedVerses.push(initialVerse);
        this.collectedVerseNumbers.add(initialVerse.verse);
        console.log('Auto-added initial verse:', initialVerse.verse);
        
        // Show counter
        this.showCounter();
        this.updateCounter();
        
        console.log('Started collection from window:', this.sourceWindowId, 'with initial verse:', initialVerse.verse);
    }
    
    collectVerse(textarea, targetWindow) {
        const verse = textarea.dataset.verse;
        
        // Double-check for duplicates
        if (this.collectedVerseNumbers.has(verse)) {
            console.log('Duplicate verse detected and prevented:', verse);
            return;
        }
        
        const verseData = {
            sourceText: textarea.value || '',
            sourceId: targetWindow.id,
            verse: verse,
            reference: textarea.dataset.reference || verse,
            sourceType: targetWindow.type,
            sourceTitle: targetWindow.title
        };
        
        this.collectedVerses.push(verseData);
        this.collectedVerseNumbers.add(verse);
        
        // Visual feedback
        textarea.style.backgroundColor = '#dbeafe';
        textarea.style.borderColor = '#3b82f6';
        textarea.style.borderWidth = '2px';
        
        this.updateCounter();
        console.log('Collected verse:', verse, 'Total:', this.collectedVerses.length);
    }
    
    endCollection() {
        this.isDragging = false;
        
        // Clear visual feedback
        document.querySelectorAll('textarea[style*="background-color"]').forEach(ta => {
            ta.style.backgroundColor = '';
            ta.style.borderColor = '';
            ta.style.borderWidth = '';
        });
        
        this.hideCounter();
        
        const result = [...this.collectedVerses];
        this.collectedVerses = [];
        this.collectedVerseNumbers.clear();
        this.sourceWindowId = null;
        
        console.log('Ended collection, returning:', result.length, 'verses');
        console.log('Target window for translation:', this.lastHoveredWindow?.title || 'none detected');
        
        return result;
    }
    
    showCounter() {
        if (!this.counter) {
            this.counter = document.createElement('div');
            this.counter.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 9999;
                background: #3b82f6; color: white; padding: 8px 12px;
                border-radius: 6px; font-size: 14px; font-weight: bold;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            `;
            document.body.appendChild(this.counter);
        }
    }
    
    updateCounter() {
        if (this.counter) {
            const hoverInfo = this.lastHoveredWindow ? ` → ${this.lastHoveredWindow.title}` : '';
            this.counter.textContent = `${this.collectedVerses.length} verses selected${hoverInfo}`;
        }
    }
    
    hideCounter() {
        if (this.counter) {
            this.counter.remove();
            this.counter = null;
        }
    }
    
    getTextWindow(element) {
        // Works for both textareas and any element within a window
        for (const [id, window] of this.editor.textWindows) {
            if (window.element?.contains(element)) {
                return window;
            }
        }
        return null;
    }
    
    // Simplified validation - just check if we have a valid target window
    isValidDropTarget(targetWindow) {
        return targetWindow && targetWindow.id !== this.sourceWindowId;
    }
    
    // Use the last hovered window as the drop target
    getDropTargetWindow() {
        return this.lastHoveredWindow;
    }
    
    async translateFromDrag(dragData, targetTextarea, targetWindow = null) {
        if (!dragData) return;
        
        // Use the last hovered window if no specific target provided
        const actualTargetWindow = targetWindow || this.lastHoveredWindow;
        if (!actualTargetWindow) {
            console.error('No target window detected for translation');
            return;
        }
        
        const verses = Array.isArray(dragData) ? dragData : [dragData];
        
        // Show loading state on all target verses first
        const targetTextareas = [];
        for (const verse of verses) {
            let textarea = actualTargetWindow.element?.querySelector(`textarea[data-verse="${verse.verse}"]`);
            
            // If verse is not currently rendered, try to scroll to it first
            if (!textarea && window.translationEditor?.virtualScrollManager) {
                // Try to find the verse index and ensure it's loaded
                const verseIndex = this.findVerseIndex(verse.verse, actualTargetWindow.id);
                if (verseIndex !== null) {
                    await window.translationEditor.virtualScrollManager.scrollToVerseIndex(actualTargetWindow.id, verseIndex);
                    // Wait a bit for rendering
                    await new Promise(resolve => setTimeout(resolve, 500));
                    textarea = actualTargetWindow.element?.querySelector(`textarea[data-verse="${verse.verse}"]`);
                }
            }
            
            if (textarea) {
                targetTextareas.push(textarea);
                // Initial loading state
                textarea.style.borderColor = '#f59e0b';
                textarea.style.borderWidth = '2px';
                textarea.style.backgroundColor = '#fffbeb';
                textarea.disabled = true;
                textarea.placeholder = 'Queued for translation...';
            } else {
                // Verse not found - add placeholder
                targetTextareas.push(null);
                console.warn(`Could not find textarea for verse ${verse.verse} in window ${actualTargetWindow.id}`);
            }
        }
        
        // Translate each verse
        for (let i = 0; i < verses.length; i++) {
            const currentTextarea = targetTextareas[i];
            if (currentTextarea) {
                // Update to active translation state
                currentTextarea.style.borderColor = '#3b82f6';
                currentTextarea.style.backgroundColor = '#eff6ff';
                currentTextarea.placeholder = `Translating verse ${verses[i].verse}...`;
                
                await this.translateSingle(verses[i], currentTextarea, actualTargetWindow);
                
                // Success state
                currentTextarea.style.borderColor = '#10b981';
                currentTextarea.style.backgroundColor = '#f0fdf4';
                currentTextarea.placeholder = `Edit verse ${verses[i].verse} or drop text here...`;
                
                // Clear loading state after a brief success indication
                setTimeout(() => {
                    currentTextarea.style.borderColor = '';
                    currentTextarea.style.borderWidth = '';
                    currentTextarea.style.backgroundColor = '';
                    currentTextarea.disabled = false;
                }, 1000);
            }
            
            // Small delay between translations
            if (i < verses.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
    }
    
    async translateSingle(verse, textarea, targetWindow) {
        if (!verse.sourceText?.trim()) return;
        
        try {
            const project = await this.editor.getProjectInfo();
            
            // Get automatic translation settings based on current model
            const settings = this.editor.ui.getTranslationSettings();
            console.log('Automatic translation settings:', settings);
            
            // Check if target textarea already has content (test mode)
            const existingContent = textarea.value?.trim();
            const isTestMode = !!existingContent;
            
            const requestBody = {
                text: verse.sourceText,
                source_file_id: verse.sourceId,
                target_file_id: targetWindow?.id,
                target_language: targetWindow?.targetLanguage || project?.target_language,
                verse_reference: verse.reference,
                project_id: this.editor.projectId,
                temperature: settings.temperature,  // Always 0.2
                use_examples: settings.useExamples  // Auto-determined by model type
            };
            
            // Add test mode parameters if target has content
            if (isTestMode) {
                requestBody.is_test_mode = true;
                requestBody.ground_truth = existingContent;
                requestBody.exclude_verse_index = parseInt(textarea.dataset.verseIndex);
                console.log('Test mode enabled - comparing against existing translation');
            }
            
            const response = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            console.log('Translation response:', {
                success: data.success,
                examples_used: data.examples_used,
                used_examples: data.used_examples,
                temperature: data.temperature,
                model_used: data.model_used,
                test_mode: data.test_mode,
                similarity: data.similarity
            });
            
            if (data.success) {
                const verseIndex = parseInt(textarea.dataset.verseIndex);
                
                if (data.test_mode || isTestMode) {
                    // Display test results using dedicated component
                    this.editor.testResults.displayTestResult(textarea, data, verseIndex);
                    // CRITICAL: Never save test mode data - preserve ground truth
                    console.log('Test mode: preserving original content, not saving translation');
                } else {
                    // Regular translation display - confidence UI will handle saving when accepted
                    this.editor.confidence.displayTranslationWithConfidence(
                        textarea, data.translation, data.confidence, verseIndex, this.editor
                    );
                    // Don't auto-save here - let user accept/reject the translation
                    // The confidence component will handle saving with proper metadata
                }
            } else {
                // Error state
                textarea.style.borderColor = '#dc2626';
                textarea.style.backgroundColor = '#fef2f2';
                textarea.placeholder = `Translation failed for verse ${verse.verse}`;
                throw new Error(data.error || 'Translation failed');
            }
        } catch (error) {
            console.error('Translation error:', error);
            textarea.style.borderColor = '#dc2626';
            textarea.style.backgroundColor = '#fef2f2';
            textarea.placeholder = 'Translation failed';
        }
    }
    
    findVerseIndex(verseNumber, windowId) {
        // Try to find verse index from loaded ranges in virtual scroll manager
        const virtualScrollManager = window.translationEditor?.virtualScrollManager;
        if (!virtualScrollManager) return null;
        
        const ranges = virtualScrollManager.loadedRanges.get(windowId) || [];
        for (const range of ranges) {
            const verse = range.verses.find(v => v.verse === verseNumber);
            if (verse) {
                return verse.index;
            }
        }
        
        return null;
    }
}

window.TranslationDragDrop = TranslationDragDrop; 