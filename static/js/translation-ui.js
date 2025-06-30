// Translation UI Controls
class TranslationUI {
    constructor(translationEditor) {
        this.editor = translationEditor;
        this.currentModels = {};
        this.setupAutoResize();
    }
    
    setupAutoResize() {
        // Auto-resize textareas as content changes
        document.addEventListener('input', (e) => {
            if (e.target.tagName === 'TEXTAREA') {
                this.autoResizeTextarea(e.target);
            }
        });
    }
    
    autoResizeTextarea(textarea) {
        textarea.style.height = 'auto';
        const newHeight = Math.max(80, textarea.scrollHeight);
        textarea.style.height = newHeight + 'px';
    }
    
    initializeEventListeners() {
        // Model selection
        document.getElementById('translation-model-select').addEventListener('change', (e) => {
            this.handleModelChange(e.target.value);
        });
        
        document.getElementById('refresh-models-btn').addEventListener('click', () => {
            this.loadTranslationModels();
        });
        
        // Read mode and sidebar controls
        document.getElementById('read-mode-toggle').addEventListener('change', (e) => {
            this.editor.isReadMode = e.target.checked;
            this.toggleReadMode();
        });
        
        document.getElementById('sidebar-toggle').addEventListener('click', () => {
            this.toggleSidebar();
        });
        
        // Modal controls
        this.setupModalListeners();
        
        // Text loading
        document.getElementById('add-text-btn').addEventListener('click', async () => {
            const select = document.getElementById('text-select');
            if (select.value) {
                await this.editor.loadText(select.value, false);
                select.value = '';
                document.getElementById('text-info').classList.add('hidden');
            }
        });
        
        // Save and navigation
        document.getElementById('save-changes-btn').addEventListener('click', async () => {
            await this.editor.saveSystem.saveAllChanges();
        });
        
        // Testament toggles
        document.getElementById('ot-toggle').addEventListener('click', () => {
            this.editor.navigation.toggleTestamentSection('ot');
        });
        
        document.getElementById('nt-toggle').addEventListener('click', () => {
            this.editor.navigation.toggleTestamentSection('nt');
        });
        
        // Translation settings controls
        this.setupTranslationSettings();
        
        // Load models on initialization
        this.loadTranslationModels();
    }
    
