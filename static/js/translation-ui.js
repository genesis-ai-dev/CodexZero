// Translation UI Controls
class TranslationUI {
    constructor() {
        this.currentModels = {};
        this.setupModelSelection();
        // Don't load models immediately - wait for translation editor to be ready
    }
    
    setupModelSelection() {
        const modelButton = document.getElementById('translation-model-button');
        const refreshBtn = document.getElementById('refresh-models-btn');
        
        if (modelButton) {
            modelButton.addEventListener('change', (e) => {
                const modelId = e.detail?.value || modelButton.dataset.value;
                if (modelId && this.currentModels[modelId]) {
                    this.setTranslationModel(modelId);
                }
            });
        }
        
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadTranslationModels();
            });
        }
    }
    
    // Called by translation editor after it's initialized
    initializeModels() {
        this.loadTranslationModels();
    }
    
    async loadTranslationModels() {
        try {
            const projectId = window.translationEditor?.projectId;
            if (!projectId) {
                console.warn('Translation editor not available yet for model loading');
                return;
            }
            
            const response = await fetch(`/project/${projectId}/translation-models`);
            const data = await response.json();
            
            if (data.success) {
                this.currentModels = data.models;
                this.populateModelSelect(data.models, data.current_model);
            } else {
                console.error('Failed to load models:', data.error);
            }
        } catch (error) {
            console.error('Error loading translation models:', error);
        }
    }
    
    async setTranslationModel(modelId) {
        try {
            const projectId = window.translationEditor?.projectId;
            if (!projectId) return;
            
            const response = await fetch(`/project/${projectId}/translation-model`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ model_id: modelId })
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.showModelUpdateFeedback(data.message);
            }
        } catch (error) {
            console.error('Error setting translation model:', error);
        }
    }
    
    populateModelSelect(models, currentModel) {
        // Group models by type
        const fineTunedModels = [];
        const baseModels = [];
        
        Object.entries(models).forEach(([modelId, modelInfo]) => {
            if (modelInfo.type === 'fine_tuned') {
                fineTunedModels.push([modelId, modelInfo]);
            } else if (modelInfo.type === 'base') {
                baseModels.push([modelId, modelInfo]);
            }
        });
        
        // Sort fine-tuned models by creation date (newest first)
        fineTunedModels.sort((a, b) => {
            if (!a[1].created_at) return 1;
            if (!b[1].created_at) return -1;
            return new Date(b[1].created_at) - new Date(a[1].created_at);
        });
        
        // Sort base models alphabetically
        baseModels.sort((a, b) => a[1].name.localeCompare(b[1].name));
        
        // Create dropdown options array
        const dropdownModels = [];
        
        // Add fine-tuned models first (if any)
        if (fineTunedModels.length > 0) {
            fineTunedModels.forEach(([modelId, modelInfo]) => {
                dropdownModels.push({
                    value: modelId,
                    name: `🎯 ${modelInfo.name}`,
                    type: modelInfo.type
                });
            });
        }
        
        // Add base models
        if (baseModels.length > 0) {
            baseModels.forEach(([modelId, modelInfo]) => {
                dropdownModels.push({
                    value: modelId,
                    name: `${modelInfo.name}`,
                    type: modelInfo.type
                });
            });
        }
        
        // Use the new dropdown population function
        if (window.populateModelDropdown) {
            window.populateModelDropdown(dropdownModels);
        }
        
        // Set current selection
        if (currentModel && models[currentModel]) {
            const modelInfo = models[currentModel];
            const prefix = modelInfo.type === 'fine_tuned' ? '🎯 ' : ' ';
            if (window.setModelDropdownOption) {
                window.setModelDropdownOption(currentModel, prefix + modelInfo.name);
            }
        }
    }
    
   
    
    showModelUpdateFeedback(message) {
        // Create temporary success message
        const infoDiv = document.getElementById('model-info');
        const tempFeedback = document.createElement('div');
        tempFeedback.className = 'mb-2 p-2 text-xs font-medium rounded';
        tempFeedback.style.cssText = 'background: #dcfce7; color: #166534; border: 1px solid #166534;';
        tempFeedback.textContent = '✓ ' + message;
        
        
        // Remove after 3 seconds
        setTimeout(() => {
            tempFeedback.remove();
        }, 3000);
    }
    
    getTranslationSettings() {
        // Get current model info to determine settings
        const modelButton = document.getElementById('translation-model-button');
        const currentModelId = modelButton?.dataset.value;
        const currentModel = this.currentModels[currentModelId];
        
        if (currentModel) {
            const isFineTuned = currentModel.type === 'fine_tuned';
            return {
                temperature: 0.2,  // Fixed at 0.2 for all models
                useExamples: !isFineTuned  // true for base models, false for fine-tuned
            };
        }
        
        // Fallback defaults
        return {
            temperature: 0.2,
            useExamples: true
        };
    }
    
    setupModalListeners() {
        document.getElementById('new-translation-btn').addEventListener('click', () => {
            document.getElementById('new-translation-modal').classList.remove('hidden');
        });
        
        document.getElementById('cancel-new-translation').addEventListener('click', () => {
            document.getElementById('new-translation-modal').classList.add('hidden');
            document.getElementById('new-translation-form').reset();
        });
        
        document.getElementById('new-translation-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.editor.createNewTranslation();
        });
    }
    

    
    addCloseButtonListeners() {
        // Close button handling now done in main translate.html file
        // to avoid conflicts with multiple event listeners
    }
    
    setupPrimaryDropZone() {
        const primaryContainer = document.getElementById('primary-text-container');
        
        primaryContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            const data = e.dataTransfer.getData('application/json');
            if (data) {
                try {
                    const windowData = JSON.parse(data);
                    if (windowData.type === 'text-window') {
                        e.dataTransfer.dropEffect = 'move';
                        primaryContainer.classList.add('bg-blue-50', 'border-4', 'border-dashed', 'border-blue-400', 'rounded-lg');
                    }
                } catch (error) {
                    // Not a text window drag
                }
            }
        });
        
        primaryContainer.addEventListener('dragleave', (e) => {
            if (!primaryContainer.contains(e.relatedTarget)) {
                primaryContainer.classList.remove('bg-blue-50', 'border-4', 'border-dashed', 'border-blue-400', 'rounded-lg');
            }
        });
        
        primaryContainer.addEventListener('drop', async (e) => {
            e.preventDefault();
            primaryContainer.classList.remove('bg-blue-50', 'border-4', 'border-dashed', 'border-blue-400', 'rounded-lg');
            
            try {
                const data = e.dataTransfer.getData('application/json');
                if (data) {
                    const windowData = JSON.parse(data);
                    if (windowData.type === 'text-window') {
                        await this.editor.moveTextToPrimary(windowData.textId);
                    }
                }
            } catch (error) {
                console.error('Error processing window drop:', error);
            }
        });
    }

    showTextSelectionModal(isPrimary) {
        const modal = document.getElementById('text-selection-modal');
        if (!modal) return;

        modal.dataset.isPrimary = isPrimary.toString();
        
        // Update modal text based on whether it's primary (target) or reference (source)
        const modalTitle = document.getElementById('text-selection-modal-title');
        const modalSubtitle = document.getElementById('text-selection-modal-subtitle');
        
        if (isPrimary) {
            if (modalTitle) modalTitle.textContent = 'Load Target Translation';
            if (modalSubtitle) modalSubtitle.textContent = 'Create or load the translation you want to work on';
        } else {
            if (modalTitle) modalTitle.textContent = 'Load Reference Text';
            if (modalSubtitle) modalSubtitle.textContent = 'Load a source text to translate from or compare against';
        }
        
        modal.classList.remove('hidden');
        
        // Reset all tabs and forms
        this.resetModalTabs();
        
        // Initialize tab functionality first
        if (typeof initializeTextSelectionTabs === 'function') {
            initializeTextSelectionTabs();
        }
        
        // Always default to "Load Existing" tab
        setTimeout(() => {
            if (typeof window.switchTab === 'function') {
                window.switchTab('load');
            }
        }, 100);
        
        // Populate the dropdown with available texts
        this.populateTextSelection();
        
        // Set up event handlers (only once)
        this.setupModalEventHandlers(isPrimary);
    }
    
    resetModalTabs() {
        // Reset dropdown
        const textElement = document.getElementById('text-select-text');
        const button = document.getElementById('text-select-button');
        const textInfo = document.getElementById('text-info');
        
        if (textElement) textElement.textContent = 'Choose a text...';
        if (button) {
            button.dataset.value = '';
            button.dataset.metadata = '';
        }
        if (textInfo) textInfo.classList.add('hidden');
        
        // Reset create form
        const nameInput = document.getElementById('new-translation-name');
        const languageInput = document.getElementById('target-language');
        if (nameInput) nameInput.value = '';
        if (languageInput) languageInput.value = '';
        
        // Reset file upload
        const fileInput = document.getElementById('usfm-file-input');
        const fileList = document.getElementById('file-list');
        if (fileInput) fileInput.value = '';
        if (fileList) fileList.classList.add('hidden');
        
        // Hide action buttons (except Load Text which is default)
        document.getElementById('create-translation-btn')?.classList.add('hidden');
    }
    
    setupModalEventHandlers(isPrimary) {
        // Don't replace the modal - just set up handlers if they don't exist
        if (this._modalHandlersSetup) return;
        this._modalHandlersSetup = true;
        
        const modal = document.getElementById('text-selection-modal');
        
        // Load existing text handler
        const addBtn = document.getElementById('add-text-btn');
        addBtn?.addEventListener('click', async () => {
            const button = document.getElementById('text-select-button');
            const selectedValue = button?.dataset.value;
            if (selectedValue) {
                await window.translationEditor.loadText(selectedValue, isPrimary);
                modal.classList.add('hidden');
            }
        });
        
        // Create new translation handler
        const createBtn = document.getElementById('create-translation-btn');
        createBtn?.addEventListener('click', async () => {
            if (!window.translationEditor?.canEdit) {
                alert('Editor access required to create new translations.');
                return;
            }
            
            const nameInput = document.getElementById('new-translation-name');
            const languageInput = document.getElementById('target-language');
            const name = nameInput?.value.trim();
            const language = languageInput?.value.trim();
            
            if (!name) {
                alert('Please enter a translation name.');
                nameInput?.focus();
                return;
            }
            
            try {
                const result = await window.translationEditor.createNewTranslation(name, language);
                if (result && result.success) {
                    await window.translationEditor.loadText(result.textId, isPrimary);
                    modal.classList.add('hidden');
                } else {
                    alert(result?.error || 'Failed to create translation.');
                }
            } catch (error) {
                console.error('Error creating translation:', error);
                alert('Failed to create translation. Please try again.');
            }
        });
        

        
        // Cancel handler
        const cancelBtn = document.getElementById('cancel-text-selection');
        cancelBtn?.addEventListener('click', () => {
            modal.classList.add('hidden');
        });
        
        // Click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
            }
        });
    }

    populateTextSelection() {
        // Get text metadata from the editor
        const textMetadata = window.translationEditor?.textMetadata;
        if (!textMetadata) {
            // Use the new dropdown population function with empty array
            if (window.populateTextDropdown) {
                window.populateTextDropdown([]);
            }
            return;
        }
        
        // Get all texts without type distinction
        const allTexts = [];
        
        textMetadata.forEach((metadata, textId) => {
            allTexts.push([textId, metadata]);
        });
        
        // Sort all texts by name
        allTexts.sort((a, b) => a[1].name.localeCompare(b[1].name));
        
        // Convert to dropdown format
        const dropdownTexts = allTexts.map(([textId, metadata]) => ({
            value: textId,
            name: metadata.name,
            progress: metadata.progress
        }));
        
        // Use the new dropdown population function
        if (window.populateTextDropdown) {
            window.populateTextDropdown(dropdownTexts);
        }
    }
}

