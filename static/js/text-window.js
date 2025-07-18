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
        this.dragListenersSetup = false;
    }
    
    render(container) {
        const textWindow = document.createElement('div');
        textWindow.className = `flex flex-col border border-neutral-200 rounded-xl bg-white min-h-15 flex-1 shadow-sm`;
        textWindow.dataset.textId = this.id;
        textWindow.dataset.windowId = this.id;
        textWindow.dataset.windowType = this.type;
        
        textWindow.appendChild(this.createHeader());
        textWindow.appendChild(this.createContent());
        
        container.appendChild(textWindow);
        this.element = textWindow;
        
        this.addWindowDropListeners(textWindow);
        PurposeManager.setupPurposeListeners(textWindow);
        
        return textWindow;
    }
    
    destroy() {
        // Clean up virtual scrolling
        if (window.translationEditor?.virtualScrollManager) {
            window.translationEditor.virtualScrollManager.unregisterContainer(this.id);
        }
        
        // Remove element from DOM
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        
        console.log(`TextWindow: Destroyed ${this.id}`);
    }
    

    

    
    createHeader() {
        const header = document.createElement('div');
        header.className = `px-4 py-3 text-sm font-bold border-b border-neutral-200 flex items-center justify-between flex-shrink-0 tracking-wide cursor-grab active:cursor-grabbing bg-neutral-50 text-neutral-800`;
        header.draggable = true;
        header.setAttribute('data-window-header', 'true');
        
        const downloadButton = this.createDownloadButton();
        const plusButton = this.createPlusButton();
        const playAllButton = this.createPlayAllButton();
        const syncToggle = this.createSyncToggle();
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
        
        // Add language server toggle button for all windows
        if (window.languageServer && typeof window.languageServer.createToggleButton === 'function') {
            const languageServerToggle = window.languageServer.createToggleButton(this.id);
            rightContainer.insertBefore(languageServerToggle, rightContainer.firstChild);
        }
        
        // Only add sync toggle for non-primary windows
        if (this.type !== 'primary') {
            rightContainer.insertBefore(syncToggle, rightContainer.firstChild);
        }
        
        // Only add play all button for primary windows with audio capability
        if (this.type === 'primary' && window.translationEditor?.canEdit) {
            rightContainer.insertBefore(playAllButton, rightContainer.firstChild);
        }
        
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
        
        // Add audio download options for primary windows
        if (this.type === 'primary' && window.translationEditor?.canEdit) {
            // Separator
            const separator = document.createElement('hr');
            separator.className = 'my-2 border-gray-200';
            downloadDropdown.appendChild(separator);
            
            // Individual audio files button
            const audioIndividualButton = document.createElement('button');
            audioIndividualButton.className = 'w-full text-left px-4 py-2 text-sm flex items-center';
            audioIndividualButton.innerHTML = '<i class="fas fa-volume-up mr-2 text-gray-500"></i>Download Audio Files';
            audioIndividualButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.downloadAudioFiles('individual');
                downloadDropdown.classList.add('hidden');
            });
            
            // Spliced audio button
            const audioSplicedButton = document.createElement('button');
            audioSplicedButton.className = 'w-full text-left px-4 py-2 text-sm flex items-center';
            audioSplicedButton.innerHTML = '<i class="fas fa-music mr-2 text-gray-500"></i>Download Spliced Audio';
            audioSplicedButton.addEventListener('click', (e) => {
                e.stopPropagation();
                this.downloadAudioFiles('spliced');
                downloadDropdown.classList.add('hidden');
            });
            
            downloadDropdown.appendChild(audioIndividualButton);
            downloadDropdown.appendChild(audioSplicedButton);
        }
        
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

    createSyncToggle() {
        const syncToggle = document.createElement('button');
        syncToggle.className = 'text-gray-600 rounded p-1 sync-toggle-btn';
        syncToggle.title = 'Catch up to primary translation when clicked';
        
        // Initialize sync state (default to true for better UX for reference windows)
        if (this.syncEnabled === undefined) {
            this.syncEnabled = localStorage.getItem(`sync-${this.id}`) !== 'false';
        }
        
        const updateSyncButton = () => {
            if (this.syncEnabled) {
                syncToggle.innerHTML = '<i class="fas fa-link text-xs text-blue-600"></i>';
                syncToggle.classList.add('text-blue-600');
                syncToggle.classList.remove('text-gray-600');
                syncToggle.title = 'Catch up enabled - Will follow primary when clicked';
            } else {
                syncToggle.innerHTML = '<i class="fas fa-unlink text-xs"></i>';
                syncToggle.classList.remove('text-blue-600');
                syncToggle.classList.add('text-gray-600');
                syncToggle.title = 'Catch up disabled - Will not follow primary';
            }
        };
        
        updateSyncButton();

        syncToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.syncEnabled = !this.syncEnabled;
            localStorage.setItem(`sync-${this.id}`, this.syncEnabled.toString());
            updateSyncButton();
            
            // Show brief feedback
            const originalTitle = syncToggle.title;
            syncToggle.title = this.syncEnabled ? 'Catch up enabled!' : 'Catch up disabled!';
            setTimeout(() => {
                syncToggle.title = originalTitle;
            }, 1000);
            
            // If sync was just enabled, trigger an immediate sync to catch up
            if (this.syncEnabled) {
                const primaryWindow = window.translationEditor?.textWindows?.get(window.translationEditor?.primaryTextId);
                if (primaryWindow && primaryWindow.type === 'primary') {
                    const primaryContainer = primaryWindow.element?.querySelector('[data-window-content]');
                    if (primaryContainer) {
                        primaryWindow.syncOtherWindowsToThis(primaryContainer);
                    }
                }
            }
        });

        return syncToggle;
    }

    openTextSelectionModal() {
        const isPrimary = this.type === 'primary';
        window.translationEditor.ui.showTextSelectionModal(isPrimary);
    }

    createPlayAllButton() {
        const playAllButton = document.createElement('button');
        playAllButton.className = 'text-gray-600 rounded p-1 play-all-btn';
        playAllButton.title = 'Play all audio in sequence';
        playAllButton.innerHTML = '<i class="fas fa-play-circle text-xs"></i>';
        
        // State management
        playAllButton._isPlaying = false;
        playAllButton._currentIndex = 0;
        playAllButton._audioQueue = [];

        playAllButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.togglePlayAll(playAllButton);
        });

        return playAllButton;
    }

    async togglePlayAll(button) {
        if (button._isPlaying) {
            this.stopPlayAll(button);
        } else {
            await this.startPlayAll(button);
        }
    }

    async startPlayAll(button) {
        // Find all verses with audio
        const audioQueue = [];
        const verseElements = this.element.querySelectorAll('[data-verse-cell]');
        
        for (const verseElement of verseElements) {
            const verseIndex = verseElement.dataset.verse;
            // Find the audio controls container created by AudioManager
            // Search for any element with _audioId property within this verse
            let audioControls = null;
            const allElements = verseElement.querySelectorAll('*');
            for (const el of allElements) {
                if (el._audioId) {
                    audioControls = el;
                    break;
                }
            }
            
            if (audioControls && audioControls._audioId) {
                audioQueue.push({
                    verseIndex: parseInt(verseIndex),
                    verseElement: verseElement,
                    audioControls: audioControls
                });
            }
        }

        if (audioQueue.length === 0) {
            alert('No audio files found. Generate audio for some verses first.');
            return;
        }

        button._isPlaying = true;
        button._currentIndex = 0;
        button._audioQueue = audioQueue;
        
        // Update button appearance
        button.innerHTML = '<i class="fas fa-stop text-xs"></i>';
        button.title = 'Stop playing all audio';
        button.classList.add('text-blue-600');

        await this.playNextInQueue(button);
    }

    async playNextInQueue(button) {
        if (!button._isPlaying || button._currentIndex >= button._audioQueue.length) {
            this.stopPlayAll(button);
            return;
        }

        const currentItem = button._audioQueue[button._currentIndex];
        const audioControls = currentItem.audioControls;

        // Highlight current verse
        this.highlightCurrentVerse(currentItem.verseElement, true);

        try {
            // Create audio element
            const projectId = window.location.pathname.split('/')[2];
            const audioUrl = `/project/${projectId}/verse-audio/${audioControls._audioId}/download`;
            const audio = new Audio(audioUrl);

            // Play the audio
            await new Promise((resolve, reject) => {
                audio.onended = () => {
                    this.highlightCurrentVerse(currentItem.verseElement, false);
                    button._currentIndex++;
                    resolve();
                };

                audio.onerror = () => {
                    this.highlightCurrentVerse(currentItem.verseElement, false);
                    console.error('Failed to play audio for verse', currentItem.verseIndex);
                    button._currentIndex++;
                    resolve(); // Continue to next even on error
                };

                audio.play().catch(reject);
            });

            // Play next immediately without delay
            await this.playNextInQueue(button);

        } catch (error) {
            console.error('Error playing audio:', error);
            this.highlightCurrentVerse(currentItem.verseElement, false);
            button._currentIndex++;
            await this.playNextInQueue(button);
        }
    }

    stopPlayAll(button) {
        button._isPlaying = false;
        button._currentIndex = 0;
        
        // Clear highlighting
        if (button._audioQueue) {
            button._audioQueue.forEach(item => {
                this.highlightCurrentVerse(item.verseElement, false);
            });
        }
        
        button._audioQueue = [];
        
        // Reset button appearance
        button.innerHTML = '<i class="fas fa-play-circle text-xs"></i>';
        button.title = 'Play all audio in sequence';
        button.classList.remove('text-blue-600');
    }

    highlightCurrentVerse(verseElement, highlight) {
        if (highlight) {
            verseElement.classList.add('ring-2', 'ring-blue-500', 'bg-blue-50');
            verseElement.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'center' 
            });
        } else {
            verseElement.classList.remove('ring-2', 'ring-blue-500', 'bg-blue-50');
        }
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
    
    async downloadAudioFiles(type) {
        const projectId = window.location.pathname.split('/')[2];
        const editor = window.translationEditor;
        const book = editor?.currentBook || 'Unknown';
        const chapter = editor?.currentChapter || '1';
        
        // Collect all verses with audio
        const audioVerses = [];
        const verseElements = this.element.querySelectorAll('[data-verse-cell]');
        
        for (const verseElement of verseElements) {
            let audioControls = null;
            const allElements = verseElement.querySelectorAll('*');
            for (const el of allElements) {
                if (el._audioId) {
                    audioControls = el;
                    break;
                }
            }
            
            if (audioControls && audioControls._audioId) {
                audioVerses.push({
                    verse: verseElement.dataset.verse,
                    audioId: audioControls._audioId
                });
            }
        }
        
        if (audioVerses.length === 0) {
            alert('No audio files found to download.');
            return;
        }
        
        if (type === 'individual') {
            // Download each audio file individually
            for (const verseAudio of audioVerses) {
                const link = document.createElement('a');
                link.href = `/project/${projectId}/verse-audio/${verseAudio.audioId}/download`;
                link.download = `${book}_${chapter}_verse_${verseAudio.verse}.mp3`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Small delay between downloads to avoid overwhelming the browser
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } else if (type === 'spliced') {
            // Request spliced audio from backend
            try {
                const response = await fetch(`/project/${projectId}/audio/splice`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        audio_ids: audioVerses.map(v => v.audioId),
                        filename: `${book}_${chapter}_complete.mp3`
                    })
                });
                
                if (response.ok) {
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `${book}_${chapter}_complete.mp3`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                } else {
                    alert('Failed to create spliced audio file.');
                }
            } catch (error) {
                console.error('Error downloading spliced audio:', error);
                alert('Failed to download spliced audio.');
            }
        }
    }
    
    createContent() {
        const content = document.createElement('div');
        content.className = 'flex-1 overflow-y-auto overflow-x-hidden p-4 leading-tight text-sm bg-white';
        content.setAttribute('data-window-content', 'true');
        
        // CRITICAL: Ensure proper scroll container setup for flex layouts
        content.style.minHeight = '0';
        content.style.flex = '1';
        
        // Add purpose section
        const purposeSection = this.createPurposeSection();
        content.appendChild(purposeSection);
        
        // Check if virtual scrolling is available
        if (window.translationEditor?.virtualScrollManager) {
            // Use virtual scrolling for infinite scroll
            this.setupVirtualScrolling(content);
        } else {
            // Fallback to traditional rendering
            if (!this.data?.verses) {
                content.innerHTML += '<div class="text-neutral-400 text-center py-8">No verses loaded</div>';
                return content;
            }
            this.renderAllVerses(content);
        }
        
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
        
        // PERFORMANCE: Scroll sync now handled by VirtualScrollManager
        // Only set up legacy scroll sync if virtual scrolling is not available
        if (!window.translationEditor?.virtualScrollManager) {
            this.setupScrollSync(container);
        }
    }
    
    setupScrollSync(container) {
        // Simplified: No automatic scroll syncing - only manual catch-up when clicking verse cells
        // This method now does nothing but is kept for compatibility
    }
    
    syncOtherWindowsToThis(sourceContainer, targetVerseIndex = null) {
        // Enhanced sync: Sync to a specific verse index, or find the currently visible verse
        let currentVisibleVerse = null;
        let verseIndex = targetVerseIndex;
        
        if (verseIndex === null) {
            // Fallback to finding the currently visible verse
            currentVisibleVerse = this.getCurrentVisibleVerse(sourceContainer);
            if (!currentVisibleVerse) {
                console.log('No visible verse found for syncing');
                return;
            }
            verseIndex = parseInt(currentVisibleVerse.dataset.verseIndex);
        } else {
            // Find the verse element for the given index for reference info
            currentVisibleVerse = sourceContainer.querySelector(`[data-verse-index="${verseIndex}"]`);
        }
        
        if (isNaN(verseIndex)) {
            console.log('Invalid verse index for syncing');
            return;
        }
        
        const targetVerseNumber = currentVisibleVerse?.dataset.verse || verseIndex;
        const targetReference = currentVisibleVerse?.dataset.reference || `Verse ${targetVerseNumber}`;
        
        console.log(`Syncing reference windows to verse index ${verseIndex} (${targetReference})`);
        
        // Find all other text windows and sync those with sync enabled
        window.translationEditor?.textWindows?.forEach((textWindow, windowId) => {
            if (textWindow.id !== this.id && textWindow.syncEnabled !== false) {
                const otherContainer = textWindow.element?.querySelector('[data-window-content]');
                if (otherContainer && otherContainer.offsetParent) {
                    this.syncToVerseIndex(otherContainer, verseIndex, targetReference, textWindow.id);
                }
            }
        });
    }
    
    getCurrentVisibleVerse(container) {
        const scrollTop = container.scrollTop;
        const containerHeight = container.clientHeight;
        const viewportCenter = scrollTop + (containerHeight / 2);
        
        // Get all verse elements with verse-index data
        const verseElements = container.querySelectorAll('[data-verse-index]');
        
        let closestElement = null;
        let closestDistance = Infinity;
        
        verseElements.forEach(element => {
            const elementTop = element.offsetTop;
            const elementHeight = element.offsetHeight;
            const elementCenter = elementTop + (elementHeight / 2);
            
            // Distance from viewport center to element center
            const distance = Math.abs(viewportCenter - elementCenter);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestElement = element;
            }
        });
        
        return closestElement;
    }
    
    async syncToVerseIndex(container, verseIndex, reference, windowId) {
        // Try to find the target verse by index in the reference window
        const targetVerse = container.querySelector(`[data-verse-index="${verseIndex}"]`);
        
        if (targetVerse) {
            // Verse found - jump directly to it
            const targetTop = targetVerse.offsetTop - 50; // Small offset for better visibility
            container.scrollTop = Math.max(0, targetTop);
            console.log(`Synced ${windowId} to verse index ${verseIndex} (found locally)`);
        } else {
            // Verse not found - need to load the correct chapter/book content
            console.log(`Verse index ${verseIndex} not found in ${windowId}, loading appropriate content`);
            
            await this.loadContentForVerseIndex(container, verseIndex, reference, windowId);
        }
    }
    
    async loadContentForVerseIndex(container, verseIndex, reference, windowId) {
        try {
            // First, get the book/chapter info for this verse index
            const verseInfo = await this.getVerseInfo(verseIndex);
            
            if (!verseInfo || !verseInfo.book || !verseInfo.chapter) {
                console.error(`Could not get book/chapter info for verse index ${verseIndex}`);
                return;
            }
            
            console.log(`Loading ${verseInfo.book} ${verseInfo.chapter} for ${windowId} to reach verse index ${verseIndex}`);
            
            // Use virtual scroll manager to navigate this specific window
            if (window.translationEditor?.virtualScrollManager) {
                // Use the individual window loading method that preserves virtual scrolling
                await window.translationEditor.virtualScrollManager.loadChapterWithContext(windowId, verseInfo.book, verseInfo.chapter);
                
                // After loading, try to scroll to the specific verse
                setTimeout(() => {
                    const targetVerse = container.querySelector(`[data-verse-index="${verseIndex}"]`);
                    if (targetVerse) {
                        const targetTop = targetVerse.offsetTop - 50;
                        container.scrollTop = Math.max(0, targetTop);
                        console.log(`Successfully synced ${windowId} to verse index ${verseIndex} after loading`);
                    } else {
                        console.log(`Verse index ${verseIndex} still not found after loading ${verseInfo.book} ${verseInfo.chapter}`);
                        // Try using the virtual scroll manager's direct verse scrolling
                        setTimeout(() => {
                            if (window.translationEditor.virtualScrollManager.scrollToVerseIndex) {
                                window.translationEditor.virtualScrollManager.scrollToVerseIndex(windowId, verseIndex);
                            }
                        }, 500);
                    }
                }, 200);
            } else {
                console.error('Virtual scroll manager not available for content loading');
            }
            
        } catch (error) {
            console.error(`Error loading content for verse index ${verseIndex}:`, error);
        }
    }
    
    async getVerseInfo(verseIndex) {
        try {
            const projectId = window.translationEditor?.projectId;
            if (!projectId) {
                console.error('Project ID not available');
                return null;
            }
            
            const response = await fetch(`/project/${projectId}/verse-info/${verseIndex}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            return data;
            
        } catch (error) {
            console.error(`Error fetching verse info for index ${verseIndex}:`, error);
            return null;
        }
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
    
    setupVirtualScrolling(container) {
        // Register this container with the virtual scroll manager
        const virtualScrollManager = window.translationEditor.virtualScrollManager;
        virtualScrollManager.registerContainer(this.id, container);
        
        // Set up sync functionality for virtual scrolling
        this.setupVirtualScrollSync(container);
        
        // Load initial verses based on current navigation
        const editor = window.translationEditor;
        const currentBook = editor.currentBook;
        const currentChapter = editor.currentChapter;
        
        if (currentBook && currentChapter) {
            // Load verses for current chapter
            virtualScrollManager.loadInitialVerses(this.id, currentBook, currentChapter);
        } else {
            // Default to Genesis 1 if no navigation state
            virtualScrollManager.loadInitialVerses(this.id, 'GEN', 1);
        }
        
        console.log(`TextWindow: Setup virtual scrolling for ${this.id}`);
    }
    
    setupVirtualScrollSync(container) {
        // Simplified: No automatic scroll syncing for virtual scrolling either
        // This method now does nothing but is kept for compatibility
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
        
        // Left side: Audio controls container
        const leftControlsContainer = document.createElement('div');
        leftControlsContainer.className = 'flex items-center gap-1';
        
        // Center: Verse label
        const verseLabel = document.createElement('div');
        const labelClasses = this.type === 'primary' ? 
            'text-red-600 bg-red-50' : 
            'text-blue-600 bg-blue-50';
        verseLabel.className = `text-xs font-semibold px-2 py-1 rounded-sm ${labelClasses} absolute left-1/2 transform -translate-x-1/2`;
        verseLabel.textContent = verseData.reference;
        
        // Right side: Other controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'flex items-center gap-1';
        
        navBar.appendChild(leftControlsContainer);
        navBar.appendChild(verseLabel);
        navBar.appendChild(controlsContainer);
        verseWrapper.appendChild(navBar);
        
        const textarea = this.createOptimizedTextarea(verseData);
        verseWrapper.appendChild(textarea);
        
        // PERFORMANCE: Batch control setup to reduce DOM queries
        this.setupVerseControlsBatched(controlsContainer, leftControlsContainer, verseData, textarea, verseWrapper);
        
        return verseWrapper;
    }
    
    createOptimizedTextarea(verseData) {
        const textarea = document.createElement('textarea');
        textarea.className = `w-full p-4 border-0 text-base leading-7 resize-none focus:ring-0 focus:outline-none bg-white font-['Inter'] overflow-hidden`;
        
        // Set appropriate placeholder based on window type
        if (this.type === 'primary') {
            textarea.placeholder = `Edit verse ${verseData.verse} or drop text here...`;
        } else {
            textarea.placeholder = `Reference text for verse ${verseData.verse}`;
        }
        
        textarea.dataset.verse = verseData.verse;
        textarea.dataset.verseIndex = verseData.index;
        textarea.dataset.reference = verseData.reference || `Verse ${verseData.verse}`;
        
        // SIMPLIFIED: Just use the standard fallback logic without complex window checking
        textarea.value = verseData.target_text || verseData.source_text || '';
        textarea.draggable = false;
        
        // PERFORMANCE: Set proper height immediately based on content
        const lines = (textarea.value || '').split('\n').length;
        const minHeight = Math.max(80, lines * 24 + 32); // 24px per line + padding
        textarea.style.height = minHeight + 'px';
        
        // Disable editing only for viewers (not reference windows - they should be editable)
        if (window.translationEditor && !window.translationEditor.canEdit) {
            textarea.disabled = true;
            textarea.style.backgroundColor = '#f9fafb';
            textarea.style.cursor = 'not-allowed';
            textarea.placeholder = 'Read-only mode - Editor access required to edit';
            textarea.title = 'Editor access required to edit translations';
        }
        
        // PERFORMANCE: Use optimized event handlers
        this.attachOptimizedTextareaListeners(textarea);
        
        // LANGUAGE SERVER: Process analysis data if it exists
        if (verseData.analysis && window.processVerseWithAnalysis) {
            // Defer processing to allow DOM to settle
            setTimeout(() => {
                window.processVerseWithAnalysis(verseData);
            }, 50);
        }
        
        return textarea;
    }
    
    attachOptimizedTextareaListeners(textarea) {
        // PERFORMANCE: SIMPLEST POSSIBLE - just store the value
        let currentValue = textarea.value || '';
        let hasChanges = false;
        let lastSaveTimestamp = 0; // Track when we last saved this textarea
        const saveDelay = 500; // Minimum delay between saves in ms
        
        textarea.addEventListener('input', (e) => {
            const newValue = e.target.value;
            const wasChanged = hasChanges;
            hasChanges = (newValue !== currentValue);
            console.log(`💾 Input event on verse ${textarea.dataset.verseIndex}: "${currentValue}" → "${newValue}", hasChanges: ${wasChanged} → ${hasChanges}`);
            currentValue = newValue;
            // NOTE: Height auto-resize is handled by virtual-scroll-manager.js to avoid conflicts
        }, { passive: true });
        
        // AUTO-SAVE: Save when user moves to different cell or leaves the textarea
        textarea.addEventListener('blur', () => {
            const now = Date.now();
            console.log(`💾 Blur event on verse ${textarea.dataset.verseIndex}: hasChanges=${hasChanges}, saveSystem=${!!window.translationEditor?.saveSystem}, timeDiff=${now - lastSaveTimestamp}`);
            if (hasChanges && window.translationEditor?.saveSystem && (now - lastSaveTimestamp) > saveDelay) {
                const verseIndex = parseInt(textarea.dataset.verseIndex);
                if (!isNaN(verseIndex)) {
                    console.log(`💾 Triggering auto-save for verse ${verseIndex}`);
                    window.translationEditor.saveSystem.bufferVerseChange(verseIndex, currentValue);
                    hasChanges = false; // Reset change tracking
                    lastSaveTimestamp = now;
                }
            } else {
                console.log(`💾 Skipping auto-save for verse ${textarea.dataset.verseIndex}`);
            }
        }, { passive: true });
        
        // Track when user focuses on this textarea 
        textarea.addEventListener('focus', () => {
            // Just update focus tracking - no need to save here since blur already handles it
            if (window.translationEditor?.saveSystem) {
                window.translationEditor.saveSystem.currentFocusedTextarea = textarea;
            }
            
            // Update current value for this textarea
            currentValue = textarea.value || '';
            hasChanges = false;
            
            // Store reference to last save timestamp on the textarea element
            textarea._lastSaveTimestamp = lastSaveTimestamp;
        }, { passive: true });
        
        // AUTOMATIC SYNC: Re-enabled for primary window textarea clicks
        if (this.type === 'primary') {
            textarea.addEventListener('click', (e) => {
                // Sync to the specific verse that was clicked, not the "currently visible" verse
                const clickedVerseElement = e.target.closest('[data-verse-index]');
                if (clickedVerseElement) {
                    this.triggerSyncFromPrimary(clickedVerseElement);
                } else {
                    this.triggerSyncFromPrimary();
                }
            }, { passive: true });
        }
    }
    
    triggerSyncFromPrimary(clickedVerseElement) {
        // Only trigger sync if this is the primary window
        if (this.type !== 'primary') return;
        
        const container = this.element?.querySelector('[data-window-content]');
        if (container) {
            // If a specific verse element was clicked, sync to that verse
            if (clickedVerseElement) {
                const targetVerseIndex = parseInt(clickedVerseElement.dataset.verseIndex);
                if (!isNaN(targetVerseIndex)) {
                    this.syncOtherWindowsToThis(container, targetVerseIndex);
                    return;
                }
            }
            
            // Fallback to the original behavior (sync to currently visible verse)
            this.syncOtherWindowsToThis(container);
        }
    }
    
    // PERFORMANCE: Resize functions removed - textareas are proper size from start
    
    setupVerseControlsBatched(rightControlsContainer, leftControlsContainer, verseData, textarea, verseWrapper) {
        // PERFORMANCE: Batch all control creation to reduce DOM operations
        const rightFragment = document.createDocumentFragment();
        
        // History button for all users (viewers can see history)
        if (window.translationEditor) {
            const historyButton = document.createElement('button');
            historyButton.className = 'w-6 h-6 bg-transparent border-0 cursor-pointer flex items-center justify-center text-gray-400 rounded-sm hover:text-gray-600 history-btn';
            historyButton.innerHTML = '<i class="fas fa-history text-xs"></i>';
            historyButton.title = 'View edit history';
            historyButton.setAttribute('data-verse-index', verseData.index);
            
            historyButton.onclick = () => this.showVerseHistory(verseData, textarea);
            rightFragment.appendChild(historyButton);
            
            // Flag button for all users
            const flagButton = document.createElement('button');
            flagButton.className = 'w-6 h-6 bg-transparent border-0 cursor-pointer flex items-center justify-center text-gray-400 rounded-sm hover:text-gray-600 flag-btn';
            flagButton.innerHTML = '<i class="fas fa-flag text-xs"></i>';
            flagButton.title = 'View/Add flags';
            flagButton.setAttribute('data-verse-index', verseData.index);
            
            flagButton.onclick = () => this.openFlagModal(verseData);
            rightFragment.appendChild(flagButton);
            
            // Audio download button for primary windows
            if (this.type === 'primary') {
                const audioDownloadButton = document.createElement('button');
                audioDownloadButton.className = 'w-6 h-6 bg-transparent border-0 cursor-pointer flex items-center justify-center text-gray-400 rounded-sm hover:text-gray-600 audio-download-btn';
                audioDownloadButton.innerHTML = '<i class="fas fa-download text-xs"></i>';
                audioDownloadButton.title = 'Download verse audio';
                audioDownloadButton.style.display = 'none'; // Hidden by default, shown when audio exists
                
                audioDownloadButton.onclick = (e) => {
                    e.stopPropagation();
                    this.downloadVerseAudio(verseData, verseWrapper);
                };
                
                rightFragment.appendChild(audioDownloadButton);
                
                // Store reference for later visibility control
                verseWrapper._audioDownloadButton = audioDownloadButton;
            }
        }
        
        // Only add editing controls for editors
        if (window.translationEditor?.canEdit) {
            // Primary window gets audio controls on the left and sparkle button on the right
            if (this.type === 'primary') {
                // PERFORMANCE: Always create audio controls on the left side
                this.audioManager.createAudioControls(leftControlsContainer, verseData, textarea);
                
                // PERFORMANCE: Create sparkle button on the right side
                const sparkleButton = document.createElement('button');
                sparkleButton.className = 'w-7 h-7 bg-transparent border-0 cursor-pointer flex items-center justify-center text-gray-400 rounded-sm sparkle-translate-btn';
                sparkleButton.innerHTML = '<i class="fas fa-magic text-sm"></i>';
                sparkleButton.title = 'Translate this verse with AI';
                sparkleButton.setAttribute('data-verse', verseData.verse);
                sparkleButton.setAttribute('data-verse-index', verseData.index);
                
                // PERFORMANCE: Store handler reference for efficient cleanup
                sparkleButton._clickHandler = (e) => this.handleSparkleClick(e, verseData, textarea, sparkleButton);
                sparkleButton.onclick = sparkleButton._clickHandler;
                
                rightFragment.appendChild(sparkleButton);
            }
            
            // PERFORMANCE: Create drag handle on the right side
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
            
            rightFragment.appendChild(dragHandle);
        }
        
        // PERFORMANCE: Single DOM append instead of multiple
        rightControlsContainer.appendChild(rightFragment);
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
    
    openFlagModal(verseData) {
        if (window.FlagManager) {
            window.FlagManager.openFlagModal(verseData, this.id);
        }
    }
    
    downloadVerseAudio(verseData, verseWrapper) {
        // Find audio controls for this verse
        let audioControls = null;
        const allElements = verseWrapper.querySelectorAll('*');
        for (const el of allElements) {
            if (el._audioId) {
                audioControls = el;
                break;
            }
        }
        
        if (!audioControls || !audioControls._audioId) {
            alert('No audio file available for this verse.');
            return;
        }
        
        const projectId = window.location.pathname.split('/')[2];
        const editor = window.translationEditor;
        const book = editor?.currentBook || 'Unknown';
        const chapter = editor?.currentChapter || '1';
        
        // Create download link
        const link = document.createElement('a');
        link.href = `/project/${projectId}/verse-audio/${audioControls._audioId}/download`;
        link.download = `${book}_${chapter}_verse_${verseData.verse}.mp3`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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

    // Audio controls are now always created immediately - no lazy loading needed
    
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
                const sourceTextarea = textWindow.element?.querySelector(`textarea[data-verse-index="${verseData.index}"]`);
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