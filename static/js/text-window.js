// Unified Text Window Class
class TextWindow {
    constructor(id, data, type, title, targetLanguage = null) {
        this.id = id;
        this.data = data;
        this.type = type;
        this.title = title;
        this.targetLanguage = targetLanguage; 
        this.element = null;
        this.themeManager = new ThemeManager(id);
        this.audioManager = new AudioManager(id);
    }
    

    
    render(container) {
        const textWindow = document.createElement('div');
        textWindow.className = `flex flex-col border rounded-sm overflow-hidden bg-white min-h-15 flex-1 transition-all duration-200 ${this.themeManager.getThemeClasses()}`;
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
        header.className = `px-4 py-3 text-sm font-bold border-b flex items-center justify-between flex-shrink-0 uppercase tracking-wider cursor-grab active:cursor-grabbing ${this.themeManager.getHeaderThemeClasses()}`;
        header.draggable = true;
        header.setAttribute('data-window-header', 'true');
        
        const downloadButton = this.createDownloadButton();
        const plusButton = this.createPlusButton();
        const closeButton = `<button class="text-red-600 hover:text-red-800 hover:bg-red-100 rounded p-1 transition-colors close-text-btn" 
                       data-text-id="${this.id}" 
                       title="Remove this text">
                   <i class="fas fa-times text-xs"></i>
               </button>`;
        
        const colorPicker = this.themeManager.createColorPicker();
        
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
        rightContainer.insertBefore(colorPicker, rightContainer.firstChild);
        
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
    
    createColorPicker() {
        const colorPicker = document.createElement('div');
        colorPicker.className = 'relative inline-block';
        
        const toggle = document.createElement('div');
        toggle.className = 'w-5 h-5 border border-current rounded cursor-pointer transition-all duration-200 flex items-center justify-center hover:scale-110 hover:shadow-sm';
        toggle.title = 'Change window color';
        toggle.innerHTML = '<i class="fas fa-palette text-xs opacity-70"></i>';
        
        const dropdown = document.createElement('div');
        dropdown.className = 'absolute top-full right-0 bg-white border border-gray-800 rounded-md p-3 hidden z-50 shadow-xl';
        
        const colorOptions = document.createElement('div');
        colorOptions.className = 'grid grid-cols-3 gap-2 w-24';
        
        const themes = [
            { class: 'theme-default', name: 'Default', gradient: 'from-gray-800 to-gray-600' },
            { class: 'theme-blue', name: 'Blue', gradient: 'from-blue-600 to-blue-500' },
            { class: 'theme-green', name: 'Green', gradient: 'from-green-600 to-green-500' },
            { class: 'theme-purple', name: 'Purple', gradient: 'from-purple-600 to-purple-500' },
            { class: 'theme-orange', name: 'Orange', gradient: 'from-orange-600 to-orange-500' },
            { class: 'theme-pink', name: 'Pink', gradient: 'from-pink-600 to-pink-500' },
            { class: 'theme-teal', name: 'Teal', gradient: 'from-teal-600 to-teal-500' }
        ];
        
        themes.forEach(theme => {
            const option = document.createElement('div');
            option.className = `w-6 h-6 border border-transparent rounded cursor-pointer transition-all duration-200 relative bg-gradient-to-br ${theme.gradient} hover:scale-110 hover:border-gray-400`;
            option.title = theme.name;
            option.setAttribute('data-theme-option', theme.class);
            
            if (theme.class === this.colorTheme) {
                option.classList.add('border-gray-800', 'border-2');
                option.innerHTML = '<div class="absolute inset-0 flex items-center justify-center text-white text-xs font-bold">✓</div>';
            }
            
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                this.setColorTheme(theme.class);
                dropdown.classList.add('hidden');
                dropdown.classList.remove('block');
            });
            
            colorOptions.appendChild(option);
        });
        
        dropdown.appendChild(colorOptions);
        
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.classList.toggle('hidden');
            dropdown.classList.toggle('block');
            