    async loadTranslationModels() {
        const select = document.getElementById('translation-model-select');
        const refreshBtn = document.getElementById('refresh-models-btn');
        
        try {
            // Show loading state
            select.innerHTML = '<option value="">Loading models...</option>';
            refreshBtn.disabled = true;
            refreshBtn.querySelector('i').classList.add('fa-spin');
            
            const response = await fetch(`/project/${this.editor.projectId}/translation-models`);
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to load models');
            }
            
            this.currentModels = data.models;
            this.populateModelSelect(data.models, data.current_model);
            
        } catch (error) {
            console.error('Error loading translation models:', error);
            select.innerHTML = '<option value="">Error loading models</option>';
        } finally {
            refreshBtn.disabled = false;
            refreshBtn.querySelector('i').classList.remove('fa-spin');
        }
    }
    
    populateModelSelect(models, currentModel) {
        const select = document.getElementById('translation-model-select');
        
        // Clear existing options
        select.innerHTML = '';
        
        // Group models by type
        const baseModels = [];
        const fineTunedModels = [];
        
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
        
        // Add fine-tuned models first (if any)
        if (fineTunedModels.length > 0) {
            const fineTunedGroup = document.createElement('optgroup');
            fineTunedGroup.label = '🎯 Fine-tuned Models';
            fineTunedModels.forEach(([modelId, modelInfo]) => {
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = modelInfo.name;
                fineTunedGroup.appendChild(option);
            });
            select.appendChild(fineTunedGroup);
        }
        
        // Add base models
        if (baseModels.length > 0) {
            const baseGroup = document.createElement('optgroup');
            baseGroup.label = '🚀 Base Models';
            baseModels.forEach(([modelId, modelInfo]) => {
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = modelInfo.name;
                baseGroup.appendChild(option);
            });
            select.appendChild(baseGroup);
        }
        
        // Set current selection
        if (currentModel && models[currentModel]) {
            select.value = currentModel;
            this.showModelInfo(currentModel);
        }
    }
    
    async handleModelChange(modelId) {
        if (!modelId) {
            this.hideModelInfo();
            return;
        }
        
        try {
            // Update backend
            const response = await fetch(`/project/${this.editor.projectId}/translation-model`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model_id: modelId
                })
            });
            
            const data = await response.json();
            
            if (!data.success) {
                throw new Error(data.error || 'Failed to update model');
            }
            
            // Show success feedback
            this.showModelUpdateFeedback(data.message);
            this.showModelInfo(modelId);
            
        } catch (error) {
            console.error('Error updating translation model:', error);
            // Show error and revert selection
            alert('Failed to update model: ' + error.message);
        }
    }
    
    showModelInfo(modelId) {
        const modelInfo = this.currentModels[modelId];
        if (!modelInfo) return;
        
        const infoDiv = document.getElementById('model-info');
        const descriptionDiv = document.getElementById('model-description');
        const typeDiv = document.getElementById('model-type');
        
        descriptionDiv.textContent = modelInfo.description;
        
        let typeText = modelInfo.type === 'fine_tuned' ? 'Fine-tuned Model' : 'Base Model';
        if (modelInfo.type === 'fine_tuned' && modelInfo.training_examples) {
            typeText += ` • ${modelInfo.training_examples.toLocaleString()} training examples`;
        }
        typeDiv.textContent = typeText;
        
        infoDiv.classList.remove('hidden');
    }
    
    hideModelInfo() {
        document.getElementById('model-info').classList.add('hidden');
    }
    
    showModelUpdateFeedback(message) {
        // Create temporary success message
        const infoDiv = document.getElementById('model-info');
        const tempFeedback = document.createElement('div');
        tempFeedback.className = 'mb-2 p-2 text-xs font-medium rounded';
        tempFeedback.style.cssText = 'background: #dcfce7; color: #166534; border: 1px solid #166534;';
        tempFeedback.textContent = '✓ ' + message;
        
        infoDiv.parentNode.insertBefore(tempFeedback, infoDiv);
        
        // Remove after 3 seconds
        setTimeout(() => {
            tempFeedback.remove();
        }, 3000);
    }
    
    setupTranslationSettings() {
        // Initialize settings from storage
        this.translationSettings = {
            temperature: parseFloat(localStorage.getItem('translation_temperature') || '0.7'),
            useExamples: localStorage.getItem('translation_use_examples') !== 'false'
        };
        
        // Set up temperature slider
        const temperatureSlider = document.getElementById('temperature-slider');
        const temperatureValue = document.getElementById('temperature-value');
        
        if (temperatureSlider && temperatureValue) {
            temperatureSlider.value = this.translationSettings.temperature;
            temperatureValue.textContent = this.translationSettings.temperature;
            
            temperatureSlider.addEventListener('input', (e) => {
                const value = parseFloat(e.target.value);
                this.translationSettings.temperature = value;
                temperatureValue.textContent = value;
                this.saveTranslationSettings();
                this.showSettingsUpdateFeedback('Temperature updated');
            });
        }
        
        // Set up use examples toggle
        const useExamplesToggle = document.getElementById('use-examples-toggle');
        
        if (useExamplesToggle) {
            useExamplesToggle.checked = this.translationSettings.useExamples;
            
            useExamplesToggle.addEventListener('change', (e) => {
                this.translationSettings.useExamples = e.target.checked;
                this.saveTranslationSettings();
                console.log(`In-context learning ${e.target.checked ? 'ENABLED' : 'DISABLED'} - will ${e.target.checked ? 'use' : 'NOT use'} examples for translation`);
                this.showSettingsUpdateFeedback(
                    e.target.checked ? 'In-context learning enabled' : 'In-context learning disabled'
                );
            });
        }
    }
    
    saveTranslationSettings() {
        localStorage.setItem('translation_temperature', this.translationSettings.temperature.toString());
        localStorage.setItem('translation_use_examples', this.translationSettings.useExamples.toString());
    }
    
    showSettingsUpdateFeedback(message) {
        const statusDiv = document.getElementById('settings-status');
        const messageSpan = document.getElementById('settings-message');
        
        if (statusDiv && messageSpan) {
            messageSpan.textContent = message;
            statusDiv.classList.remove('hidden');
            
            // Hide after 2 seconds
            setTimeout(() => {
                statusDiv.classList.add('hidden');
            }, 2000);
        }
    }
    
    getTranslationSettings() {
        return this.translationSettings;
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
    
    toggleReadMode() {
        const textWindows = document.querySelectorAll('[data-text-id]');
        
        textWindows.forEach(window => {
            const content = window.querySelector('[data-window-content]');
            if (!content) return;
            
            if (this.editor.isReadMode) {
                this.convertWindowToReadMode(window, content);
            } else {
                this.convertWindowToEditMode(window, content);
            }
        });
        
        // Update UI visual state
        if (this.editor.isReadMode) {
            document.body.classList.add('read-mode');
        } else {
            document.body.classList.remove('read-mode');
        }
    }
    
    convertWindowToReadMode(window, content) {
        if (content.readModeContainer) return; // Already converted
        
        // Collect all verse data
        const verses = [];
        const textareas = content.querySelectorAll('textarea');
        
        textareas.forEach(textarea => {
            const verseNumber = textarea.dataset.verse;
            const text = textarea.value || '';
            const verseIndex = textarea.dataset.verseIndex;
            
            verses.push({
                number: verseNumber,
                text: text,
                index: verseIndex,
                textarea: textarea
            });
        });
        
        // Create continuous text container
        const readModeContainer = document.createElement('div');
        readModeContainer.className = 'read-mode-text p-4 leading-relaxed text-base';
        readModeContainer.style.lineHeight = '1.8';
        
        // Build flowing text with verse markers
        verses.forEach((verse, index) => {
            // Add verse number as a clickable marker
            const verseMarker = document.createElement('span');
            verseMarker.className = 'verse-marker font-bold text-blue-600 cursor-pointer hover:bg-blue-50 px-1 rounded';
            verseMarker.textContent = verse.number;
            verseMarker.dataset.verse = verse.number;
            verseMarker.dataset.verseIndex = verse.index;
            verseMarker.title = `Verse ${verse.number} - Click to edit`;
            
            // Add click to edit functionality
            verseMarker.addEventListener('click', () => {
                this.editor.isReadMode = false;
                document.getElementById('read-mode-toggle').checked = false;
                this.toggleReadMode();
                // Focus the corresponding textarea after a brief delay
                setTimeout(() => {
                    verse.textarea.focus();
                    verse.textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 100);
            });
            
            // Add the verse text as editable span
            const verseText = document.createElement('span');
            verseText.className = 'verse-text editable-verse drop-target';
            verseText.textContent = verse.text || `[verse ${verse.number} not translated]`;
            verseText.dataset.verse = verse.number;
            verseText.dataset.verseIndex = verse.index;
            verseText.style.cursor = 'text';
            
            if (!verse.text) {
                verseText.style.fontStyle = 'italic';
                verseText.style.color = '#9ca3af';
            }
            
            // Add drag and drop listeners
            this.addReadModeDropListeners(verseText, verse.textarea);
            
            readModeContainer.appendChild(verseMarker);
            readModeContainer.appendChild(document.createTextNode(' '));
            readModeContainer.appendChild(verseText);
            
            // Add space between verses (except for the last one)
            if (index < verses.length - 1) {
                readModeContainer.appendChild(document.createTextNode(' '));
            }
        });
        
        // Hide original content and show read mode
        content.style.display = 'none';
        content.readModeContainer = readModeContainer;
        content.parentElement.appendChild(readModeContainer);
    }
    
    convertWindowToEditMode(window, content) {
        if (!content.readModeContainer) return; // Not in read mode
        
        content.style.display = 'block';
        content.readModeContainer.remove();
        delete content.readModeContainer;
    }
    
    addReadModeDropListeners(verseSpan, originalTextarea) {
        verseSpan.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            verseSpan.classList.add('drag-over');
        });
        
        verseSpan.addEventListener('dragleave', (e) => {
            if (!verseSpan.contains(e.relatedTarget)) {
                verseSpan.classList.remove('drag-over');
            }
        });
        
        verseSpan.addEventListener('drop', async (e) => {
            e.preventDefault();
            verseSpan.classList.remove('drag-over');
            
            try {
                const dragData = JSON.parse(e.dataTransfer.getData('text/plain'));
                await this.editor.dragDrop.translateFromDragReadMode(dragData, verseSpan, originalTextarea);
            } catch (error) {
                console.error('Error processing drop in read mode:', error);
                alert('Failed to process dropped text');
            }
        });
    }
    
    toggleSidebar() {
        const sidebar = document.getElementById('translation-sidebar');
        const toggleBtn = document.getElementById('sidebar-toggle');
        const toggleIcon = toggleBtn.querySelector('i');
        const body = document.body;
        
        if (sidebar.classList.contains('collapsed')) {
            // Expand sidebar
            sidebar.classList.remove('collapsed');
            toggleBtn.classList.remove('collapsed');
            body.classList.remove('sidebar-collapsed');
            toggleIcon.className = 'fas fa-chevron-left text-sm';
            toggleBtn.title = 'Collapse sidebar';
        } else {
            // Collapse sidebar
            sidebar.classList.add('collapsed');
            toggleBtn.classList.add('collapsed');
            body.classList.add('sidebar-collapsed');
            toggleIcon.className = 'fas fa-chevron-right text-sm';
            toggleBtn.title = 'Expand sidebar';
        }
    }
    
    // Add event listener for close buttons
    addCloseButtonListeners() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('.close-text-btn')) {
                const textId = e.target.closest('.close-text-btn').dataset.textId;
                this.editor.removeTextWindow(textId);
            }
        });
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
}

// Make available globally
window.TranslationUI = TranslationUI; 