// Simple Window Resizer for Translation Panes
class WindowResizer {
    constructor() {
        this.isDragging = false;
        this.startX = 0;
        this.startLeftWidth = 50; // percentage
        this.minWidth = 20; // minimum 20%
        this.maxWidth = 80; // maximum 80%
        
        this.leftPane = null;
        this.rightPane = null;
        this.handle = null;
        this.container = null;
        
        this.init();
    }
    
    init() {
        // Only initialize on desktop
        if (window.innerWidth <= 767) return;
        
        // IMPORTANT: The container must be text-workspace, NOT main-content-wrapper
        this.container = document.getElementById('text-workspace');
        this.leftPane = document.getElementById('secondary-texts-area');
        this.rightPane = document.getElementById('primary-text-area');
        
        if (!this.container || !this.leftPane || !this.rightPane) {
            console.log('WindowResizer: Required elements not found', {
                container: !!this.container,
                leftPane: !!this.leftPane,
                rightPane: !!this.rightPane
            });
            return;
        }
        
        // Verify we have the right container
        if (!this.container.contains(this.leftPane) || !this.container.contains(this.rightPane)) {
            console.error('WindowResizer: Panes are not children of the container!');
            return;
        }
        
        // On desktop, both panes should be visible. If secondary is hidden, show it
        if (window.innerWidth > 767) {
            // Remove hidden class from secondary area on desktop
            this.leftPane.classList.remove('hidden');
            this.rightPane.classList.remove('hidden');
            
            // Also hide the mobile tabs on desktop
            const mobileTabs = this.container.querySelector('.md\\:hidden');
            if (mobileTabs) {
                mobileTabs.style.display = 'none';
            }
        }
        
        console.log('WindowResizer: Ensured desktop visibility', {
            leftClasses: this.leftPane.className,
            rightClasses: this.rightPane.className,
            flexDirection: getComputedStyle(this.container).flexDirection
        });
        
        this.createResizeHandle();
        this.setupEventListeners();
        this.restoreLayout();
        
        console.log('WindowResizer: Initialized successfully');
    }
    
