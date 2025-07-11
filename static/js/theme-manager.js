// Theme Management - Extracted from TextWindow
class ThemeManager {
    constructor(windowId) {
        this.windowId = windowId;
        this.colorTheme = this.getStoredColorTheme();
    }
    
    getStoredColorTheme() {
        const storageKey = `text_window_color_${this.windowId}`;
        return localStorage.getItem(storageKey) || 'theme-default';
    }
    
    setColorTheme(theme) {
        this.colorTheme = theme;
        const storageKey = `text_window_color_${this.windowId}`;
        localStorage.setItem(storageKey, theme);
    }
    
    getThemeClasses() {
        const themes = {
            'theme-default': 'border-gray-800',
            'theme-blue': 'border-blue-600',
            'theme-green': 'border-green-600',
            'theme-red': 'border-red-600',
            'theme-purple': 'border-purple-600',
            'theme-orange': 'border-orange-600'
        };
        return themes[this.colorTheme] || themes['theme-default'];
    }
    
    getHeaderThemeClasses() {
        const themes = {
            'theme-default': 'bg-gray-100 text-gray-800 border-gray-800',
            'theme-blue': 'bg-blue-100 text-blue-800 border-blue-600',
            'theme-green': 'bg-green-100 text-green-800 border-green-600',
            'theme-red': 'bg-red-100 text-red-800 border-red-600',
            'theme-purple': 'bg-purple-100 text-purple-800 border-purple-600',
            'theme-orange': 'bg-orange-100 text-orange-800 border-orange-600'
        };
        return themes[this.colorTheme] || themes['theme-default'];
    }
    
    createColorPicker() {
        const colorOptions = [
            { theme: 'theme-default', color: 'bg-gray-400' },
            { theme: 'theme-blue', color: 'bg-blue-600' },
            { theme: 'theme-green', color: 'bg-green-600' },
            { theme: 'theme-red', color: 'bg-red-600' },
            { theme: 'theme-purple', color: 'bg-purple-600' },
            { theme: 'theme-orange', color: 'bg-orange-600' }
        ];
        
        const picker = document.createElement('div');
        picker.className = 'color-picker flex items-center gap-1 ml-2';
        picker.innerHTML = colorOptions.map(option => `
            <button 
                class="color-option w-4 h-4 rounded-full border ${option.color} hover:scale-110 transition-transform"
                data-theme-option="${option.theme}"
                title="Change color theme"
            ></button>
        `).join('');
        
        picker.addEventListener('click', (e) => {
            const themeOption = e.target.getAttribute('data-theme-option');
            if (themeOption) {
                this.setColorTheme(themeOption);
                this.updateElementTheme();
            }
        });
        
        return picker;
    }
    
    updateElementTheme() {
        const element = document.querySelector(`[data-text-id="${this.windowId}"]`);
        if (!element) return;
        
        const themeClasses = this.getThemeClasses();
        const headerThemeClasses = this.getHeaderThemeClasses();
        
        element.className = `flex flex-col border rounded-sm overflow-hidden bg-white min-h-15 flex-1 ${themeClasses}`;
        
        const header = element.querySelector('[data-window-header]');
        if (header) {
            header.className = `px-4 py-3 text-sm font-bold border-b flex items-center justify-between flex-shrink-0 uppercase tracking-wider cursor-grab active:cursor-grabbing ${headerThemeClasses}`;
        }
        
        this.updateColorOptionStates();
    }
    
    updateColorOptionStates() {
        const colorOptions = document.querySelectorAll(`[data-text-id="${this.windowId}"] [data-theme-option]`);
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
}

// Make available globally
window.ThemeManager = ThemeManager; 