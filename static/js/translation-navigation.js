// Translation Navigation System
class TranslationNavigation {
    constructor(translationEditor) {
        this.editor = translationEditor;
        this.setupDropdownListeners();
    }
    
    setupDropdownListeners() {
        // Book dropdown change listener
        const bookButton = document.getElementById('goto-book-button');
        if (bookButton) {
            bookButton.addEventListener('change', (e) => {
                const bookCode = e.detail?.value || bookButton.dataset.value;
                if (bookCode && bookCode !== this.editor.currentBook) {
                    this.jumpToBook(bookCode);
                }
            });
        }
        
        // Chapter dropdown change listener
        const chapterButton = document.getElementById('goto-chapter-button');
        if (chapterButton) {
            chapterButton.addEventListener('change', (e) => {
                const chapter = parseInt(e.detail?.value || chapterButton.dataset.value);
                if (chapter && chapter !== this.editor.currentChapter) {
                    this.navigateToChapter(chapter);
                }
            });
        }
    }
    
    populateBookOptions() {
        // Get available books from bookChapters and sort by biblical order
        const availableBooks = Object.keys(this.editor.bookChapters);
        const sortedBooks = BibleConstants.BIBLICAL_ORDER.filter(book => availableBooks.includes(book));
        
        // Add any books not in our standard list (for custom/additional books)
        const remainingBooks = availableBooks.filter(book => !BibleConstants.BIBLICAL_ORDER.includes(book));
        remainingBooks.sort(); // Sort remaining books alphabetically as fallback
        
        const books = [...sortedBooks, ...remainingBooks].map(bookCode => ({
            value: bookCode,
            name: BibleConstants.getBookDisplayName(bookCode)
        }));
        
        // Use the new dropdown population function
        if (window.populateBookDropdown) {
            window.populateBookDropdown(books);
        }
    }
    
    updateChapterTitle() {
        // Chapter title element no longer exists in simplified header
        this.updateNavigationButtons();
        this.updateChapterOptions();
    }
    
    updateNavigationButtons() {
        // Navigation buttons no longer exist in simplified header
        const prevBtn = document.getElementById('prev-chapter-btn');
        const nextBtn = document.getElementById('next-chapter-btn');
        
        if (!prevBtn || !nextBtn) return; // Elements don't exist in simplified header
        
        const maxChapters = this.editor.bookChapters[this.editor.currentBook] || 1;
        
        // Update prev button
        if (this.editor.currentChapter <= 1) {
            prevBtn.disabled = true;
            prevBtn.style.opacity = '0.5';
        } else {
            prevBtn.disabled = false;
            prevBtn.style.opacity = '1';
        }
        
        // Update next button
        if (this.editor.currentChapter >= maxChapters) {
            nextBtn.disabled = true;
            nextBtn.style.opacity = '0.5';
        } else {
            nextBtn.disabled = false;
            nextBtn.style.opacity = '1';
        }
    }
    
    navigateToPreviousChapter() {
        if (this.editor.currentChapter > 1) {
            this.navigateToChapter(this.editor.currentChapter - 1);
        }
    }
    
    navigateToNextChapter() {
        const maxChapters = this.editor.bookChapters[this.editor.currentBook] || 1;
        if (this.editor.currentChapter < maxChapters) {
            this.navigateToChapter(this.editor.currentChapter + 1);
        }
    }
    
    async navigateToChapter(chapter) {
        console.log(`TranslationNavigation: Navigating to chapter ${chapter} in ${this.editor.currentBook}`);
        
        // Clear any active searches first
        this.clearAllSearchModes();
        
        // Show loading indicator for chapter navigation
        UIUtilities.showLoading(`Loading ${BibleConstants.getBookDisplayName(this.editor.currentBook)} ${chapter}...`);
        
        try {
            this.editor.currentChapter = chapter;
            this.editor.storage.saveNavigationState(this.editor.currentBook, chapter);
            
            // Update the chapter dropdown display
            if (window.setChapterDropdownOption) {
                window.setChapterDropdownOption(chapter, `Chapter ${chapter}`);
            }
            
            this.updateChapterTitle();
            
            // Use virtual scroll manager if available, otherwise fall back to refresh
            if (this.editor.virtualScrollManager) {
                try {
                    await this.editor.virtualScrollManager.scrollToBookChapter(this.editor.currentBook, chapter);
                } catch (error) {
                    console.error('Error navigating to chapter:', error);
                    // Fallback to refresh if virtual scroll fails
                    this.editor.refreshAllTexts();
                }
            } else {
                this.editor.refreshAllTexts();
            }
        } finally {
            UIUtilities.hideLoading();
        }
    }
    
