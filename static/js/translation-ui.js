// Translation UI Controls
class TranslationUI {
    constructor() {
        this.currentModels = {};
        this.setupModelSelection();
        // Don't load models immediately - wait for translation editor to be ready
    }
    
    setupModelSelection() {
        const modelSelect = document.getElementById('translation-model-select');
        const refreshBtn = document.getElementById('refresh-models-btn');
        
        if (modelSelect) {
            modelSelect.addEventListener('change', (e) => {
                const modelId = e.target.value;
                if (modelId && this.currentModels[modelId]) {
                    this.setTranslationModel(modelId);
                    this.showModelInfo(modelId);
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
        const select = document.getElementById('translation-model-select');
        
        // Clear existing options
        select.innerHTML = '';
        
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
        
        // Add fine-tuned models first (if any)
        if (fineTunedModels.length > 0) {
            const fineTunedGroup = document.createElement('optgroup');
            fineTunedGroup.label = '🎯 Custom Fine-tuned Models';
            fineTunedModels.forEach(([modelId, modelInfo]) => {
                const option = document.createElement('option');
                option.value = modelId;
                option.textContent = modelInfo.name;
                fineTunedGroup.appendChild(option);
            });
            select.appendChild(fineTunedGroup);
        }
        
        // Add base models (Claude 3.5 Sonnet)
        if (baseModels.length > 0) {
            const baseGroup = document.createElement('optgroup');
            baseGroup.label = '🧠 Base Models';
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
        
        // Add automatic settings info
        const isFineTuned = modelInfo.type === 'fine_tuned';
        typeText += ` • Temperature: 0.2 • In-context: ${isFineTuned ? 'OFF' : 'ON'}`;
        
        typeDiv.textContent = typeText;
        
        infoDiv.classList.remove('hidden');
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
    
    getTranslationSettings() {
        // Get current model info to determine settings
        const modelSelect = document.getElementById('translation-model-select');
        const currentModelId = modelSelect?.value;
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

    showTextSelectionModal(isPrimary) {
        const modal = document.getElementById('text-selection-modal');
        const select = document.getElementById('text-select');
        const addBtn = document.getElementById('add-text-btn');
        const newTranslationBtn = document.getElementById('new-translation-btn');
        const cancelBtn = document.getElementById('cancel-text-selection');

        if (!modal || !select || !addBtn || !cancelBtn || !newTranslationBtn) return;

        modal.dataset.isPrimary = isPrimary.toString();
        modal.classList.remove('hidden');
        select.value = '';
        addBtn.classList.add('hidden'); // Hide load text button initially

        const newAddBtn = addBtn.cloneNode(true);
        const newNewTranslationBtn = newTranslationBtn.cloneNode(true);
        const newCancelBtn = cancelBtn.cloneNode(true);
        const newSelect = select.cloneNode(true);
        
        addBtn.parentNode.replaceChild(newAddBtn, addBtn);
        newTranslationBtn.parentNode.replaceChild(newNewTranslationBtn, newTranslationBtn);
        cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
        select.parentNode.replaceChild(newSelect, select);
        
        // Populate the dropdown with available texts
        this.populateTextSelection(newSelect);
        
        newSelect.focus();

        // Show/hide buttons based on selection
        newSelect.addEventListener('change', () => {
            if (newSelect.value) {
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
            if (newSelect.value) {
                await window.translationEditor.loadText(newSelect.value, isPrimary);
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
                setTimeout(() => nameInput.focus(), 100);
            }
        });

        newCancelBtn.addEventListener('click', () => {
            modal.classList.add('hidden');
            newSelect.value = '';
            newAddBtn.classList.add('hidden');
            newNewTranslationBtn.classList.remove('hidden');
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                newSelect.value = '';
                newAddBtn.classList.add('hidden');
                newNewTranslationBtn.classList.remove('hidden');
            }
        });
    }

    populateTextSelection(select) {
        // Clear existing options except the first one
        select.innerHTML = '<option value="">Choose a text...</option>';
        
        // Get text metadata from the editor
        const textMetadata = window.translationEditor?.textMetadata;
        if (!textMetadata) return;
        
        // Group texts by type
        const sourceTexts = [];
        const translations = [];
        
        textMetadata.forEach((metadata, textId) => {
            if (metadata.type === 'Translation') {
                translations.push([textId, metadata]);
            } else {
                sourceTexts.push([textId, metadata]);
            }
        });
        
        // Sort translations by name
        translations.sort((a, b) => a[1].name.localeCompare(b[1].name));
        
        // Sort source texts by name
        sourceTexts.sort((a, b) => a[1].name.localeCompare(b[1].name));
        
        // Add translations first (if any)
        if (translations.length > 0) {
            const translationGroup = document.createElement('optgroup');
            translationGroup.label = '📝 Translations';
            translations.forEach(([textId, metadata]) => {
                const option = document.createElement('option');
                option.value = textId;
                option.textContent = metadata.name;
                if (metadata.progress !== undefined) {
                    option.textContent += ` (${metadata.progress}% complete)`;
                }
                translationGroup.appendChild(option);
            });
            select.appendChild(translationGroup);
        }
        
        // Add source texts
        if (sourceTexts.length > 0) {
            const sourceGroup = document.createElement('optgroup');
            sourceGroup.label = '📖 Source Texts';
            sourceTexts.forEach(([textId, metadata]) => {
                const option = document.createElement('option');
                option.value = textId;
                option.textContent = metadata.name;
                sourceGroup.appendChild(option);
            });
            select.appendChild(sourceGroup);
        }
    }
}

// Make available globally
window.TranslationUI = TranslationUI; 