    createResizeHandle() {
        // Check if handle already exists in HTML
        const existingHandle = this.container.querySelector('.resize-handle');
        if (existingHandle) {
            this.handle = existingHandle;
            console.log('WindowResizer: Using existing resize handle', {
                handle: this.handle,
                display: getComputedStyle(this.handle).display,
                width: getComputedStyle(this.handle).width,
                height: getComputedStyle(this.handle).height,
                classList: this.handle.classList.toString()
            });
            return;
        }
        
        // Only create if not found
        this.handle = document.createElement('div');
        this.handle.className = 'resize-handle';
        this.handle.setAttribute('data-resize-handle', 'true');
        
        // Simply insert before the primary (right) pane
        // The flex order CSS will handle the visual positioning
        this.container.insertBefore(this.handle, this.rightPane);
        
        console.log('WindowResizer: Handle created and inserted', {
            container: this.container.id,
            containerChildren: Array.from(this.container.children).map(c => c.id || c.className),
            handleIndex: Array.from(this.container.children).indexOf(this.handle),
            leftPaneIndex: Array.from(this.container.children).indexOf(this.leftPane),
            rightPaneIndex: Array.from(this.container.children).indexOf(this.rightPane)
        });
    }
    
    setupEventListeners() {
        if (!this.handle) {
            console.error('WindowResizer: No handle element found, cannot setup event listeners');
            return;
        }
        
        // Mouse events
        this.handle.addEventListener('mousedown', this.onMouseDown.bind(this));
        document.addEventListener('mousemove', this.onMouseMove.bind(this));
        document.addEventListener('mouseup', this.onMouseUp.bind(this));
        
        // Touch events for tablets
        this.handle.addEventListener('touchstart', this.onTouchStart.bind(this));
        document.addEventListener('touchmove', this.onTouchMove.bind(this));
        document.addEventListener('touchend', this.onTouchEnd.bind(this));
        
        // Window resize
        window.addEventListener('resize', this.onWindowResize.bind(this));
        
        console.log('WindowResizer: Event listeners attached');
    }
    