    async jumpToBook(book) {
        console.log(`TranslationNavigation: Jumping to book ${book} chapter 1`);
        
        // Clear any active searches first
        this.clearAllSearchModes();
        
        // Show loading indicator for distant navigation
        UIUtilities.showLoading(`Navigating to ${BibleConstants.getBookDisplayName(book)}...`);
        
        try {
            this.editor.currentBook = book;
            this.editor.currentChapter = 1; // Reset to chapter 1 when jumping to a new book
            this.editor.storage.saveNavigationState(book, 1);
            
            // Update the dropdown displays
            if (window.setBookDropdownOption) {
                window.setBookDropdownOption(book, BibleConstants.getBookDisplayName(book));
            }
            if (window.setChapterDropdownOption) {
                window.setChapterDropdownOption(1, 'Chapter 1');
            }
            
            this.updateChapterOptions();
            this.updateChapterTitle();
            
            // Use virtual scroll manager if available, otherwise fall back to refresh
            if (this.editor.virtualScrollManager) {
                try {
                    await this.editor.virtualScrollManager.scrollToBookChapter(book, 1);
                } catch (error) {
                    console.error('Error jumping to book:', error);
                    // Fallback to refresh if virtual scroll fails
                    this.editor.refreshAllTexts();
                }
            } else {
                this.editor.refreshAllTexts();
            }
        } finally {
            UIUtilities.hideLoading();
        }
    }
    
    addToRecentChapters() {
        const recent = this.editor.storage.addToRecentChapters(this.editor.currentBook, this.editor.currentChapter);
        this.updateRecentChaptersUI(recent);
    }
    
    updateRecentChaptersUI(recent = null) {
        if (!recent) {
            recent = this.editor.storage.getRecentChapters();
        }
        
        const container = document.getElementById('recent-chapters');
        if (!container) return;
        
        if (recent.length === 0) {
            container.innerHTML = '<div class="text-xs text-gray-500 italic">No recent chapters</div>';
            return;
        }
        
        container.innerHTML = recent.map(ref => {
            const [book, chapter] = ref.split(' ');
            const isCurrent = book === this.editor.currentBook && parseInt(chapter) === this.editor.currentChapter;
            
            return `
                <button class="recent-chapter-btn w-full text-left px-2 py-1 text-xs font-medium transition-colors rounded-sm ${
                    isCurrent 
                        ? 'bg-blue-100 text-blue-700 border border-blue-300' 
                        : 'hover:bg-gray-100 text-gray-700'
                }" 
                        data-book="${book}" 
                        data-chapter="${chapter}"
                        ${isCurrent ? 'disabled' : ''}>
                    ${BibleConstants.getBookDisplayName(book)} ${chapter}
                </button>
            `;
        }).join('');
        
        // Add click listeners to recent chapter buttons
        container.querySelectorAll('.recent-chapter-btn:not([disabled])').forEach(btn => {
            btn.addEventListener('click', async () => {
                const book = btn.dataset.book;
                const chapter = parseInt(btn.dataset.chapter);
                
                console.log(`TranslationNavigation: Navigating to recent chapter ${book} ${chapter}`);
                
                // Show loading indicator
                UIUtilities.showLoading(`Loading ${BibleConstants.getBookDisplayName(book)} ${chapter}...`);
                
                try {
                    this.editor.currentBook = book;
                    this.editor.currentChapter = chapter;
                    this.editor.storage.saveNavigationState(book, chapter);
                    
                    // Update dropdown displays
                    if (window.setBookDropdownOption) {
                        window.setBookDropdownOption(book, BibleConstants.getBookDisplayName(book));
                    }
                    if (window.setChapterDropdownOption) {
                        window.setChapterDropdownOption(chapter, `Chapter ${chapter}`);
                    }
                    
                    this.updateChapterOptions();
                    this.updateChapterTitle();
                    
                    // Use virtual scroll manager if available, otherwise fall back to refresh
                    if (this.editor.virtualScrollManager) {
                        try {
                            await this.editor.virtualScrollManager.scrollToBookChapter(book, chapter);
                        } catch (error) {
                            console.error('Error navigating to recent chapter:', error);
                            // Fallback to refresh if virtual scroll fails
                            this.editor.refreshAllTexts();
                        }
                    } else {
                        this.editor.refreshAllTexts();
                    }
                } finally {
                    UIUtilities.hideLoading();
                }
            });
        });
    }
    

    
    updateChapterOptions() {
        if (!this.editor.currentBook || !this.editor.bookChapters[this.editor.currentBook]) {
            if (window.populateChapterDropdown) {
                window.populateChapterDropdown([]);
            }
            return;
        }
        
        const maxChapters = this.editor.bookChapters[this.editor.currentBook];
        
        const chapters = [];
        for (let i = 1; i <= maxChapters; i++) {
            chapters.push({
                value: i,
                name: `Chapter ${i}`
            });
        }
        
        // Use the new dropdown population function
        if (window.populateChapterDropdown) {
            window.populateChapterDropdown(chapters);
        }
        
        // Set current selection
        if (window.setChapterDropdownOption) {
            window.setChapterDropdownOption(this.editor.currentChapter, `Chapter ${this.editor.currentChapter}`);
        }
    }
    
    clearAllSearchModes() {
        // Clear search mode from all text windows
        for (const [windowId, textWindow] of this.editor.textWindows) {
            if (textWindow.isSearchMode) {
                textWindow.clearSearch();
                
                // Also clear the search input in the header
                const searchInput = textWindow.element?.querySelector('.search-input');
                if (searchInput) {
                    searchInput.value = '';
                }
                
                // Hide the clear button
                const clearBtn = textWindow.element?.querySelector('.clear-search-btn');
                if (clearBtn) {
                    clearBtn.classList.add('hidden');
                }
            }
        }
    }
}

// Make available globally
window.TranslationNavigation = TranslationNavigation; 