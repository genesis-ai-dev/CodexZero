// Virtual Scroll Manager for Translation Editor - Simplified and Working
class VirtualScrollManager {
    constructor(translationEditor) {
        this.editor = translationEditor;
        this.containers = new Map(); // windowId -> container element
        this.loadedVerses = new Map(); // windowId -> Map(verseIndex -> verseData)
        this.renderedVerses = new Map(); // windowId -> Set(verseIndex)
        this.currentChapterIndex = new Map(); // windowId -> verseIndex
        
        // Configuration - optimized for performance
        this.VERSE_HEIGHT = 120; // Estimated height per verse
        this.LOAD_THRESHOLD = 1500; // Load when within 1500px of edge
        this.VERSES_PER_LOAD = 50; // Reduced from 100 to 50 for better performance
        this.INITIAL_LOAD_SIZE = 30; // Initial load size for faster startup
        this.MIN_VERSE_INDEX = 0;
        this.MAX_VERSE_INDEX = 41898;
        this.MAX_RENDERED_VERSES = 300; // Maximum verses to keep rendered for memory management
        
        // Loading state per window
        this.isLoading = new Map(); // windowId -> boolean
        this.loadingDirection = new Map(); // windowId -> 'forward' | 'backward' | null
        
        // Scroll handling
        this.scrollHandlers = new Map(); // windowId -> handler function
        
        // Navigation update throttling
        this.navigationUpdateTimeout = null;
        
        console.log('VirtualScrollManager: Initialized with optimized settings');
    }
    
    registerContainer(windowId, container) {
        console.log(`VirtualScrollManager: Registering container for ${windowId}`);
        
        this.containers.set(windowId, container);
        this.loadedVerses.set(windowId, new Map());
        this.renderedVerses.set(windowId, new Set());
        this.isLoading.set(windowId, false);
        this.loadingDirection.set(windowId, null);
        
        // Set up scroll listener
        const scrollHandler = this.createScrollHandler(windowId);
        this.scrollHandlers.set(windowId, scrollHandler);
        container.addEventListener('scroll', scrollHandler, { passive: true });
    }
    
    unregisterContainer(windowId) {
        console.log(`VirtualScrollManager: Unregistering container for ${windowId}`);
        
        const container = this.containers.get(windowId);
        const handler = this.scrollHandlers.get(windowId);
        
        if (container && handler) {
            container.removeEventListener('scroll', handler);
        }
        
        this.containers.delete(windowId);
        this.loadedVerses.delete(windowId);
        this.renderedVerses.delete(windowId);
        this.isLoading.delete(windowId);
        this.loadingDirection.delete(windowId);
        this.scrollHandlers.delete(windowId);
        this.currentChapterIndex.delete(windowId);
    }
    