    onMouseDown(e) {
        e.preventDefault();
        this.startResize(e.clientX);
    }
    
    onTouchStart(e) {
        e.preventDefault();
        this.startResize(e.touches[0].clientX);
    }
    
    startResize(clientX) {
        this.isDragging = true;
        this.startX = clientX;
        this.startLeftWidth = this.getCurrentLeftWidth();
        
        this.handle.classList.add('dragging');
        document.body.classList.add('resizing');
    }
    
    onMouseMove(e) {
        if (!this.isDragging) return;
        this.updateLayout(e.clientX);
    }
    
    onTouchMove(e) {
        if (!this.isDragging) return;
        e.preventDefault();
        this.updateLayout(e.touches[0].clientX);
    }
    
    updateLayout(clientX) {
        const containerRect = this.container.getBoundingClientRect();
        const deltaX = clientX - this.startX;
        const deltaPercent = (deltaX / containerRect.width) * 100;
        
        let newLeftWidth = this.startLeftWidth + deltaPercent;
        
        // Apply constraints
        newLeftWidth = Math.max(this.minWidth, Math.min(this.maxWidth, newLeftWidth));
        
        const newRightWidth = 100 - newLeftWidth;
        
        this.applyWidths(newLeftWidth, newRightWidth);
    }
    
