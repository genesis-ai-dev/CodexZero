// Translation Navigation System
class TranslationNavigation {
    constructor(translationEditor) {
        this.editor = translationEditor;
    }
    
    populateBookOptions() {
        const bookSelect = document.getElementById('goto-book');
        if (!bookSelect) return;
        
        bookSelect.innerHTML = '';
        
        // Get available books from bookChapters and sort by biblical order
        const availableBooks = Object.keys(this.editor.bookChapters);
        const sortedBooks = BibleConstants.BIBLICAL_ORDER.filter(book => availableBooks.includes(book));
        
        // Add any books not in our standard list (for custom/additional books)
        const remainingBooks = availableBooks.filter(book => !BibleConstants.BIBLICAL_ORDER.includes(book));
        remainingBooks.sort(); // Sort remaining books alphabetically as fallback
        
        [...sortedBooks, ...remainingBooks].forEach(bookCode => {
            const option = document.createElement('option');
            option.value = bookCode;
            option.textContent = BibleConstants.getBookDisplayName(bookCode);
            bookSelect.appendChild(option);
        });
    }
    
    updateChapterTitle() {
        // Chapter title element no longer exists in simplified header
        this.updateNavigationButtons();
        this.updateChapterOptions();
        this.populateTestamentSections();
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
    
    navigateToChapter(chapter) {
        this.editor.currentChapter = chapter;
        this.editor.storage.saveNavigationState(this.editor.currentBook, chapter);
        
        const gotoChapter = document.getElementById('goto-chapter');
        if (gotoChapter) {
            gotoChapter.value = chapter;
        }
        
        this.updateChapterTitle();
        this.editor.refreshAllTexts();
    }
    
    jumpToBook(book) {
        this.editor.currentBook = book;
        this.editor.currentChapter = 1; // Reset to chapter 1 when jumping to a new book
        this.editor.storage.saveNavigationState(book, 1);
        
        const gotoBook = document.getElementById('goto-book');
        const gotoChapter = document.getElementById('goto-chapter');
        
        if (gotoBook) {
            gotoBook.value = this.editor.currentBook;
        }
        if (gotoChapter) {
            gotoChapter.value = 1;
        }
        
        this.updateChapterOptions();
        this.updateChapterTitle();
        this.editor.refreshAllTexts();
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
            btn.addEventListener('click', () => {
                const book = btn.dataset.book;
                const chapter = parseInt(btn.dataset.chapter);
                
                this.editor.currentBook = book;
                this.editor.currentChapter = chapter;
                this.editor.storage.saveNavigationState(book, chapter);
                
                const gotoBook = document.getElementById('goto-book');
                const gotoChapter = document.getElementById('goto-chapter');
                
                if (gotoBook) {
                    gotoBook.value = book;
                }
                if (gotoChapter) {
                    gotoChapter.value = chapter;
                }
                
                this.updateChapterOptions();
                this.updateChapterTitle();
                this.editor.refreshAllTexts();
            });
        });
    }
    
    populateTestamentSections() {
        this.populateTestamentBooks('ot-books', BibleConstants.OLD_TESTAMENT_BOOKS);
        this.populateTestamentBooks('nt-books', BibleConstants.NEW_TESTAMENT_BOOKS);
    }
    
    populateTestamentBooks(containerId, books) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        container.innerHTML = '';
        
        books.forEach(bookCode => {
            const available = this.editor.bookChapters[bookCode];
            const isCurrent = bookCode === this.editor.currentBook;
            
            if (available) { // Show all available books
                const button = document.createElement('button');
                button.className = `w-full text-left px-3 py-2 text-xs font-medium transition-colors marker-border-thin ${
                    isCurrent 
                        ? 'cursor-not-allowed opacity-50' 
                        : 'hover:bg-gray-50'
                }`;
                button.style.cssText = `
                    background: ${isCurrent ? '#f3f4f6' : '#fefdf8'}; 
                    color: ${isCurrent ? '#9ca3af' : '#2d2d2d'}; 
                    border: 1px solid ${isCurrent ? '#d1d5db' : '#2d2d2d'}; 
                    border-radius: 1px;
                `;
                button.textContent = `${BibleConstants.getBookDisplayName(bookCode)} (${available})`;
                button.disabled = isCurrent;
                
                if (!isCurrent) {
                    button.addEventListener('click', () => {
                        this.jumpToBook(bookCode);
                    });
                }
                
                container.appendChild(button);
            }
        });
    }
    
    toggleTestamentSection(testament) {
        const booksContainer = document.getElementById(`${testament}-books`);
        const chevron = document.getElementById(`${testament}-chevron`);
        
        if (booksContainer.classList.contains('hidden')) {
            // Show the section
            booksContainer.classList.remove('hidden');
            chevron.style.transform = 'rotate(180deg)';
        } else {
            // Hide the section
            booksContainer.classList.add('hidden');
            chevron.style.transform = 'rotate(0deg)';
        }
    }
    
    updateChapterOptions() {
        const chapterSelect = document.getElementById('goto-chapter');
        if (!chapterSelect) return;
        
        chapterSelect.innerHTML = '';
        
        if (!this.editor.currentBook || !this.editor.bookChapters[this.editor.currentBook]) {
            chapterSelect.innerHTML = '<option value="">Select Chapter...</option>';
            return;
        }
        
        const maxChapters = this.editor.bookChapters[this.editor.currentBook];
        
        for (let i = 1; i <= maxChapters; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = `Chapter ${i}`;
            if (i === this.editor.currentChapter) {
                option.selected = true;
            }
            chapterSelect.appendChild(option);
        }
    }
}

// Make available globally
window.TranslationNavigation = TranslationNavigation; 