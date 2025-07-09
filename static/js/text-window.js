// Unified Text Window Class
class TextWindow {
    constructor(id, data, type, title, targetLanguage = null) {
        this.id = id;
        this.data = data;
        this.type = type; // 'primary' or 'reference' 
        this.title = title;
        this.targetLanguage = targetLanguage; 
        this.element = null;
        this.colorTheme = this.getStoredColorTheme();
        
        console.log('TextWindow created:', {
            id: this.id,
            type: this.type,
            title: this.title,
            targetLanguage: this.targetLanguage
        });
    }
    
    getStoredColorTheme() {
        const storageKey = `text_window_color_${this.id}`;
        return localStorage.getItem(storageKey) || 'theme-default';
    }
    
    setColorTheme(theme) {
        this.colorTheme = theme;
        const storageKey = `text_window_color_${this.id}`;
        localStorage.setItem(storageKey, theme);
        this.updateElementTheme();
    }
    
    updateElementTheme() {
        if (!this.element) return;
        
        const themeClasses = this.getThemeClasses();
        const headerThemeClasses = this.getHeaderThemeClasses();
        
        this.element.className = `flex flex-col border rounded-sm overflow-hidden bg-white min-h-15 flex-1 transition-all duration-200 ${themeClasses}`;
        
        const header = this.element.querySelector('[data-window-header]');
        if (header) {
            header.className = `px-4 py-3 text-sm font-bold border-b flex items-center justify-between flex-shrink-0 uppercase tracking-wider cursor-grab active:cursor-grabbing ${headerThemeClasses}`;
        }
        
        const colorOptions = this.element.querySelectorAll('[data-theme-option]');
        colorOptions.forEach(option => {
            const themeClass = option.getAttribute('data-theme-option');
            const isSelected = themeClass === this.colorTheme;
            
            if (isSelected) {
                option.classList.add('border-gray-800', 'border-2');
                option.innerHTML = '<div class="absolute inset-0 flex items-center justify-center text-white text-xs font-bold drop-shadow">✓</div>';
            } else {
                option.classList.remove('border-gray-800', 'border-2');
                option.innerHTML = '';
            }
        });
    }
    
    render(container) {
        const textWindow = document.createElement('div');
        textWindow.className = `flex flex-col border border-gray-800 rounded-sm overflow-hidden bg-white min-h-15 flex-1 transition-all duration-200 ${this.getThemeClasses()}`;
        textWindow.dataset.textId = this.id;
        textWindow.dataset.windowId = this.id; // Add this for hover detection
        
        textWindow.appendChild(this.createHeader());
        textWindow.appendChild(this.createContent());
        
        container.appendChild(textWindow);
        this.element = textWindow;
        
        // Add drop listeners to the entire window element
        this.addWindowDropListeners(textWindow);
        
        // Add purpose functionality event listeners
        this.addPurposeEventListeners();
        
        return textWindow;
    }
    
    addPurposeEventListeners() {
        if (!this.element) return;
        
        // Add click listener for save buttons
        this.element.addEventListener('click', (e) => {
            if (e.target.closest('.save-purpose-btn')) {
                const btn = e.target.closest('.save-purpose-btn');
                const fileId = btn.getAttribute('data-file-id');
                const purposeInput = this.element.querySelector(`.purpose-input[data-file-id="${fileId}"]`);
                if (purposeInput) {
                    this.saveFilePurpose(fileId, purposeInput, btn);
                }
            } else if (e.target.closest('.save-translation-purpose-btn')) {
                const btn = e.target.closest('.save-translation-purpose-btn');
                const translationId = btn.getAttribute('data-translation-id');
                const purposeInput = this.element.querySelector(`.translation-purpose-input[data-translation-id="${translationId}"]`);
                if (purposeInput) {
                    this.saveTranslationPurpose(translationId, purposeInput, btn);
                }
            }
        });
        
        // Add input listener for character counting
        this.element.addEventListener('input', (e) => {
            if (e.target.classList.contains('purpose-input')) {
                const charCounter = e.target.parentElement.querySelector('.char-counter');
                if (charCounter) {
                    const length = e.target.value.length;
                    charCounter.textContent = `${length}/1,000`;
                    
                    if (length > 1000) {
                        charCounter.style.color = '#dc2626';
                        e.target.style.borderColor = '#dc2626';
                    } else {
                        charCounter.style.color = '#6b7280';
                        e.target.style.borderColor = '';
                    }
                }
            } else if (e.target.classList.contains('translation-purpose-input')) {
                const charCounter = e.target.parentElement.querySelector('.translation-char-counter');
                if (charCounter) {
                    const length = e.target.value.length;
                    charCounter.textContent = `${length}/1,000`;
                    
                    if (length > 1000) {
                        charCounter.style.color = '#dc2626';
                        e.target.style.borderColor = '#dc2626';
                    } else {
                        charCounter.style.color = '#6b7280';
                        e.target.style.borderColor = '';
                    }
                }
            }
        });
    }
    