    onMouseUp() {
        this.endResize();
    }
    
    onTouchEnd() {
        this.endResize();
    }
    
    endResize() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        this.handle.classList.remove('dragging');
        document.body.classList.remove('resizing');
        
        // Save the current layout
        this.saveLayout();
    }
    
    getCurrentLeftWidth() {
        if (!this.leftPane) return 50;
        const containerWidth = this.container.offsetWidth;
        const leftWidth = this.leftPane.offsetWidth;
        
        // If we have a custom flex-basis, use that
        const flexBasis = this.leftPane.style.flexBasis;
        if (flexBasis && flexBasis.endsWith('%')) {
            return parseFloat(flexBasis);
        }
        
        // Otherwise calculate from actual width
        return (leftWidth / containerWidth) * 100;
    }
    
    applyWidths(leftPercent, rightPercent) {
        // Remove Tailwind flex classes when applying custom widths
        this.leftPane.classList.remove('md:flex-1');
        this.rightPane.classList.remove('md:flex-1');
        
        // Apply dynamic widths using flex-basis for better flexbox compatibility
        this.leftPane.style.flexBasis = `${leftPercent}%`;
        this.leftPane.style.flexGrow = '0';
        this.leftPane.style.flexShrink = '0';
        this.leftPane.style.maxWidth = `${leftPercent}%`; // Ensure it doesn't exceed this width
        
        this.rightPane.style.flexBasis = `${rightPercent}%`;
        this.rightPane.style.flexGrow = '0';
        this.rightPane.style.flexShrink = '0';
        this.rightPane.style.maxWidth = `${rightPercent}%`; // Ensure it doesn't exceed this width
        
        console.log(`WindowResizer: Applied widths - Left: ${leftPercent}%, Right: ${rightPercent}%`);
    }
    
    saveLayout() {
        const leftWidth = this.getCurrentLeftWidth();
        const storage = window.translationEditor?.storage;
        if (storage) {
            storage.setLayoutWidths(leftWidth, 100 - leftWidth);
        }
    }
    
    restoreLayout() {
        const storage = window.translationEditor?.storage;
        if (storage) {
            const [leftWidth, rightWidth] = storage.getLayoutWidths();
            // Only apply custom widths if they're different from default
            if (leftWidth !== 50 || rightWidth !== 50) {
                this.applyWidths(leftWidth, rightWidth);
            }
        }
    }
    
    onWindowResize() {
        // Hide on mobile, show on desktop
        if (window.innerWidth <= 767) {
            if (this.handle) {
                this.handle.style.display = 'none';
            }
            // Reset to default Tailwind classes on mobile and restore tab behavior
            if (this.leftPane) {
                this.leftPane.classList.add('md:flex-1', 'w-full');
                this.leftPane.style.width = '';
                this.leftPane.style.flexBasis = '';
                this.leftPane.style.flexGrow = '';
                this.leftPane.style.flexShrink = '';
                this.leftPane.style.maxWidth = '';
                // Let the tab system control visibility on mobile
            }
            if (this.rightPane) {
                this.rightPane.classList.add('md:flex-1', 'w-full');
                this.rightPane.style.width = '';
                this.rightPane.style.flexBasis = '';
                this.rightPane.style.flexGrow = '';
                this.rightPane.style.flexShrink = '';
                this.rightPane.style.maxWidth = '';
            }
        } else {
            if (this.handle) {
                this.handle.style.display = '';
            }
            // On desktop, both panes should be visible
            this.leftPane.classList.remove('hidden');
            this.rightPane.classList.remove('hidden');
            // Restore custom widths on desktop
            this.restoreLayout();
        }
    }
    
    destroy() {
        if (this.handle && this.handle.parentNode) {
            this.handle.parentNode.removeChild(this.handle);
        }
    }
}

// Make available globally
window.TranslationUI = TranslationUI; 