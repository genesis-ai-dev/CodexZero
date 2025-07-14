// Unified Text Window Class - OPTIMIZED for Performance
class TextWindow {
    constructor(id, data, type, title, targetLanguage = null) {
        this.id = id;
        this.data = data;
        this.type = type;
        this.title = title;
        this.targetLanguage = targetLanguage; 
        this.element = null;
        this.audioManager = new AudioManager(id);
        
        // PERFORMANCE: Simple rendering - no virtual scrolling
        
        // PERFORMANCE: Lazy loading flags
        this.audioControlsLoaded = false;
        this.dragListenersSetup = false;
    }
    
    render(container) {
        const textWindow = document.createElement('div');
        textWindow.className = `flex flex-col border border-neutral-200 rounded-xl overflow-hidden bg-white min-h-15 flex-1 shadow-sm`;
        textWindow.dataset.textId = this.id;
        textWindow.dataset.windowId = this.id;
        
        textWindow.appendChild(this.createHeader());
        textWindow.appendChild(this.createContent());
        
        container.appendChild(textWindow);
        this.element = textWindow;
        
        this.addWindowDropListeners(textWindow);
        PurposeManager.setupPurposeListeners(textWindow);
        
        return textWindow;
    }
    

    

    
    createHeader() {
        const header = document.createElement('div');
        header.className = `px-4 py-3 text-sm font-bold border-b border-neutral-200 flex items-center justify-between flex-shrink-0 tracking-wide cursor-grab active:cursor-grabbing bg-neutral-50 text-neutral-800`;
        header.draggable = true;
        header.setAttribute('data-window-header', 'true');
        
        const downloadButton = this.createDownloadButton();
        const plusButton = this.createPlusButton();
        const closeButton = `<button class="text-red-600 rounded p-1 close-text-btn" 
                       data-text-id="${this.id}" 
                       title="Remove this text">
                   <i class="fas fa-times text-xs"></i>
               </button>`;
        
        header.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-edit mr-2"></i>
                <span>${this.title}</span>
            </div>
            <div class="flex items-center gap-2">
                ${closeButton}
            </div>
        `;
        
        const rightContainer = header.querySelector('div:last-child');
        rightContainer.insertBefore(downloadButton, rightContainer.firstChild);
        rightContainer.insertBefore(plusButton, rightContainer.firstChild);
        
        header.addEventListener('dragstart', (e) => {
            const windowData = {
                type: 'text-window',
                textId: this.id,
                windowTitle: this.title
            };
            e.dataTransfer.setData('application/json', JSON.stringify(windowData));
            e.dataTransfer.effectAllowed = 'move';
            header.classList.add('dragging');
        });
        
        header.addEventListener('dragend', () => {
            header.classList.remove('dragging');
        });
        
        return header;
    }
    


    createDownloadButton() {
        const downloadContainer = document.createElement('div');
        downloadContainer.className = 'relative inline-block';
        
        const downloadToggle = document.createElement('button');
        downloadToggle.className = 'text-gray-600 rounded p-1';
        downloadToggle.title = 'Download chapter';
        downloadToggle.innerHTML = '<i class="fas fa-download text-xs"></i>';
        
        const downloadDropdown = document.createElement('div');
        downloadDropdown.className = 'absolute top-full right-0 bg-white border border-neutral-200 rounded-xl py-2 hidden z-50 shadow-xl min-w-36';
        
        const txtButton = document.createElement('button');
        txtButton.className = 'w-full text-left px-4 py-2 text-sm flex items-center';
        txtButton.innerHTML = '<i class="fas fa-file-alt mr-2 text-gray-500"></i>Download as TXT';
        txtButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.downloadChapter('txt');
            downloadDropdown.classList.add('hidden');
        });
        
        const usfmButton = document.createElement('button');
        usfmButton.className = 'w-full text-left px-4 py-2 text-sm flex items-center';
        usfmButton.innerHTML = '<i class="fas fa-code mr-2 text-gray-500"></i>Download as USFM';
        usfmButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.downloadChapter('usfm');
            downloadDropdown.classList.add('hidden');
        });
        
        downloadDropdown.appendChild(txtButton);
        downloadDropdown.appendChild(usfmButton);
        
        downloadToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            downloadDropdown.classList.toggle('hidden');
            
            // Close other dropdowns
            document.querySelectorAll('.download-dropdown:not(.hidden)').forEach(other => {
                if (other !== downloadDropdown) {
                    other.classList.add('hidden');
                }
            });
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!downloadContainer.contains(e.target)) {
                downloadDropdown.classList.add('hidden');
            }
        });
        
        downloadContainer.appendChild(downloadToggle);
        downloadContainer.appendChild(downloadDropdown);
        downloadDropdown.classList.add('download-dropdown');
        
        return downloadContainer;
    }

    createPlusButton() {
        const plusButton = document.createElement('button');
        plusButton.className = 'text-gray-600 rounded p-1';
        plusButton.title = 'Load additional text';
        plusButton.innerHTML = '<i class="fas fa-plus text-xs"></i>';

        plusButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openTextSelectionModal();
        });

        return plusButton;
    }

    openTextSelectionModal() {
        const isPrimary = this.type === 'primary';
        window.translationEditor.ui.showTextSelectionModal(isPrimary);
    }

    downloadChapter(format) {
        if (!this.data?.verses || this.data.verses.length === 0) {
            alert('No verses available to download');
            return;
        }

        let content = '';
        let filename = '';
        
        // Get chapter info from the translation editor if available
        const editor = window.translationEditor;
        const book = editor?.currentBook || 'Unknown';
        const chapter = editor?.currentChapter || '1';
        const safeName = this.title.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
        
        if (format === 'txt') {
            // Simple text format - one verse per line
            content = this.data.verses.map(verse => {
                const text = verse.target_text || verse.source_text || '';
                return text.trim();
            }).filter(text => text.length > 0).join('\n');
            
            filename = `${safeName}_${book}_${chapter}.txt`;
        } else if (format === 'usfm') {
            // USFM format
            const bookCode = this.getBookCode(book);
            content = `\\id ${bookCode.toUpperCase()}\n\\c ${chapter}\n`;
            
            this.data.verses.forEach(verse => {
                const text = verse.target_text || verse.source_text || '';
                if (text.trim()) {
                    content += `\\v ${verse.verse} ${text.trim()}\n`;
                }
            });
            
            filename = `${safeName}_${book}_${chapter}.usfm`;
        }
        
        if (!content.trim()) {
            alert('No content available to download');
            return;
        }
        
        // Create and trigger download
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    getBookCode(bookName) {
        // Simple book name to USFM code mapping
        const bookCodes = {
            'Genesis': 'GEN',
            'Exodus': 'EXO',
            'Leviticus': 'LEV',
            'Numbers': 'NUM',
            'Deuteronomy': 'DEU',
            'Joshua': 'JOS',
            'Judges': 'JDG',
            'Ruth': 'RUT',
            '1 Samuel': '1SA',
            '2 Samuel': '2SA',
            '1 Kings': '1KI',
            '2 Kings': '2KI',
            '1 Chronicles': '1CH',
            '2 Chronicles': '2CH',
            'Ezra': 'EZR',
            'Nehemiah': 'NEH',
            'Esther': 'EST',
            'Job': 'JOB',
            'Psalms': 'PSA',
            'Proverbs': 'PRO',
            'Ecclesiastes': 'ECC',
            'Song of Solomon': 'SNG',
            'Isaiah': 'ISA',
            'Jeremiah': 'JER',
            'Lamentations': 'LAM',
            'Ezekiel': 'EZK',
            'Daniel': 'DAN',
            'Hosea': 'HOS',
            'Joel': 'JOL',
            'Amos': 'AMO',
            'Obadiah': 'OBA',
            'Jonah': 'JON',
            'Micah': 'MIC',
            'Nahum': 'NAM',
            'Habakkuk': 'HAB',
            'Zephaniah': 'ZEP',
            'Haggai': 'HAG',
            'Zechariah': 'ZEC',
            'Malachi': 'MAL',
            'Matthew': 'MAT',
            'Mark': 'MRK',
            'Luke': 'LUK',
            'John': 'JHN',
            'Acts': 'ACT',
            'Romans': 'ROM',
            '1 Corinthians': '1CO',
            '2 Corinthians': '2CO',
            'Galatians': 'GAL',
            'Ephesians': 'EPH',
            'Philippians': 'PHP',
            'Colossians': 'COL',
            '1 Thessalonians': '1TH',
            '2 Thessalonians': '2TH',
            '1 Timothy': '1TI',
            '2 Timothy': '2TI',
            'Titus': 'TIT',
            'Philemon': 'PHM',
            'Hebrews': 'HEB',
            'James': 'JAS',
            '1 Peter': '1PE',
            '2 Peter': '2PE',
            '1 John': '1JN',
            '2 John': '2JN',
            '3 John': '3JN',
            'Jude': 'JUD',
            'Revelation': 'REV'
        };
        
        return bookCodes[bookName] || bookName.substring(0, 3).toUpperCase();
    }
    
    createContent() {
        const content = document.createElement('div');
        content.className = 'flex-1 overflow-y-auto overflow-x-hidden p-4 leading-tight text-sm bg-white';
        content.setAttribute('data-window-content', 'true');
        
        if (!this.data?.verses) {
            content.innerHTML = '<div class="text-neutral-400 text-center py-8">No verses loaded</div>';
            return content;
        }
        
        // Add purpose section
        const purposeSection = this.createPurposeSection();
        content.appendChild(purposeSection);
        
        // PERFORMANCE: Simple rendering - no virtual scrolling
        this.renderAllVerses(content);
        
        return content;
    }
    
    setupProgressiveLoading(container) {
        // PERFORMANCE: Simple rendering - no progressive loading
        const fragment = document.createDocumentFragment();
        
        this.data.verses.forEach(verseData => {
            const verseWrapper = this.createVerseElement(verseData, false);
            fragment.appendChild(verseWrapper);
        });
        
        container.appendChild(fragment);
        
        // PERFORMANCE: Simple scroll sync between windows
        this.setupScrollSync(container);
    }
    
    setupScrollSync(container) {
        // PERFORMANCE: Simple scroll sync without expensive calculations
        let syncTimeout;
        
        container.addEventListener('scroll', () => {
            // PERFORMANCE: Debounce scroll sync to avoid excessive calculations
            if (syncTimeout) clearTimeout(syncTimeout);
            syncTimeout = setTimeout(() => {
                // PERFORMANCE: Use simple percentage-based sync
                const scrollPercent = container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight);
                
                // PERFORMANCE: Cache container query and sync only visible containers
                const otherContainers = document.querySelectorAll('[data-window-content]');
                otherContainers.forEach(otherContainer => {
                    if (otherContainer !== container && otherContainer.offsetParent) {
                        const maxScroll = otherContainer.scrollHeight - otherContainer.clientHeight;
                        if (maxScroll > 0) {
                            const targetScroll = scrollPercent * maxScroll;
                            // PERFORMANCE: Use smooth scrolling for better UX
                            otherContainer.scrollTo({
                                top: targetScroll,
                                behavior: 'smooth'
                            });
                        }
                    }
                });
            }, 100); // Increased debounce delay for better performance
        }, { passive: true });
    }
    
    createPurposeSection() {
        const purposeSection = document.createElement('div');
        purposeSection.className = 'mb-4 p-3 bg-gray-50 border border-gray-200 rounded-sm';
        
        const currentPurpose = this.data?.purpose_description || this.data?.description || '';
        const isTranslation = this.id.includes('translation_');
        
        // Fix the ID extraction logic to handle different prefixes correctly
        let extractedId = this.id;
        if (isTranslation) {
            extractedId = this.id.replace('translation_', '');
        } else if (this.id.startsWith('text_')) {
            extractedId = this.id.replace('text_', '');
        } else if (this.id.startsWith('file_')) {
            extractedId = this.id.replace('file_', '');
        }
        
        purposeSection.innerHTML = `
            <label class="block text-xs font-semibold text-gray-700 mb-1">${isTranslation ? 'Translation Purpose' : 'File Purpose'}</label>
            <textarea class="w-full px-2 py-1 border border-gray-300 bg-white text-xs resize-none ${isTranslation ? 'translation-purpose-input' : 'purpose-input'}" 
                      rows="2" 
                      placeholder="e.g., This is a back translation, This is a translation into Spanish..."
                      data-${isTranslation ? 'translation-id' : 'file-id'}="${extractedId}"
                      maxlength="1000">${currentPurpose}</textarea>
            <div class="flex justify-between items-center mt-1">
                <span class="text-xs text-gray-500 char-counter">${currentPurpose.length}/1,000</span>
                <button class="${isTranslation ? 'save-translation-purpose-btn' : 'save-purpose-btn'} inline-flex items-center px-2 py-1 text-xs font-semibold bg-blue-600 text-white rounded-sm"
                        data-${isTranslation ? 'translation-id' : 'file-id'}="${extractedId}">
                    <i class="fas fa-save mr-1"></i>Save
                </button>
            </div>
        `;
        
        return purposeSection;
    }
    
    renderAllVerses(container) {
        // PERFORMANCE: Use DocumentFragment for batch DOM updates
        const fragment = document.createDocumentFragment();
        
        this.data.verses.forEach(verseData => {
            const verseWrapper = this.createVerseElement(verseData, false); // false = not virtualized
            fragment.appendChild(verseWrapper);
        });
        
        container.appendChild(fragment);
    }
    


    
    createVerseElement(verseData, isVirtualized = false) {
        // PERFORMANCE: Use pooled elements
        const verseWrapper = document.createElement('div');
        verseWrapper.className = 'verse-cell relative mb-4 border border-stone-300 rounded-sm overflow-hidden bg-white';
        verseWrapper.dataset.verse = verseData.verse;
        verseWrapper.dataset.verseCell = 'true';
        
        // PERFORMANCE: Create navigation bar with pooled elements
        const navBar = document.createElement('div');
        navBar.className = 'flex items-center justify-between px-3 py-0.5 bg-gray-50 border-b border-gray-200 min-h-[22px]';
        
        // PERFORMANCE: Reuse verse label
        const verseLabel = document.createElement('div');
        const labelClasses = this.type === 'primary' ? 
            'text-red-600 bg-red-50' : 
            'text-blue-600 bg-blue-50';
        verseLabel.className = `text-xs font-semibold px-2 py-1 rounded-sm ${labelClasses}`;
        verseLabel.textContent = verseData.reference;
        
        // PERFORMANCE: Reuse controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'flex items-center gap-1';
        
        navBar.appendChild(verseLabel);
        navBar.appendChild(controlsContainer);
        verseWrapper.appendChild(navBar);
        
        const textarea = this.createOptimizedTextarea(verseData);
        verseWrapper.appendChild(textarea);
        
        // PERFORMANCE: Batch control setup to reduce DOM queries
        this.setupVerseControlsBatched(controlsContainer, verseData, textarea, verseWrapper);
        
        return verseWrapper;
    }
    
    createOptimizedTextarea(verseData) {
        const textarea = document.createElement('textarea');
        textarea.className = `w-full p-4 border-0 text-base leading-7 resize-none focus:ring-0 focus:outline-none bg-white font-['Inter'] overflow-hidden`;
        textarea.placeholder = `Edit verse ${verseData.verse} or drop text here...`;
        textarea.dataset.verse = verseData.verse;
        textarea.dataset.verseIndex = verseData.index;
        textarea.value = verseData.target_text || verseData.source_text || '';
        textarea.draggable = false;
        
        // PERFORMANCE: Set proper height immediately based on content
        const lines = (textarea.value || '').split('\n').length;
        const minHeight = Math.max(80, lines * 24 + 32); // 24px per line + padding
        textarea.style.height = minHeight + 'px';
        
        // Disable editing for viewers
        if (window.translationEditor && !window.translationEditor.canEdit) {
            textarea.disabled = true;
            textarea.style.backgroundColor = '#f9fafb';
            textarea.style.cursor = 'not-allowed';
            textarea.placeholder = 'Read-only mode - Editor access required to edit';
            textarea.title = 'Editor access required to edit translations';
        }
        
        // PERFORMANCE: Use optimized event handlers
        this.attachOptimizedTextareaListeners(textarea);
        
        return textarea;
    }
    
    attachOptimizedTextareaListeners(textarea) {
        // PERFORMANCE: SIMPLEST POSSIBLE - just store the value
        let currentValue = '';
        let resizeTimeout;
        
        textarea.addEventListener('input', (e) => {
            currentValue = e.target.value; // Just store, no processing
            
            // PERFORMANCE: Debounce height adjustment to prevent scroll jank
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const lines = currentValue.split('\n').length;
                const newHeight = Math.max(80, lines * 24 + 32);
                if (Math.abs(textarea.offsetHeight - newHeight) > 20) { // Increased threshold
                    textarea.style.height = newHeight + 'px';
                }
            }, 150); // Debounce for 150ms
        }, { passive: true });
        
        // PERFORMANCE: Only process on blur
        textarea.addEventListener('blur', () => {
            if (window.translationEditor?.saveSystem) {
                const verseIndex = parseInt(textarea.dataset.verseIndex);
                if (!isNaN(verseIndex)) {
                    window.translationEditor.saveSystem.bufferVerseChange(verseIndex, currentValue);
                }
            }
        }, { passive: true });
        
        // PERFORMANCE: Remove all other listeners - no focus handlers, no resize handlers
    }
    
    // PERFORMANCE: Resize functions removed - textareas are proper size from start
    
    setupVerseControlsBatched(controlsContainer, verseData, textarea, verseWrapper) {
        // PERFORMANCE: Batch all control creation to reduce DOM operations
        const fragment = document.createDocumentFragment();
        
        // History button for all users (viewers can see history)
        if (window.translationEditor) {
            const historyButton = document.createElement('button');
            historyButton.className = 'w-6 h-6 bg-transparent border-0 cursor-pointer flex items-center justify-center text-gray-400 rounded-sm hover:text-gray-600 history-btn';
            historyButton.innerHTML = '<i class="fas fa-history text-xs"></i>';
            historyButton.title = 'View edit history';
            historyButton.setAttribute('data-verse-index', verseData.index);
            
            historyButton.onclick = () => this.showVerseHistory(verseData, textarea);
            fragment.appendChild(historyButton);
        }
        
        // Only add editing controls for editors
        if (window.translationEditor?.canEdit) {
            // Primary window gets sparkle button
            if (this.type === 'primary') {
                // PERFORMANCE: Create audio placeholder
                const audioPlaceholder = document.createElement('div');
                audioPlaceholder.className = 'audio-placeholder w-5 h-5 bg-gray-100 rounded cursor-pointer flex items-center justify-center';
                audioPlaceholder.innerHTML = '<i class="fas fa-volume-up text-xs text-gray-400"></i>';
                audioPlaceholder.title = 'Click to load audio controls';
                
                // PERFORMANCE: Use single onclick handler
                audioPlaceholder.onclick = () => this.loadAudioControls(controlsContainer, audioPlaceholder, verseData, textarea);
                
                fragment.appendChild(audioPlaceholder);
                
                // PERFORMANCE: Create sparkle button
                const sparkleButton = document.createElement('button');
                sparkleButton.className = 'w-7 h-7 bg-transparent border-0 cursor-pointer flex items-center justify-center text-gray-400 rounded-sm sparkle-translate-btn';
                sparkleButton.innerHTML = '<i class="fas fa-magic text-sm"></i>';
                sparkleButton.title = 'Translate this verse with AI';
                sparkleButton.setAttribute('data-verse', verseData.verse);
                sparkleButton.setAttribute('data-verse-index', verseData.index);
                
                // PERFORMANCE: Store handler reference for efficient cleanup
                sparkleButton._clickHandler = (e) => this.handleSparkleClick(e, verseData, textarea, sparkleButton);
                sparkleButton.onclick = sparkleButton._clickHandler;
                
                fragment.appendChild(sparkleButton);
            }
            
            // PERFORMANCE: Create drag handle
            const dragHandle = document.createElement('div');
            dragHandle.className = 'w-7 h-7 bg-gray-100 border border-gray-300 rounded-sm cursor-move flex items-center justify-center sparkle-drag-handle';
            dragHandle.innerHTML = '<i class="fas fa-arrows-alt text-sm text-gray-500"></i>';
            dragHandle.title = 'Drag to translate';
            dragHandle.draggable = true;
            
            // PERFORMANCE: Store handler references for efficient cleanup
            dragHandle._dragStartHandler = (e) => this.handleDragStart(e, verseData, textarea, dragHandle);
            dragHandle._dragEndHandler = (e) => this.handleDragEnd(e, verseData, textarea, dragHandle);
            dragHandle.ondragstart = dragHandle._dragStartHandler;
            dragHandle.ondragend = dragHandle._dragEndHandler;
            
            fragment.appendChild(dragHandle);
        }
        
        // PERFORMANCE: Single DOM append instead of multiple
        controlsContainer.appendChild(fragment);
    }
    
    showVerseHistory(verseData, textarea) {
        // Get text ID from window ID (strip text_ prefix if present)
        const textId = this.id.startsWith('text_') ? 
            parseInt(this.id.replace('text_', '')) : 
            parseInt(this.id);
        
        // Initialize history modal if not already done
        if (!window.translationEditor.verseHistory) {
            window.translationEditor.verseHistory = new VerseHistory(window.translationEditor);
        }
        
        // Show history for this verse
        window.translationEditor.verseHistory.showHistory(textId, verseData.index);
    }
    
    // Removed - using batched controls now
    
    // Removed - using optimized audio loading now
    
    // Removed - using pooled elements now
    
    // Removed - using pooled elements now
    
    // Removed - using optimized drag handlers now
    
    // Removed - using optimized sparkle handler now
    

    

    

    

    

    

    

    
    addWindowDropListeners(windowElement) {
        windowElement.addEventListener('dragover', (e) => {
            e.preventDefault();
            
            // Check if this is a valid drop target
            const dragDrop = window.translationEditor?.dragDrop;
            if (dragDrop && dragDrop.isDragging) {
                if (dragDrop.isValidDropTarget(this)) {
                    e.dataTransfer.dropEffect = 'copy';
                    windowElement.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.5)';
                    windowElement.style.backgroundColor = 'rgba(16, 185, 129, 0.05)';
                } else {
                    e.dataTransfer.dropEffect = 'none';
                    windowElement.style.boxShadow = '0 0 0 3px rgba(239, 68, 68, 0.5)';
                    windowElement.style.backgroundColor = 'rgba(239, 68, 68, 0.05)';
                }
            } else {
                e.dataTransfer.dropEffect = 'copy';
                windowElement.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.5)';
                windowElement.style.backgroundColor = 'rgba(16, 185, 129, 0.05)';
            }
        });
        
        windowElement.addEventListener('dragleave', (e) => {
            if (!windowElement.contains(e.relatedTarget)) {
                windowElement.style.boxShadow = '';
                windowElement.style.backgroundColor = '';
            }
        });
        
        windowElement.addEventListener('drop', async (e) => {
            e.preventDefault();
            windowElement.style.boxShadow = '';
            windowElement.style.backgroundColor = '';
            
            try {
                let dragData;
                
                // Get collected verses if collection system is active
                if (window.translationEditor?.dragDrop?.isDragging) {
                    // Always end collection, but use the last hovered window (which should be this one)
                    dragData = window.translationEditor.dragDrop.endCollection();
                    
                    // Use the translation drag drop system with last hovered window
                    if (dragData && dragData.length > 0) {
                        console.log('Processing drag with last hovered window:', this.title);
                        await window.translationEditor.dragDrop.translateFromDrag(dragData, null, this);
                        return;
                    }
                } else {
                    // Fallback to single verse
                    dragData = [JSON.parse(e.dataTransfer.getData('text/plain'))];
                    await this.processWindowDrop(dragData);
                }
                
            } catch (error) {
                console.error('Error processing window drop:', error);
                alert('Failed to process dropped text');
            }
        });
    }
    
    async processWindowDrop(draggedVerses) {
        if (!Array.isArray(draggedVerses) || draggedVerses.length === 0) {
            return;
        }
        
        // Find corresponding textareas in this window based on verse numbers
        for (const draggedVerse of draggedVerses) {
            const targetTextarea = this.element.querySelector(`textarea[data-verse="${draggedVerse.verse}"]`);
            
            if (targetTextarea) {
                // Show visual feedback
                targetTextarea.style.borderColor = '#10b981';
                targetTextarea.style.borderWidth = '2px';
                targetTextarea.placeholder = 'Translating...';
                targetTextarea.disabled = true;
                
                try {
                    // Call the translation system
                    await window.translationEditor.translateFromDrag(draggedVerse, targetTextarea, this);
                    
                    // Success feedback
                    targetTextarea.style.borderColor = '#059669';
                    setTimeout(() => {
                        targetTextarea.style.borderColor = '';
                        targetTextarea.style.borderWidth = '';
                        targetTextarea.disabled = false;
                        targetTextarea.placeholder = `Edit verse ${draggedVerse.verse} or drop text here...`;
                    }, 1000);
                    
                } catch (error) {
                    console.error(`Error translating verse ${draggedVerse.verse}:`, error);
                    
                    // Error feedback
                    targetTextarea.style.borderColor = '#dc2626';
                    setTimeout(() => {
                        targetTextarea.style.borderColor = '';
                        targetTextarea.style.borderWidth = '';
                        targetTextarea.disabled = false;
                        targetTextarea.placeholder = `Edit verse ${draggedVerse.verse} or drop text here...`;
                    }, 2000);
                }
                
                // Small delay between translations to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
    }

    // PERFORMANCE: Optimized audio loading
    loadAudioControls(controlsContainer, placeholder, verseData, textarea) {
        if (!this.audioControlsLoaded) {
            controlsContainer.removeChild(placeholder);
            this.audioManager.createAudioControls(controlsContainer, verseData, textarea);
            this.audioControlsLoaded = true;
        }
    }
    
    // PERFORMANCE: Optimized sparkle click handler
    async handleSparkleClick(e, verseData, textarea, sparkleButton) {
        e.preventDefault();
        e.stopPropagation();
        
        // Find source text from other windows
        let sourceText = '';
        let sourceWindow = null;
        
        // PERFORMANCE: Cache textWindows to avoid repeated access
        const textWindows = window.translationEditor.textWindows;
        
        for (const [id, textWindow] of textWindows) {
            if (textWindow.id !== this.id) {
                const sourceTextarea = textWindow.element?.querySelector(`textarea[data-verse="${verseData.verse}"]`);
                if (sourceTextarea && sourceTextarea.value?.trim()) {
                    sourceText = sourceTextarea.value.trim();
                    sourceWindow = textWindow;
                    break;
                }
            }
        }
        
        if (!sourceText) {
            // PERFORMANCE: Simple error indication
            sparkleButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
            sparkleButton.style.color = '#dc2626';
            setTimeout(() => {
                sparkleButton.innerHTML = '<i class="fas fa-magic"></i>';
                sparkleButton.style.color = '';
            }, 1000);
            return;
        }
        
        // Create drag data and use existing translation system
        const dragData = {
            sourceText: sourceText,
            sourceId: sourceWindow.id,
            verse: verseData.verse,
            reference: verseData.reference,
            sourceType: sourceWindow.type,
            sourceTitle: sourceWindow.title
        };
        
        // Show loading
        sparkleButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sparkleButton.style.color = '#3b82f6';
        
        try {
            await window.translationEditor.translateFromDrag(dragData, textarea, this);
            
            // Success
            sparkleButton.innerHTML = '<i class="fas fa-check"></i>';
            sparkleButton.style.color = '#10b981';
            setTimeout(() => {
                sparkleButton.innerHTML = '<i class="fas fa-magic"></i>';
                sparkleButton.style.color = '';
            }, 1000);
            
        } catch (error) {
            // Error
            sparkleButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
            sparkleButton.style.color = '#dc2626';
            setTimeout(() => {
                sparkleButton.innerHTML = '<i class="fas fa-magic"></i>';
                sparkleButton.style.color = '';
            }, 1000);
        }
    }
    
    // PERFORMANCE: Optimized drag handlers
    handleDragStart(e, verseData, textarea, dragHandle) {
        const container = dragHandle.closest('[data-verse]');
        
        const dragData = {
            sourceText: textarea.value || '',
            sourceId: this.id,
            verse: verseData.verse,
            reference: verseData.reference,
            sourceType: this.type,
            sourceTitle: this.title
        };
        
        if (window.translationEditor?.dragDrop) {
            window.translationEditor.dragDrop.startCollection(dragData);
            
            // PERFORMANCE: Direct style assignment
            textarea.style.cssText = 'background-color: #dbeafe; border-color: #3b82f6; border-width: 2px;';
        }
        
        e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = 'copy';
        
        container.className += ' opacity-70 bg-blue-100 border border-blue-500 rounded';
    }
    
    handleDragEnd(e, verseData, textarea, dragHandle) {
        const container = dragHandle.closest('[data-verse]');
        
        container.className = container.className.replace(' opacity-70 bg-blue-100 border border-blue-500 rounded', '');
        
        // PERFORMANCE: Clear styles directly
        textarea.style.cssText = '';
    }
}

// Make available globally
window.TextWindow = TextWindow; 