            document.querySelectorAll('.color-picker-dropdown:not(.hidden)').forEach(other => {
                if (other !== dropdown) {
                    other.classList.add('hidden');
                    other.classList.remove('block');
                }
            });
        });
        
        document.addEventListener('click', (e) => {
            if (!colorPicker.contains(e.target)) {
                dropdown.classList.add('hidden');
                dropdown.classList.remove('block');
            }
        });
        
        colorPicker.appendChild(toggle);
        colorPicker.appendChild(dropdown);
        
        return colorPicker;
    }

    createDownloadButton() {
        const downloadContainer = document.createElement('div');
        downloadContainer.className = 'relative inline-block';
        
        const downloadToggle = document.createElement('button');
        downloadToggle.className = 'text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded p-1 transition-colors';
        downloadToggle.title = 'Download chapter';
        downloadToggle.innerHTML = '<i class="fas fa-download text-xs"></i>';
        
        const downloadDropdown = document.createElement('div');
        downloadDropdown.className = 'absolute top-full right-0 bg-white border-2 border-gray-800 rounded-md py-2 hidden z-50 shadow-xl min-w-36';
        
        const txtButton = document.createElement('button');
        txtButton.className = 'w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center';
        txtButton.innerHTML = '<i class="fas fa-file-alt mr-2 text-gray-500"></i>Download as TXT';
        txtButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.downloadChapter('txt');
            downloadDropdown.classList.add('hidden');
        });
        
        const usfmButton = document.createElement('button');
        usfmButton.className = 'w-full text-left px-4 py-2 text-sm hover:bg-gray-100 flex items-center';
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
        plusButton.className = 'text-gray-600 hover:text-green-600 hover:bg-green-50 rounded p-1 transition-colors';
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
        content.className = 'flex-1 overflow-y-auto overflow-x-hidden p-4 leading-tight text-sm bg-white scroll-smooth';
        content.setAttribute('data-window-content', 'true');
        
        if (!this.data?.verses) {
            content.innerHTML = '<div class="text-neutral-400 text-center py-8">No verses loaded</div>';
            return content;
        }
        
        // Add simple purpose section at the top
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
                <button class="${isTranslation ? 'save-translation-purpose-btn' : 'save-purpose-btn'} inline-flex items-center px-2 py-1 text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors rounded-sm"
                        data-${isTranslation ? 'translation-id' : 'file-id'}="${extractedId}">
                    <i class="fas fa-save mr-1"></i>Save
                </button>
            </div>
        `;
        content.appendChild(purposeSection);
        
        this.data.verses.forEach(verseData => {
            const verseWrapper = this.createVerseElement(verseData);
            content.appendChild(verseWrapper);
        });
        
        return content;
    }
    


    
    createVerseElement(verseData) {
        const verseWrapper = document.createElement('div');
        verseWrapper.className = 'verse-cell relative mb-4 transition-all duration-200 group border border-stone-300 rounded-sm overflow-hidden bg-white hover:border-stone-400';
        verseWrapper.dataset.verse = verseData.verse;
        verseWrapper.dataset.verseCell = 'true';
        
        // Create navigation bar
        const navBar = document.createElement('div');
        navBar.className = 'flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200 min-h-[40px]';
        
        // Left side - verse reference
        const verseLabel = document.createElement('div');
        const labelClasses = this.type === 'primary' ? 
            'text-red-600 bg-red-50' : 
            'text-blue-600 bg-blue-50';
        verseLabel.className = `text-xs font-semibold px-2 py-1 rounded-sm ${labelClasses}`;
        verseLabel.textContent = verseData.reference;
        
        // Right side - controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'flex items-center gap-1';
        
        navBar.appendChild(verseLabel);
        navBar.appendChild(controlsContainer);
        verseWrapper.appendChild(navBar);
        
        const textarea = document.createElement('textarea');
        textarea.className = `w-full min-h-20 p-4 border-0 text-base leading-7 resize-none focus:ring-0 focus:outline-none bg-white font-['Inter'] transition-all duration-200 overflow-hidden`;
        textarea.placeholder = `Edit verse ${verseData.verse} or drop text here...`;
        textarea.dataset.verse = verseData.verse;
        textarea.dataset.verseIndex = verseData.index;
        textarea.value = verseData.target_text || verseData.source_text || '';
        textarea.draggable = false;
        
        // Disable editing for viewers
        if (window.translationEditor && !window.translationEditor.canEdit) {
            textarea.disabled = true;
            textarea.style.backgroundColor = '#f9fafb';
            textarea.style.cursor = 'not-allowed';
            textarea.placeholder = 'Read-only mode - Editor access required to edit';
            textarea.title = 'Editor access required to edit translations';
        }
        
        verseWrapper.appendChild(textarea);
        
        // Only add sparkle translate button for primary windows and if user can edit
        if (this.type === 'primary' && window.translationEditor?.canEdit) {
            // Add audio controls first
            this.audioManager.createAudioControls(controlsContainer, verseData, textarea);
            
            const sparkleButton = document.createElement('button');
            sparkleButton.className = 'w-7 h-7 bg-transparent border-0 cursor-pointer flex items-center justify-center transition-all duration-200 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded-sm sparkle-translate-btn';
            sparkleButton.innerHTML = '<i class="fas fa-magic text-sm"></i>';
            sparkleButton.title = 'Translate this verse with AI';
            sparkleButton.setAttribute('data-verse', verseData.verse);
            sparkleButton.setAttribute('data-verse-index', verseData.index);
            
            this.addSparkleButtonListener(sparkleButton, verseData, textarea);
            controlsContainer.appendChild(sparkleButton);
        }
        
        // Create drag handle (only for editors)
        if (window.translationEditor?.canEdit) {
            const dragHandle = document.createElement('div');
            dragHandle.className = `w-7 h-7 bg-gray-100 border border-gray-300 rounded-sm cursor-move flex items-center justify-center transition-all duration-200 hover:bg-gray-200 hover:border-gray-400 sparkle-drag-handle`;
            dragHandle.innerHTML = '<i class="fas fa-arrows-alt text-sm text-gray-500"></i>';
            dragHandle.title = 'Drag to translate';
            dragHandle.draggable = true;
            
            this.addDragListeners(dragHandle, verseData);
            controlsContainer.appendChild(dragHandle);
        }
        
        // Initialize verse cell behavior after DOM is ready, but only if no audio controls exist
        setTimeout(() => {
            if (window.VerseCell && !verseWrapper.querySelector('.audio-controls')) {
                window.VerseCell.initialize(verseWrapper);
            }
        }, 10);
        
        return verseWrapper;
    }
    
    addDragListeners(dragHandle, verseData) {
        dragHandle.addEventListener('dragstart', (e) => {
            const container = dragHandle.closest('[data-verse]');
            const textarea = container.querySelector('textarea');
            
            const dragData = {
                sourceText: textarea.value || '',
                sourceId: this.id,
                verse: verseData.verse,
                reference: verseData.reference,
                sourceType: this.type,
                sourceTitle: this.title
            };
            
            // Start collection system - hover over verses to add them
            if (window.translationEditor?.dragDrop) {
                window.translationEditor.dragDrop.startCollection(dragData);
                
                // Add visual feedback to the initial verse textarea
                textarea.style.backgroundColor = '#dbeafe';
                textarea.style.borderColor = '#3b82f6';
                textarea.style.borderWidth = '2px';
            }
            
            e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
            e.dataTransfer.effectAllowed = 'copy';
            
            container.classList.add('opacity-70', 'bg-blue-100', 'border', 'border-blue-500', 'rounded');
        });
        
        dragHandle.addEventListener('dragend', () => {
            const container = dragHandle.closest('[data-verse]');
            const textarea = container.querySelector('textarea');
            
            container.classList.remove('opacity-70', 'bg-blue-100', 'border', 'border-blue-500', 'rounded');
            
            // Clear visual feedback from the initial verse (will be cleaned up by endCollection too)
            textarea.style.backgroundColor = '';
            textarea.style.borderColor = '';
            textarea.style.borderWidth = '';
        });
    }
    
    addSparkleButtonListener(sparkleButton, verseData, textarea) {
        sparkleButton.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Find source text from other windows
            let sourceText = '';
            let sourceWindow = null;
            
            // Look for any other window with text in this verse
            for (const [id, textWindow] of window.translationEditor.textWindows) {
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
                // Flash error
                sparkleButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                sparkleButton.style.color = '#dc2626';
                setTimeout(() => {
                    sparkleButton.innerHTML = '<i class="fas fa-magic"></i>';
                    sparkleButton.style.color = '';
                }, 1500);
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
                // Use existing translation system
                await window.translationEditor.translateFromDrag(dragData, textarea, this);
                
                // Success
                sparkleButton.innerHTML = '<i class="fas fa-check"></i>';
                sparkleButton.style.color = '#10b981';
                setTimeout(() => {
                    sparkleButton.innerHTML = '<i class="fas fa-magic"></i>';
                    sparkleButton.style.color = '';
                }, 2000);
                
            } catch (error) {
                // Error
                sparkleButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
                sparkleButton.style.color = '#dc2626';
                setTimeout(() => {
                    sparkleButton.innerHTML = '<i class="fas fa-magic"></i>';
                    sparkleButton.style.color = '';
                }, 2000);
            }
        });
    }
    

    

    

    

    
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
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
    }
}

// Make available globally
window.TextWindow = TextWindow; 