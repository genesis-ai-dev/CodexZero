// PERFORMANCE: Optimized UI Utilities Class
class UIUtilities {
    // PERFORMANCE: Cache for throttled functions
    static throttledCallbacks = new Map();
    static debouncedCallbacks = new Map();
    
    static showLoading(message = 'Loading...') {
        const overlay = document.getElementById('global-loading-overlay');
        if (overlay) {
            overlay.innerHTML = `
                <div class="text-center">
                    <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <div class="text-neutral-600">${message}</div>
                </div>
            `;
            overlay.classList.remove('hidden');
        }
    }
    
    static hideLoading() {
        const overlay = document.getElementById('global-loading-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
        }
    }
    
    static updateLoadingMessage(message) {
        const overlay = document.getElementById('global-loading-overlay');
        if (overlay && !overlay.classList.contains('hidden')) {
            const messageEl = overlay.querySelector('.text-neutral-600');
            if (messageEl) {
                messageEl.textContent = message;
            }
        }
    }
    
    // PERFORMANCE: Auto-resize textarea based on content - optimized version
    static autoResizeTextarea(textarea) {
        // PERFORMANCE: Use line-based calculation instead of scrollHeight
        const lines = textarea.value.split('\n');
        const lineCount = lines.length;
        const maxLineLength = Math.max(...lines.map(line => line.length));
        
        // Estimate height based on line count and content
        const baseHeight = 80; // minimum height
        const lineHeight = 24; // approximate line height
        const padding = 32; // textarea padding
        
        // Add extra height for long lines that might wrap
        const wrapFactor = Math.ceil(maxLineLength / 80); // assume ~80 chars per line
        const estimatedHeight = baseHeight + (lineCount * wrapFactor * lineHeight) + padding;
        
        const newHeight = Math.min(estimatedHeight, 400); // max height limit
        
        // Only update if significantly different to avoid layout thrashing
        if (Math.abs(textarea.offsetHeight - newHeight) > 10) {
            textarea.style.height = newHeight + 'px';
        }
    }

    // PERFORMANCE: Batch auto-resize multiple textareas
    static batchAutoResizeTextareas(textareas) {
        // Use DocumentFragment for batched operations
        const fragment = document.createDocumentFragment();
        const updates = [];
        
        textareas.forEach(textarea => {
            const lines = textarea.value.split('\n');
            const lineCount = lines.length;
            const maxLineLength = Math.max(...lines.map(line => line.length));
            
            const baseHeight = 80;
            const lineHeight = 24;
            const padding = 32;
            const wrapFactor = Math.ceil(maxLineLength / 80);
            const estimatedHeight = baseHeight + (lineCount * wrapFactor * lineHeight) + padding;
            const newHeight = Math.min(estimatedHeight, 400);
            
            if (Math.abs(textarea.offsetHeight - newHeight) > 10) {
                updates.push({ textarea, height: newHeight });
            }
        });
        
        // Apply all updates at once
        updates.forEach(({ textarea, height }) => {
            textarea.style.height = height + 'px';
        });
    }
    
    // PERFORMANCE: Improved throttled callback with caching
    static createThrottledCallback(callback, delay = 16) {
        const key = callback.toString() + delay;
        
        if (this.throttledCallbacks.has(key)) {
            return this.throttledCallbacks.get(key);
        }
        
        let isThrottled = false;
        const throttledFn = function(...args) {
            if (!isThrottled) {
                callback.apply(this, args);
                isThrottled = true;
                setTimeout(() => isThrottled = false, delay);
            }
        };
        
        this.throttledCallbacks.set(key, throttledFn);
        return throttledFn;
    }
    
    // PERFORMANCE: Improved debounced input handler
    static createDebouncedInputHandler(callback, delay = 100) {
        const key = callback.toString() + delay;
        
        if (this.debouncedCallbacks.has(key)) {
            return this.debouncedCallbacks.get(key);
        }
        
        let timeoutId;
        const debouncedFn = function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => callback.apply(this, args), delay);
        };
        
        this.debouncedCallbacks.set(key, debouncedFn);
        return debouncedFn;
    }
    
    // PERFORMANCE: Optimized event listener setup
    static setupEventListener(elementId, event, handler, options = {}) {
        const element = document.getElementById(elementId);
        if (element && !element._listeners?.[event]) {
            element._listeners = element._listeners || {};
            element._listeners[event] = true;
            
            // Use passive listeners where possible for better performance
            const defaultOptions = { passive: true, ...options };
            element.addEventListener(event, handler, defaultOptions);
        }
    }
    
    // PERFORMANCE: Batch DOM queries
    static batchQuerySelector(selectors) {
        const results = {};
        selectors.forEach(selector => {
            results[selector] = document.querySelectorAll(selector);
        });
        return results;
    }
    
    // PERFORMANCE: Optimized class toggling
    static batchToggleClasses(elements, classesToAdd = [], classesToRemove = []) {
        requestAnimationFrame(() => {
            elements.forEach(element => {
                if (classesToRemove.length) {
                    element.classList.remove(...classesToRemove);
                }
                if (classesToAdd.length) {
                    element.classList.add(...classesToAdd);
                }
            });
        });
    }
    
    // PERFORMANCE: Intersection Observer helper
    static createIntersectionObserver(callback, options = {}) {
        const defaultOptions = {
            threshold: 0.1,
            rootMargin: '50px',
            ...options
        };
        
        return new IntersectionObserver(callback, defaultOptions);
    }
    
    // PERFORMANCE: Throttled scroll handler
    static createThrottledScrollHandler(callback, delay = 16) {
        return this.createThrottledCallback(callback, delay);
    }
}

// Make available globally
window.UIUtilities = UIUtilities; 