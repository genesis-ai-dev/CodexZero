// UI Utilities - Common patterns to eliminate DRY violations
class UIUtilities {
    static createButton(text, title, className, onClick) {
        const button = document.createElement('button');
        button.className = className;
        button.textContent = text;
        button.title = title;
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick(e);
        });
        return button;
    }
    
    static createModal(id, title, content, buttons = []) {
        return `
            <div id="${id}" class="hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
                <div class="bg-white border border-gray-300 rounded-lg p-6 w-full max-w-md mx-4">
                    <h3 class="text-xl font-bold mb-4">${title}</h3>
                    ${content}
                    <div class="flex justify-end space-x-3 pt-4">
                        ${buttons.map(btn => `
                            <button type="${btn.type || 'button'}" id="${btn.id}" class="${btn.className}">
                                ${btn.text}
                            </button>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }
    
    static setupEventListener(elementId, event, handler, options = {}) {
        const element = document.getElementById(elementId);
        if (element && !element.dataset.listenerAdded) {
            element.addEventListener(event, handler, options);
            element.dataset.listenerAdded = 'true';
        }
    }
    
    static autoResizeTextarea(textarea) {
        requestAnimationFrame(() => {
            textarea.style.height = 'auto';
            const newHeight = Math.max(80, textarea.scrollHeight);
            textarea.style.height = newHeight + 'px';
        });
    }
    
    static batchAutoResize(textareas) {
        const updates = [];
        textareas.forEach(textarea => {
            textarea.style.height = 'auto';
            const newHeight = Math.max(80, textarea.scrollHeight);
            updates.push({ textarea, height: newHeight });
        });
        updates.forEach(({ textarea, height }) => {
            textarea.style.height = height + 'px';
        });
    }
    
    static showLoading(message = 'Loading...') {
        let overlay = document.getElementById('global-loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'global-loading-overlay';
            overlay.className = 'fixed inset-0 bg-white bg-opacity-90 z-50 flex items-center justify-center';
            overlay.innerHTML = `
                <div class="text-center">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <div id="loading-message" class="text-gray-600">${message}</div>
                </div>
            `;
            document.body.appendChild(overlay);
        } else {
            document.getElementById('loading-message').textContent = message;
            overlay.classList.remove('hidden');
        }
    }
    
    static hideLoading() {
        const overlay = document.getElementById('global-loading-overlay');
        if (overlay) overlay.classList.add('hidden');
    }
    
    static updateLoadingMessage(message) {
        const messageEl = document.getElementById('loading-message');
        if (messageEl) messageEl.textContent = message;
    }
}

// Make available globally
window.UIUtilities = UIUtilities; 