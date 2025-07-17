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
        const textIds = Array.from(textWindows.keys());
        const layoutState = {
            textIds: textIds,
            primaryTextId: primaryTextId || null,
            timestamp: Date.now()
        };
        
        this.saveToLocalStorage('layoutState', JSON.stringify(layoutState));
    }
    
    // Get saved layout state
    getSavedLayoutState() {
        const saved = this.getFromLocalStorage('layoutState');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Error parsing layout state:', e);
            }
        }
        return { textIds: [], primaryTextId: null };
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
    
    // Sidebar state
    setSidebarState(collapsed) {
        this.saveToLocalStorage('sidebarCollapsed', collapsed ? 'true' : 'false');
    }
    
    getSidebarState() {
        const saved = this.getFromLocalStorage('sidebarCollapsed');
        return saved === 'true';
    }
    
    // Window resize layout persistence
    setLayoutWidths(leftWidth, rightWidth) {
        const widths = [leftWidth, rightWidth];
        this.saveToLocalStorage('layoutWidths', JSON.stringify(widths));
    }
    
    getLayoutWidths() {
        const saved = this.getFromLocalStorage('layoutWidths');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error('Error parsing layout widths:', e);
            }
        }
        return [50, 50]; // Default 50/50 split
    }
}

// Make available globally
window.TranslationStorage = TranslationStorage; 