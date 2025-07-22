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
        const button = document.getElementById('text-select-button');
        const addBtn = document.getElementById('add-text-btn');
        const newTranslationBtn = document.getElementById('new-translation-btn');
        const cancelBtn = document.getElementById('cancel-text-selection');
        const textInfo = document.getElementById('text-info');

        if (!modal || !button || !addBtn || !cancelBtn || !newTranslationBtn) return;

        modal.dataset.isPrimary = isPrimary.toString();
        
        // Update modal text based on whether it's primary (target) or reference (source)
        const modalTitle = document.getElementById('text-selection-modal-title');
        const modalSubtitle = document.getElementById('text-selection-modal-subtitle');
        const modalLabel = document.getElementById('text-selection-modal-label');
        
        if (isPrimary) {
            if (modalTitle) modalTitle.textContent = 'Load Target Translation';
            if (modalSubtitle) modalSubtitle.textContent = 'Select or create the translation you want to work on';
            if (modalLabel) modalLabel.textContent = 'Select Target Translation';
        } else {
            if (modalTitle) modalTitle.textContent = 'Load Reference Text';
            if (modalSubtitle) modalSubtitle.textContent = 'Select a source text to translate from or compare against';
            if (modalLabel) modalLabel.textContent = 'Select Reference/Source Text';
        }
        
        modal.classList.remove('hidden');
        
        // Reset dropdown and hide buttons
        const textElement = document.getElementById('text-select-text');
        if (textElement) {
            textElement.textContent = 'Choose a text...';
        }
        button.dataset.value = '';
        button.dataset.metadata = '';
        addBtn.classList.add('hidden');
        if (textInfo) {
            textInfo.classList.add('hidden');
        }

        const newAddBtn = addBtn.cloneNode(true);
        const newNewTranslationBtn = newTranslationBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        
        addBtn.parentNode.replaceChild(newAddBtn, addBtn);
        newTranslationBtn.parentNode.replaceChild(newNewTranslationBtn, newTranslationBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        
        // Show New Translation button by default (no text selected initially)  
        newNewTranslationBtn.classList.remove('hidden');
        
        // Populate the dropdown with available texts
        this.populateTextSelection(button);
        
        button.focus();

        // Show/hide buttons based on selection
        button.addEventListener('change', (e) => {
            const selectedValue = e.detail?.value || button.dataset.value;
            if (selectedValue) {
                newAddBtn.classList.remove('hidden');
                newNewTranslationBtn.classList.add('hidden');
            } else {
                newAddBtn.classList.add('hidden');
                newNewTranslationBtn.classList.remove('hidden');
                
                // Update button text based on user permissions
                if (window.translationEditor && !window.translationEditor.canEdit) {
                    newNewTranslationBtn.textContent = 'View Only Mode';
                    newNewTranslationBtn.disabled = true;
                    newNewTranslationBtn.style.opacity = '0.5';
                    newNewTranslationBtn.title = 'Editor access required to create translations';
                } else {
                    newNewTranslationBtn.textContent = '+ New Translation';
                    newNewTranslationBtn.disabled = false;
                    newNewTranslationBtn.style.opacity = '1';
                    newNewTranslationBtn.title = '';
                }
            }
        });

        newAddBtn.addEventListener('click', async () => {
            const selectedValue = button.dataset.value;
            if (selectedValue) {
                await window.translationEditor.loadText(selectedValue, isPrimary);
                modal.classList.add('hidden');
                document.getElementById('text-info').classList.add('hidden');
            }
        });

        newNewTranslationBtn.addEventListener('click', () => {
            // Check if user can edit before allowing new translation creation
            if (window.translationEditor && !window.translationEditor.canEdit) {
                alert('Editor access required to create new translations. You can only view existing translations.');
                return;
            }
            
            const newTranslationModal = document.getElementById('new-translation-modal');
            newTranslationModal.dataset.isPrimary = isPrimary.toString();
            
            modal.classList.add('hidden');
            newTranslationModal.classList.remove('hidden');
            
            const nameInput = document.getElementById('translation-name');
            if (nameInput) {
                setTimeout(() => nameInput.focus(), 10);
            }
        });

        // Add USFM import button handler
        const usfmImportBtn = document.getElementById('usfm-import-btn');
        const newUsfmImportBtn = usfmImportBtn ? usfmImportBtn.cloneNode(true) : null;
        if (usfmImportBtn && newUsfmImportBtn) {
            usfmImportBtn.parentNode.replaceChild(newUsfmImportBtn, usfmImportBtn);
            
            newUsfmImportBtn.addEventListener('click', () => {
                // Check if user can edit before allowing USFM import
                if (window.translationEditor && !window.translationEditor.canEdit) {
                    alert('Editor access required to import USFM files. You can only view existing translations.');
                    return;
                }
                
                const projectId = window.translationEditor?.projectId;
                if (projectId) {
                    window.location.href = `/project/${projectId}/usfm-import`;
                }
            });
        }

        newCancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            if (button) {
                button.dataset.value = '';
                const textElement = document.getElementById('text-select-text');
                if (textElement) {
                    textElement.textContent = 'Choose a text...';
                }
            }
            newAddBtn.classList.add('hidden');
            newNewTranslationBtn.classList.remove('hidden');
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                if (button) {
                    button.dataset.value = '';
                    const textElement = document.getElementById('text-select-text');
                    if (textElement) {
                        textElement.textContent = 'Choose a text...';
                    }
                }
                newAddBtn.classList.add('hidden');
                newNewTranslationBtn.classList.remove('hidden');
            }
        });
    }

    populateTextSelection(buttonOrSelect) {
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