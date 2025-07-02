// Simple Hover-to-Collect Verse Translation
class TranslationDragDrop {
    constructor(translationEditor) {
        this.editor = translationEditor;
        this.collectedVerses = [];
        this.collectedVerseNumbers = new Set(); // Track verse numbers to prevent duplicates
        this.isDragging = false;
        this.sourceWindowId = null;
        
        // Don't handle drops here - let text-window.js handle them
    }
    
    setupGlobalListeners() {
        // Not needed anymore
    }
    
    setupTextareaForMultiSelect(textarea) {
        // Listen for dragenter to collect verses as user drags over them
        textarea.addEventListener('dragenter', (e) => {
            if (!this.isDragging) return;
            
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
        });
    }
    
    startCollection(initialVerse) {
        // Don't pre-add the initial verse - let dragenter handle all collection
        this.collectedVerses = [];
        this.collectedVerseNumbers = new Set();
        this.isDragging = true;
        this.sourceWindowId = initialVerse.sourceId;
        
        // Show counter (will start at 0 until first dragenter)
        this.showCounter();
        this.updateCounter();
        
        console.log('Started collection from window:', this.sourceWindowId, 'Ready to collect verses');
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
            this.counter.textContent = `${this.collectedVerses.length} verses selected`;
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
    
    getWindowAtPosition(x, y) {
        // Find which window contains the mouse coordinates
        for (const [id, window] of this.editor.textWindows) {
            if (window.element) {
                const rect = window.element.getBoundingClientRect();
                if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                    return window;
                }
            }
        }
        return null;
    }
    
    // Check if drop target is valid (not the same window as source)
    isValidDropTarget(targetWindow) {
        return targetWindow && targetWindow.id !== this.sourceWindowId;
    }
    
    async translateFromDrag(dragData, targetTextarea, targetWindow = null) {
        if (!dragData) return;
        
        const verses = Array.isArray(dragData) ? dragData : [dragData];
        
        // Show loading state on all target verses first
        const targetTextareas = [];
        for (const verse of verses) {
            const textarea = targetWindow?.element?.querySelector(`textarea[data-verse="${verse.verse}"]`);
            if (textarea) {
                targetTextareas.push(textarea);
                // Initial loading state
                textarea.style.borderColor = '#f59e0b';
                textarea.style.borderWidth = '2px';
                textarea.style.backgroundColor = '#fffbeb';
                textarea.disabled = true;
                textarea.placeholder = 'Queued for translation...';
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
                
                await this.translateSingle(verses[i], currentTextarea, targetWindow);
                
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
            
            // Get current translation settings from UI
            const settings = this.editor.ui.getTranslationSettings();
            console.log('Translation request settings:', settings);
            
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
                temperature: settings.temperature,
                use_examples: settings.useExamples
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
                
                if (data.test_mode) {
                    // Display test results using dedicated component
                    this.editor.testResults.displayTestResult(textarea, data, verseIndex);
                    // DO NOT save in test mode - we want to preserve the ground truth!
                } else {
                    // Regular translation display
                    this.editor.confidence.displayTranslationWithConfidence(
                        textarea, data.translation, data.confidence, verseIndex, this.editor
                    );
                    // Only save when not in test mode
                    this.editor.saveSystem.bufferVerseChange(verseIndex, data.translation);
                }
            } else {
                // Error state
                textarea.style.borderColor = '#dc2626';
                textarea.style.backgroundColor = '#fef2f2';
                textarea.placeholder = `Translation failed for verse ${verse.verse}`;
                throw new Error(data.error || 'Translation failed');
            }
        } catch (error) {
            // Error state
            textarea.style.borderColor = '#dc2626';
            textarea.style.backgroundColor = '#fef2f2';
            textarea.placeholder = `Error translating verse ${verse.verse}`;
            console.error('Translation failed:', error);
            
            // Clear error state after a longer delay
            setTimeout(() => {
                textarea.style.borderColor = '';
                textarea.style.borderWidth = '';
                textarea.style.backgroundColor = '';
                textarea.disabled = false;
                textarea.placeholder = `Edit verse ${verse.verse} or drop text here...`;
            }, 3000);
        }
    }
}

window.TranslationDragDrop = TranslationDragDrop; 