    saveFilePurpose(fileId, purposeInput, button) {
        const purposeDescription = purposeInput.value.trim();
        
        if (purposeDescription.length > 1000) {
            alert('Purpose description must be 1000 characters or less');
            return;
        }
        
        // Get project ID from URL
        const projectId = window.location.pathname.split('/')[2];
        
        // Visual feedback
        purposeInput.style.opacity = '0.6';
        purposeInput.disabled = true;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Saving...';
        
        // Determine the correct route based on the original ID type
        let url, requestBody;
        
        if (this.id.startsWith('text_')) {
            // Use unified text route
            url = `/project/${projectId}/texts/${fileId}/purpose`;
            requestBody = { description: purposeDescription };
        } else {
            // Use legacy file route
            url = `/project/${projectId}/files/${fileId}/purpose`;
            requestBody = { 
                purpose_description: purposeDescription,
                file_purpose: purposeDescription ? 'custom' : null
            };
        }
        
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Show success feedback
                purposeInput.style.borderColor = '#10b981';
                button.innerHTML = '<i class="fas fa-check mr-1"></i>Saved!';
                
                // Reset after 2 seconds
                setTimeout(() => {
                    purposeInput.style.borderColor = '';
                    button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
                }, 2000);
            } else {
                alert('Failed to save purpose: ' + (data.error || 'Unknown error'));
                purposeInput.style.borderColor = '#ef4444';
                button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
            }
        })
        .catch(error => {
            console.error('Save error:', error);
            alert('Failed to save purpose: ' + error.message);
            purposeInput.style.borderColor = '#ef4444';
            button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
        })
        .finally(() => {
            purposeInput.style.opacity = '1';
            purposeInput.disabled = false;
            button.disabled = false;
        });
    }
    
    saveTranslationPurpose(translationId, purposeInput, button) {
        const purposeDescription = purposeInput.value.trim();
        
        if (purposeDescription.length > 1000) {
            alert('Purpose description must be 1000 characters or less');
            return;
        }
        
        // Get project ID from URL
        const projectId = window.location.pathname.split('/')[2];
        
        // Visual feedback
        purposeInput.style.opacity = '0.6';
        purposeInput.disabled = true;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Saving...';
        
        fetch(`/project/${projectId}/translations/${translationId}/purpose`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                description: purposeDescription
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Show success feedback
                purposeInput.style.borderColor = '#10b981';
                button.innerHTML = '<i class="fas fa-check mr-1"></i>Saved!';
                
                // Reset after 2 seconds
                setTimeout(() => {
                    purposeInput.style.borderColor = '';
                    button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
                }, 2000);
            } else {
                alert('Failed to save purpose: ' + (data.error || 'Unknown error'));
                purposeInput.style.borderColor = '#ef4444';
                button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
            }
        })
        .catch(error => {
            console.error('Save error:', error);
            alert('Failed to save purpose: ' + error.message);
            purposeInput.style.borderColor = '#ef4444';
            button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
        })
        .finally(() => {
            purposeInput.style.opacity = '1';
            purposeInput.disabled = false;
            button.disabled = false;
        });
    }
    
    getThemeClasses() {
        const themeMap = {
            'theme-default': 'border-gray-800',
            'theme-blue': 'border-blue-600',
            'theme-green': 'border-green-600',
            'theme-purple': 'border-purple-600',
            'theme-orange': 'border-orange-600',
            'theme-pink': 'border-pink-600',
            'theme-teal': 'border-teal-600'
        };
        return themeMap[this.colorTheme] || 'border-gray-800';
    }
    
    getHeaderThemeClasses() {
        const headerThemeMap = {
            'theme-default': 'bg-stone-100 text-gray-800 border-b-gray-800',
            'theme-blue': 'bg-blue-50 text-blue-600 border-b-blue-600',
            'theme-green': 'bg-green-50 text-green-600 border-b-green-600',
            'theme-purple': 'bg-purple-50 text-purple-600 border-b-purple-600',
            'theme-orange': 'bg-orange-50 text-orange-600 border-b-orange-600',
            'theme-pink': 'bg-pink-50 text-pink-600 border-b-pink-600',
            'theme-teal': 'bg-teal-50 text-teal-600 border-b-teal-600'
        };
        return headerThemeMap[this.colorTheme] || 'bg-stone-100 text-gray-800 border-b-gray-800';
    }
    
    createHeader() {
        const header = document.createElement('div');
        header.className = `px-4 py-3 text-sm font-bold border-b border-gray-800 flex items-center justify-between flex-shrink-0 bg-stone-100 uppercase tracking-wider cursor-grab active:cursor-grabbing ${this.getHeaderThemeClasses()}`;
        header.draggable = true;
        header.setAttribute('data-window-header', 'true');
        
        const downloadButton = this.createDownloadButton();
        const plusButton = this.createPlusButton();
        const closeButton = `<button class="text-red-600 hover:text-red-800 hover:bg-red-100 rounded p-1 transition-colors close-text-btn" 
                       data-text-id="${this.id}" 
                       title="Remove this text">
                   <i class="fas fa-times text-xs"></i>
               </button>`;
        
        const colorPicker = this.createColorPicker();
        
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
        
        verseWrapper.appendChild(textarea);
        
        // Only add sparkle translate button for primary windows
        if (this.type === 'primary') {
            // Add audio controls first
            this.createAudioControls(controlsContainer, verseData, textarea);
            
            const sparkleButton = document.createElement('button');
            sparkleButton.className = 'w-7 h-7 bg-transparent border-0 cursor-pointer flex items-center justify-center transition-all duration-200 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded-sm sparkle-translate-btn';
            sparkleButton.innerHTML = '<i class="fas fa-magic text-sm"></i>';
            sparkleButton.title = 'Translate this verse with AI';
            sparkleButton.setAttribute('data-verse', verseData.verse);
            sparkleButton.setAttribute('data-verse-index', verseData.index);
            
            this.addSparkleButtonListener(sparkleButton, verseData, textarea);
            controlsContainer.appendChild(sparkleButton);
        }
        
        // Create drag handle
        const dragHandle = document.createElement('div');
        dragHandle.className = `w-7 h-7 bg-gray-100 border border-gray-300 rounded-sm cursor-move flex items-center justify-center transition-all duration-200 hover:bg-gray-200 hover:border-gray-400 sparkle-drag-handle`;
        dragHandle.innerHTML = '<i class="fas fa-arrows-alt text-sm text-gray-500"></i>';
        dragHandle.title = 'Drag to translate';
        dragHandle.draggable = true;
        
        this.addDragListeners(dragHandle, verseData);
        controlsContainer.appendChild(dragHandle);
        
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
    
    createAudioControls(container, verseData, textarea) {
        const voiceSelect = document.createElement('select');
        voiceSelect.className = 'voice-selector text-xs px-2 py-1 h-7 border border-gray-300 bg-gray-100 text-gray-500 rounded-sm hover:bg-gray-200 hover:text-gray-700 transition-all focus:outline-none cursor-pointer';
        voiceSelect.style.minWidth = '70px';
        voiceSelect.innerHTML = `
            <option value="alloy">Alloy</option>
            <option value="ash">Ash</option>
            <option value="ballad">Ballad</option>
            <option value="coral">Coral</option>
            <option value="echo">Echo</option>
            <option value="fable">Fable</option>
            <option value="nova">Nova</option>
            <option value="onyx" selected>Onyx</option>
            <option value="sage">Sage</option>
            <option value="shimmer">Shimmer</option>
        `;
        
        // Set default voice from localStorage
        const savedVoice = localStorage.getItem('preferredVoice') || 'onyx';
        voiceSelect.value = savedVoice;
        
        // Save voice preference when changed and sync all dropdowns
        voiceSelect.addEventListener('change', () => {
            const selectedVoice = voiceSelect.value;
            localStorage.setItem('preferredVoice', selectedVoice);
            
            // Update all other voice selectors on the page
            document.querySelectorAll('.voice-selector').forEach(selector => {
                if (selector !== voiceSelect) {
                    selector.value = selectedVoice;
                }
            });
        });
        
        const ttsBtn = document.createElement('button');
        ttsBtn.className = 'tts-btn w-7 h-7 flex items-center justify-center bg-gray-100 text-gray-500 rounded-sm hover:bg-gray-200 hover:text-gray-700 transition-all focus:outline-none';
        ttsBtn.innerHTML = '<i class="fas fa-microphone text-sm"></i>';
        ttsBtn.title = 'Generate audio';
        
        const playBtn = document.createElement('button');
        playBtn.className = 'play-audio-btn w-7 h-7 flex items-center justify-center bg-gray-100 text-gray-500 rounded-sm hover:bg-gray-200 hover:text-gray-700 transition-all focus:outline-none';
        playBtn.innerHTML = '<i class="fas fa-play text-sm"></i>';
        playBtn.title = 'Play audio';
        playBtn.style.display = 'none';
        
        const pauseBtn = document.createElement('button');
        pauseBtn.className = 'pause-audio-btn w-7 h-7 flex items-center justify-center bg-gray-100 text-gray-500 rounded-sm hover:bg-gray-200 hover:text-gray-700 transition-all focus:outline-none';
        pauseBtn.innerHTML = '<i class="fas fa-pause text-sm"></i>';
        pauseBtn.title = 'Pause audio';
        pauseBtn.style.display = 'none';
        
        const tuningBtn = document.createElement('button');
        tuningBtn.className = 'audio-tuning-btn w-7 h-7 flex items-center justify-center bg-gray-100 text-gray-500 rounded-sm hover:bg-blue-100 hover:text-blue-600 transition-all focus:outline-none';
        tuningBtn.innerHTML = '<i class="fas fa-sliders-h text-sm"></i>';
        tuningBtn.title = 'Audio settings';
        tuningBtn.style.display = 'none';
        
        // Add all controls to the container
        container.appendChild(voiceSelect);
        container.appendChild(ttsBtn);
        container.appendChild(playBtn);
        container.appendChild(pauseBtn);
        container.appendChild(tuningBtn);
        
        // Store audio state on the container
        container._currentAudio = null;
        container._audioId = null;
        
        this.setupAudioListeners(verseData, textarea, container);
        this.checkExistingAudio(container, verseData);
    }
    
    setupAudioListeners(verseData, textarea, audioControls) {
        const voiceSelect = audioControls.querySelector('.voice-selector');
        const ttsBtn = audioControls.querySelector('.tts-btn');
        const playBtn = audioControls.querySelector('.play-audio-btn');
        const pauseBtn = audioControls.querySelector('.pause-audio-btn');
        const tuningBtn = audioControls.querySelector('.audio-tuning-btn');
        
        ttsBtn.onclick = async (e) => {
            e.stopPropagation();
            const text = textarea.value.trim();
            if (!text) {
                alert('Please enter some text first');
                return;
            }
            await this.generateAudio(verseData, text, voiceSelect.value, audioControls);
        };
        
        playBtn.onclick = async (e) => {
            e.stopPropagation();
            await this.playAudio(verseData, audioControls);
        };
        
        pauseBtn.onclick = (e) => {
            e.stopPropagation();
            this.pauseAudio(audioControls);
        };
        
        tuningBtn.onclick = (e) => {
            e.stopPropagation();
            this.openAudioTuningModal(verseData, textarea, audioControls);
        };
    }
    
    async generateAudio(verseData, text, voice, audioControls) {
        const ttsBtn = audioControls.querySelector('.tts-btn');
        
        ttsBtn.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i>';
        ttsBtn.disabled = true;
        
        const projectId = window.location.pathname.split('/')[2];
        const response = await fetch(`/project/${projectId}/verse-audio/${this.id}/${verseData.index}/tts`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice })
        });
        
        const data = await response.json();
        audioControls._audioId = data.audio_id;
        this.showAudioButtons(audioControls, true);
        this.playAudio(verseData, audioControls);
        
        ttsBtn.innerHTML = '<i class="fas fa-microphone" style="font-size: 10px;"></i>';
        ttsBtn.disabled = false;
    }
    
    async playAudio(verseData, audioControls) {
        const playBtn = audioControls.querySelector('.play-audio-btn');
        const pauseBtn = audioControls.querySelector('.pause-audio-btn');
        
        if (audioControls._currentAudio && !audioControls._currentAudio.paused) {
            this.pauseAudio(audioControls);
            return;
        }
        
        try {
            let audioId = audioControls._audioId;
            if (!audioId) {
                const projectId = window.location.pathname.split('/')[2];
                const response = await fetch(`/project/${projectId}/verse-audio/${this.id}/${verseData.index}/check`);
                const data = await response.json();
                if (!data.exists) {
                    alert('No audio available. Generate audio first.');
                    return;
                }
                audioId = data.audio_id;
                audioControls._audioId = audioId;
            }
            
            const projectId = window.location.pathname.split('/')[2];
            const audioUrl = `/project/${projectId}/verse-audio/${audioId}/download`;
            audioControls._currentAudio = new Audio(audioUrl);
            
            audioControls._currentAudio.play();
            playBtn.style.display = 'none';
            pauseBtn.style.display = 'flex';
            
            audioControls._currentAudio.onended = () => {
                playBtn.style.display = 'flex';
                pauseBtn.style.display = 'none';
                audioControls._currentAudio = null;
            };
            
            audioControls._currentAudio.onerror = () => {
                playBtn.style.display = 'flex';
                pauseBtn.style.display = 'none';
                audioControls._currentAudio = null;
                alert('Failed to play audio');
            };
        } catch (error) {
            alert('Failed to play audio: ' + error.message);
        }
    }
    
    pauseAudio(audioControls) {
        const playBtn = audioControls.querySelector('.play-audio-btn');
        const pauseBtn = audioControls.querySelector('.pause-audio-btn');
        
        if (audioControls._currentAudio && !audioControls._currentAudio.paused) {
            audioControls._currentAudio.pause();
            playBtn.style.display = 'flex';
            pauseBtn.style.display = 'none';
        }
    }
    
    openAudioTuningModal(verseData, textarea, audioControls) {
        const originalText = textarea.value.trim();
        if (!originalText) return;
        
        window.AudioTuningModal?.open({
            projectId: window.location.pathname.split('/')[2],
            textId: this.id,
            verseIndex: verseData.index,
            originalText,
            onApply: (audioId) => {
                if (audioId) {
                    audioControls._audioId = audioId;
                    this.showAudioButtons(audioControls, true);
                    setTimeout(() => this.playAudio(verseData, audioControls), 300);
                } else {
                    this.showAudioButtons(audioControls, false);
                    audioControls._audioId = null;
                }
            }
        });
    }
    
    async deleteAudio(verseData, audioControls) {
        try {
            if (audioControls._currentAudio) {
                audioControls._currentAudio.pause();
                audioControls._currentAudio = null;
            }
            
            let audioId = audioControls._audioId;
            if (!audioId) {
                const projectId = window.location.pathname.split('/')[2];
                const response = await fetch(`/project/${projectId}/verse-audio/${this.id}/${verseData.index}/check`);
                const data = await response.json();
                if (!data.exists) return;
                audioId = data.audio_id;
            }
            
            const projectId = window.location.pathname.split('/')[2];
            const response = await fetch(`/project/${projectId}/verse-audio/${audioId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                this.showAudioButtons(audioControls, false);
                audioControls._audioId = null;
            } else {
                alert('Failed to delete audio');
            }
        } catch (error) {
            alert('Failed to delete audio: ' + error.message);
        }
    }
    
    showAudioButtons(audioControls, hasAudio) {
        const playBtn = audioControls.querySelector('.play-audio-btn');
        const pauseBtn = audioControls.querySelector('.pause-audio-btn');
        const tuningBtn = audioControls.querySelector('.audio-tuning-btn');
        
        if (playBtn) playBtn.style.display = hasAudio ? 'flex' : 'none';
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (tuningBtn) tuningBtn.style.display = hasAudio ? 'flex' : 'none';
    }
    
    async checkExistingAudio(audioControls, verseData) {
        try {
            const projectId = window.location.pathname.split('/')[2];
            const response = await fetch(`/project/${projectId}/verse-audio/${this.id}/${verseData.index}/check`);
            const data = await response.json();
            if (data.exists) {
                audioControls._audioId = data.audio_id;
                this.showAudioButtons(audioControls, true);
            }
        } catch (error) {
            // No existing audio - this is fine
        }
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