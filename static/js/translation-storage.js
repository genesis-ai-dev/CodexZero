// Translation Storage and State Management
class TranslationStorage {
    constructor(projectId) {
        this.projectId = projectId;
    }
    
    // LocalStorage helpers for remembering selections
    saveToLocalStorage(key, value) {
        localStorage.setItem(`translation_editor_${this.projectId}_${key}`, value);
    }
    
    getFromLocalStorage(key) {
        return localStorage.getItem(`translation_editor_${this.projectId}_${key}`);
    }
    
    // Save current layout state
    saveLayoutState(textWindows, primaryTextId) {
        const openTexts = Array.from(textWindows.keys());
        this.saveToLocalStorage('openTexts', JSON.stringify(openTexts));
        this.saveToLocalStorage('primaryTextId', primaryTextId || '');
    }
    
    // Get saved layout state
    getSavedLayoutState() {
        const savedTexts = this.getFromLocalStorage('openTexts');
        const savedPrimary = this.getFromLocalStorage('primaryTextId');
        
        return {
            textIds: savedTexts ? JSON.parse(savedTexts) : [],
            primaryTextId: savedPrimary || null
        };
    }
    
    // Recent chapters management
    addToRecentChapters(currentBook, currentChapter) {
        const recentKey = `recent_chapters_${this.projectId}`;
        let recent = JSON.parse(localStorage.getItem(recentKey) || '[]');
        
        const currentRef = `${currentBook} ${currentChapter}`;
        
        // Remove if already exists
        recent = recent.filter(ref => ref !== currentRef);
        
        // Add to beginning
        recent.unshift(currentRef);
        
        // Keep only last 5
        recent = recent.slice(0, 5);
        
        localStorage.setItem(recentKey, JSON.stringify(recent));
        return recent;
    }
    
    getRecentChapters() {
        const recentKey = `recent_chapters_${this.projectId}`;
        return JSON.parse(localStorage.getItem(recentKey) || '[]');
    }
    
    // Navigation state
    saveNavigationState(book, chapter) {
        this.saveToLocalStorage('currentBook', book);
        this.saveToLocalStorage('currentChapter', chapter.toString());
    }
    
    getNavigationState() {
        return {
            book: this.getFromLocalStorage('currentBook') || 'GEN',
            chapter: parseInt(this.getFromLocalStorage('currentChapter')) || 1
        };
    }
}

// Make available globally
window.TranslationStorage = TranslationStorage; 