    createScrollHandler(windowId) {
        let scrollTimeout = null;
        
        return (event) => {
            const container = event.target;
            
            // Clear any existing timeout
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }
            
            // Immediate check for edge proximity
            this.checkAndLoadVerses(windowId, container);
            
            // Debounced navigation update
            scrollTimeout = setTimeout(() => {
                this.updateNavigationFromScroll(windowId, container);
            }, 200);
        };
    }
    
    checkAndLoadVerses(windowId, container) {
        // Skip if already loading
        if (this.isLoading.get(windowId)) {
            return;
        }
        
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        
        const distanceFromTop = scrollTop;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
        
        // Check if we need to load more verses
        if (distanceFromBottom < this.LOAD_THRESHOLD && distanceFromBottom >= 0) {
            console.log(`VirtualScrollManager: Near bottom for ${windowId} (${distanceFromBottom}px from bottom)`);
            this.loadMoreVerses(windowId, 'forward');
        } else if (distanceFromTop < this.LOAD_THRESHOLD && scrollTop > 0) {
            console.log(`VirtualScrollManager: Near top for ${windowId} (${distanceFromTop}px from top)`);
            this.loadMoreVerses(windowId, 'backward');
        }
    }
    
    async scrollToBookChapter(book, chapter) {
        console.log(`VirtualScrollManager: Navigating to ${book} ${chapter}`);
        
        // Store current book/chapter for context
        this.currentBook = book;
        this.currentChapter = chapter;
        
        // Load the chapter but maintain ability to scroll to other chapters
        this.containers.forEach(async (container, windowId) => {
            await this.loadChapterWithContext(windowId, book, chapter);
        });
    }
    
    async loadChapterWithContext(windowId, book, chapter) {
        console.log(`VirtualScrollManager: Loading ${book} ${chapter} for ${windowId}`);
        
        // Get the container and text window
        const container = this.containers.get(windowId);
        const textWindow = this.editor.textWindows.get(windowId);
        
        if (!container || !textWindow) {
            console.error(`VirtualScrollManager: Missing container or textWindow for ${windowId}`);
            return;
        }
        
        // Clear existing content
        container.innerHTML = '';
        container.scrollTop = 0;
        this.loadedVerses.get(windowId)?.clear();
        this.renderedVerses.get(windowId)?.clear();
        this.isLoading.set(windowId, false);
        this.loadingDirection.set(windowId, null);
        
        // STEP 2: Determine source ID
        let sourceId = windowId;
        if (windowId.includes('translation_')) {
            // Find a non-translation text as source
            for (const [id, metadata] of this.editor.textMetadata) {
                if (metadata.type !== 'Translation' && !id.includes('translation_')) {
                    sourceId = id;
                    break;
                }
            }
        }
        
        // STEP 3: Load the chapter directly from backend
        try {
            const response = await fetch(
                `/project/${this.editor.projectId}/translation/${windowId}/chapter/${book}/${chapter}?source_id=${sourceId}`
            );
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (!data.verses || !Array.isArray(data.verses)) {
                throw new Error('Invalid response: missing verses array');
            }
            
            console.log(`VirtualScrollManager: Loaded ${data.verses.length} verses for ${windowId}`);
            
            // STEP 4: Store the verse data
            const loadedVerses = this.loadedVerses.get(windowId);
            const renderedVerses = this.renderedVerses.get(windowId);
            
            data.verses.forEach(verse => {
                loadedVerses.set(verse.index, verse);
            });
            
            // STEP 5: Render all verses directly
            const fragment = document.createDocumentFragment();
            
            data.verses.forEach(verseData => {
                const verseElement = textWindow.createVerseElement(verseData, true);
                verseElement.dataset.verseIndex = verseData.index;
                
                // Setup textarea auto-resize
                this.setupTextareaAutoResize(verseElement);
                
                fragment.appendChild(verseElement);
                renderedVerses.add(verseData.index);
            });
            
            // STEP 6: Insert all content at once
            container.appendChild(fragment);
            
            // STEP 7: Auto-resize textareas after DOM insertion
            requestAnimationFrame(() => {
                const textareas = container.querySelectorAll('textarea');
                UIUtilities.batchAutoResizeTextareas(textareas);
            });
            
            // Store chapter start index for reference
            if (data.verses.length > 0) {
                this.currentChapterIndex.set(windowId, data.verses[0].index);
            }
            
            console.log(`VirtualScrollManager: Successfully loaded ${book} ${chapter} for ${windowId}`);
            
        } catch (error) {
            console.error(`VirtualScrollManager: Error loading ${windowId}:`, error);
            container.innerHTML = `<div class="p-4 text-red-600">Error loading ${book} ${chapter}: ${error.message}</div>`;
        }
    }
    
    // Initial load method
    async loadInitialVerses(windowId, book, chapter) {
        console.log(`VirtualScrollManager: Initial load for ${windowId}`);
        await this.loadChapterWithContext(windowId, book, chapter);
    }
    
    async loadMoreVerses(windowId, direction) {
        // Check if already loading
        if (this.isLoading.get(windowId)) {
            console.log(`VirtualScrollManager: Already loading for ${windowId}, skipping ${direction} load`);
            return;
        }
        
        this.isLoading.set(windowId, true);
        this.loadingDirection.set(windowId, direction);
        
        try {
            const loadedVerses = this.loadedVerses.get(windowId);
            if (!loadedVerses || loadedVerses.size === 0) {
                console.log(`VirtualScrollManager: No verses loaded for ${windowId}, cannot load more`);
                return;
            }
            
            // Get current range
            const indices = Array.from(loadedVerses.keys()).sort((a, b) => a - b);
            const minIndex = indices[0];
            const maxIndex = indices[indices.length - 1];
            
            let startIndex, endIndex;
            
            if (direction === 'forward') {
                // Try to load next set of verses
                startIndex = maxIndex + 1;
                endIndex = Math.min(this.MAX_VERSE_INDEX, startIndex + this.VERSES_PER_LOAD - 1);
                
                if (startIndex > this.MAX_VERSE_INDEX) {
                    console.log(`VirtualScrollManager: Reached end of Bible for ${windowId}`);
                    return;
                }
                
                // Just load the range - the backend will handle chapter boundaries
                
            } else {
                // Try to load previous set of verses
                endIndex = minIndex - 1;
                startIndex = Math.max(this.MIN_VERSE_INDEX, endIndex - this.VERSES_PER_LOAD + 1);
                
                if (endIndex < this.MIN_VERSE_INDEX) {
                    console.log(`VirtualScrollManager: Reached beginning of Bible for ${windowId}`);
                    return;
                }
                
                // Just load the range - the backend will handle chapter boundaries
            }
            
            console.log(`VirtualScrollManager: Loading ${direction} for ${windowId}: verses ${startIndex}-${endIndex}`);
            
            // Store scroll position before loading (critical for backward loading)
            const container = this.containers.get(windowId);
            const oldScrollTop = container.scrollTop;
            const oldScrollHeight = container.scrollHeight;
            
            // Store the first visible element for reference
            const firstVisibleElement = this.getCurrentVisibleVerse(windowId, container);
            const firstVisibleIndex = firstVisibleElement ? parseInt(firstVisibleElement.dataset.verseIndex) : null;
            const firstVisibleOffsetTop = firstVisibleElement ? firstVisibleElement.offsetTop : 0;
            
            await this.loadVerseRange(windowId, startIndex, endIndex);
            
            // Adjust scroll position if loading backward to maintain visual position
            if (direction === 'backward' && container && firstVisibleElement) {
                // Wait for DOM to update
                requestAnimationFrame(() => {
                    // Find the same element that was visible before
                    const sameElement = container.querySelector(`[data-verse-index="${firstVisibleIndex}"]`);
                    if (sameElement) {
                        // Calculate how much the element moved
                        const newOffsetTop = sameElement.offsetTop;
                        const offsetDifference = newOffsetTop - firstVisibleOffsetTop;
                        
                        // Adjust scroll to keep the same element in view
                        container.scrollTop = oldScrollTop + offsetDifference;
                        console.log(`VirtualScrollManager: Maintained scroll position by adjusting ${offsetDifference}px`);
                    } else {
                        // Fallback: adjust by height difference
                        const newScrollHeight = container.scrollHeight;
                        const heightAdded = newScrollHeight - oldScrollHeight;
                        if (heightAdded > 0) {
                            container.scrollTop = oldScrollTop + heightAdded;
                        }
                    }
                });
            }
            
        } catch (error) {
            console.error(`VirtualScrollManager: Error loading ${direction} verses:`, error);
        } finally {
            this.isLoading.set(windowId, false);
            this.loadingDirection.set(windowId, null);
        }
    }
    
    async loadVerseRange(windowId, startIndex, endIndex) {
        console.log(`VirtualScrollManager: Loading verse range ${startIndex}-${endIndex} for ${windowId}`);
        
        const container = this.containers.get(windowId);
        const textWindow = this.editor.textWindows.get(windowId);
        
        if (!container || !textWindow) {
            console.error(`VirtualScrollManager: Missing container or textWindow for ${windowId}`);
            return;
        }
        
        // Determine source ID
        let sourceId = windowId;
        if (windowId.includes('translation_')) {
            // Find a non-translation text as source
            for (const [id, metadata] of this.editor.textMetadata) {
                if (metadata.type !== 'Translation' && !id.includes('translation_')) {
                    sourceId = id;
                    break;
                }
            }
        }
        
        try {
            const response = await fetch(
                `/project/${this.editor.projectId}/translation/${windowId}/verse-range/${startIndex}/${endIndex}?source_id=${sourceId}`
            );
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (!data.verses || !Array.isArray(data.verses)) {
                throw new Error('Invalid response: missing verses array');
            }
            
            // Store verse data
            const loadedVerses = this.loadedVerses.get(windowId);
            data.verses.forEach(verse => {
                loadedVerses.set(verse.index, verse);
            });
            
            // Render the verses
            this.renderVerses(windowId, data.verses);
            
            // Clean up distant verses if we have too many rendered
            this.cleanupDistantVerses(windowId);
            
        } catch (error) {
            console.error(`VirtualScrollManager: Error fetching verse range:`, error);
            throw error;
        }
    }
    
    renderVerses(windowId, verses) {
        const container = this.containers.get(windowId);
        const textWindow = this.editor.textWindows.get(windowId);
        const renderedVerses = this.renderedVerses.get(windowId);
        
        if (!container || !textWindow || !renderedVerses) {
            return;
        }
        
        // Sort verses by index
        verses.sort((a, b) => a.index - b.index);
        
        // Create document fragment for batch insertion
        const fragment = document.createDocumentFragment();
        
        verses.forEach(verseData => {
            // Skip if already rendered
            if (renderedVerses.has(verseData.index)) {
                return;
            }
            
            // Create verse element
            const verseElement = textWindow.createVerseElement(verseData, true);
            verseElement.dataset.verseIndex = verseData.index;
            
            // Ensure textareas auto-resize to content
            this.setupTextareaAutoResize(verseElement);
            
            fragment.appendChild(verseElement);
            renderedVerses.add(verseData.index);
        });
        
        // Insert in correct position
        if (fragment.hasChildNodes()) {
            this.insertVersesInOrder(container, fragment, verses);
        }
    }
    
    setupTextareaAutoResize(verseElement) {
        const textareas = verseElement.querySelectorAll('textarea');
        textareas.forEach(textarea => {
            // Set initial height based on content using existing utility
            UIUtilities.autoResizeTextarea(textarea);
            
            // Add event listeners for auto-resize
            textarea.addEventListener('input', () => {
                UIUtilities.autoResizeTextarea(textarea);
            });
            
            textarea.addEventListener('paste', () => {
                // Delay resize to allow paste to complete
                setTimeout(() => {
                    UIUtilities.autoResizeTextarea(textarea);
                }, 10);
            });
        });
    }
    
    insertVersesInOrder(container, fragment, verses) {
        if (!verses.length) return;
        
        const firstNewIndex = verses[0].index;
        const existingElements = Array.from(container.querySelectorAll('[data-verse-index]'));
        
        // Find insertion point
        let insertBefore = null;
        for (const element of existingElements) {
            const elementIndex = parseInt(element.dataset.verseIndex);
            if (elementIndex > firstNewIndex) {
                insertBefore = element;
                break;
            }
        }
        
        if (insertBefore) {
            container.insertBefore(fragment, insertBefore);
        } else {
            container.appendChild(fragment);
        }
        
        // After insertion, ensure all textareas in the new content are properly sized
        requestAnimationFrame(() => {
            const newTextareas = container.querySelectorAll('textarea');
            UIUtilities.batchAutoResizeTextareas(newTextareas);
        });
    }
    
    scrollToVerseIndex(windowId, verseIndex) {
        const container = this.containers.get(windowId);
        if (!container) return;
        
        // Wait for next frame to ensure DOM is updated
        requestAnimationFrame(() => {
            const verseElement = container.querySelector(`[data-verse-index="${verseIndex}"]`);
            if (verseElement) {
                verseElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else {
                // Estimate position if element not found
                const estimatedTop = verseIndex * this.VERSE_HEIGHT;
                container.scrollTo({ top: estimatedTop, behavior: 'smooth' });
            }
        });
    }
    

    
    updateNavigationFromScroll(windowId, container) {
        // Get the currently visible verse by examining DOM elements
        const currentVerseElement = this.getCurrentVisibleVerse(windowId, container);
        
        if (!currentVerseElement) {
            // Fallback to estimation if no verse elements found
            const scrollTop = container.scrollTop;
            const currentVerseIndex = Math.floor(scrollTop / this.VERSE_HEIGHT);
            
            if (currentVerseIndex >= 0 && currentVerseIndex <= this.MAX_VERSE_INDEX) {
                this.fetchAndUpdateNavigation(currentVerseIndex);
            }
            return;
        }
        
        const verseIndex = parseInt(currentVerseElement.dataset.verseIndex);
        if (!isNaN(verseIndex)) {
            this.fetchAndUpdateNavigation(verseIndex);
        }
    }
    
    getCurrentVisibleVerse(windowId, container) {
        const scrollTop = container.scrollTop;
        const containerHeight = container.clientHeight;
        const viewportCenter = scrollTop + (containerHeight / 2);
        
        // Get all verse elements
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
    
    fetchAndUpdateNavigation(verseIndex) {
        // Throttle API calls to avoid overwhelming the server
        if (this.navigationUpdateTimeout) {
            return;
        }
        
        this.navigationUpdateTimeout = setTimeout(() => {
            this.navigationUpdateTimeout = null;
            
            fetch(`/project/${this.editor.projectId}/verse-info/${verseIndex}`)
                .then(response => response.json())
                .then(data => {
                    if (data.book && data.chapter) {
                        this.updateNavigationUI(data.book, data.chapter, verseIndex);
                    }
                })
                .catch(error => {
                    console.error('Error updating navigation:', error);
                });
        }, 100); // 100ms throttle
    }
    
    updateNavigationUI(book, chapter, verseIndex) {
        // Only update if actually changed
        if (book === this.editor.currentBook && chapter === this.editor.currentChapter) {
            return;
        }
        
        console.log(`VirtualScrollManager: Navigation updated to ${book} ${chapter} (verse ${verseIndex})`);
        
        this.editor.currentBook = book;
        this.editor.currentChapter = chapter;
        
        // Update sidebar dropdowns with smooth transitions
        if (window.setBookDropdownOption && window.BibleConstants) {
            const bookDisplayName = window.BibleConstants.getBookDisplayName ? 
                window.BibleConstants.getBookDisplayName(book) : book;
            window.setBookDropdownOption(book, bookDisplayName, true);
        }
        
        if (window.setChapterDropdownOption) {
            window.setChapterDropdownOption(chapter, `Chapter ${chapter}`, true);
        }
        
        // Save state
        if (this.editor.storage) {
            this.editor.storage.saveNavigationState(book, chapter);
        }
        
        // Update chapter options if navigation object exists
        if (this.editor.navigation && this.editor.navigation.updateChapterOptions) {
            this.editor.navigation.updateChapterOptions();
        }
        
        // Trigger custom event for other components that might need to sync
        const navigationEvent = new CustomEvent('navigationUpdated', {
            detail: { book, chapter, verseIndex }
        });
        document.dispatchEvent(navigationEvent);
    }
    
    cleanupDistantVerses(windowId) {
        const container = this.containers.get(windowId);
        const renderedVerses = this.renderedVerses.get(windowId);
        
        if (!container || !renderedVerses || renderedVerses.size <= this.MAX_RENDERED_VERSES) {
            return;
        }
        
        // Calculate viewport bounds
        const scrollTop = container.scrollTop;
        const viewportHeight = container.clientHeight;
        const bufferDistance = this.VERSE_HEIGHT * 100; // Keep 100 verses worth of buffer
        
        const viewportStart = Math.max(0, scrollTop - bufferDistance);
        const viewportEnd = scrollTop + viewportHeight + bufferDistance;
        
        // Find verses to remove (those outside the extended viewport)
        const versesToRemove = [];
        renderedVerses.forEach(verseIndex => {
            const estimatedTop = verseIndex * this.VERSE_HEIGHT;
            const estimatedBottom = estimatedTop + this.VERSE_HEIGHT;
            
            if (estimatedBottom < viewportStart || estimatedTop > viewportEnd) {
                versesToRemove.push(verseIndex);
            }
        });
        
        // Remove only if we have significantly more than the limit
        if (versesToRemove.length > 50) {
            versesToRemove.forEach(verseIndex => {
                const element = container.querySelector(`[data-verse-index="${verseIndex}"]`);
                if (element) {
                    element.remove();
                    renderedVerses.delete(verseIndex);
                }
            });
            
            console.log(`VirtualScrollManager: Cleaned up ${versesToRemove.length} distant verses for ${windowId}`);
        }
    }
    
    // Utility methods
    getLoadedVerseCount(windowId) {
        const verses = this.loadedVerses.get(windowId);
        return verses ? verses.size : 0;
    }
    
    getRenderedVerseCount(windowId) {
        const verses = this.renderedVerses.get(windowId);
        return verses ? verses.size : 0;
    }
    
    clearCache(windowId = null) {
        if (windowId) {
            this.loadedVerses.get(windowId)?.clear();
            this.renderedVerses.get(windowId)?.clear();
            this.currentChapterIndex.delete(windowId);
            this.isLoading.set(windowId, false);
            this.loadingDirection.set(windowId, null);
            
            const container = this.containers.get(windowId);
            if (container) {
                container.innerHTML = '';
                container.scrollTop = 0;
            }
        } else {
            this.loadedVerses.forEach(map => map.clear());
            this.renderedVerses.forEach(set => set.clear());
            this.currentChapterIndex.clear();
            this.isLoading.forEach((_, windowId) => this.isLoading.set(windowId, false));
            this.loadingDirection.forEach((_, windowId) => this.loadingDirection.set(windowId, null));
            
            this.containers.forEach(container => {
                container.innerHTML = '';
                container.scrollTop = 0;
            });
        }
        
        // Clear navigation timeout
        if (this.navigationUpdateTimeout) {
            clearTimeout(this.navigationUpdateTimeout);
            this.navigationUpdateTimeout = null;
        }
    }
} 