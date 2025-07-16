document.addEventListener('DOMContentLoaded', function() {
    console.log('Project.js loaded');
    
    // Tab functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            
            // Update button states
            tabButtons.forEach(btn => {
                btn.classList.remove('active', 'border-blue-600', 'text-blue-600');
                btn.classList.add('border-transparent', 'text-neutral-500');
            });
            
            this.classList.add('active', 'border-blue-600', 'text-blue-600');
            this.classList.remove('border-transparent', 'text-neutral-500');
            
            // Update content visibility
            tabContents.forEach(content => {
                content.classList.add('hidden');
            });
            
            const targetContent = document.getElementById(targetTab + '-tab');
            if (targetContent) {
                targetContent.classList.remove('hidden');
            }
            
            // Initialize flags tab if it's being opened for the first time
            if (targetTab === 'flags' && !window.flagsInitialized) {
                window.flagsInitialized = true;
                window.projectFlagsManager = new ProjectFlagsManager();
            }
        });
    });
    
    // File management modal elements
    const deleteFileModal = document.getElementById('delete-file-modal');
    const closeDeleteModalBtn = document.getElementById('close-delete-modal-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const downloadOriginalBtn = document.getElementById('download-original-btn');
    
    // Translation management modal elements
    const deleteTranslationModal = document.getElementById('delete-translation-modal');
    const closeDeleteTranslationModalBtn = document.getElementById('close-delete-translation-modal-btn');
    const cancelDeleteTranslationBtn = document.getElementById('cancel-delete-translation-btn');
    const confirmDeleteTranslationBtn = document.getElementById('confirm-delete-translation-btn');

    // Note: Import modal replaced with drag and drop interface
    
    // File pairing modal elements
    const filePairingModal = document.getElementById('file-pairing-modal');
    const closePairingModalBtn = document.getElementById('close-pairing-modal-btn');
    const cancelPairingBtn = document.getElementById('cancel-pairing-btn');
    const confirmPairingBtn = document.getElementById('confirm-pairing-btn');
    const firstFileName = document.getElementById('first-file-name');
    const secondFileSelect = document.getElementById('second-file-select');
    const pairInstructions = document.getElementById('pair-instructions');
    const pairCharCount = document.getElementById('pair-char-count');
    

    
    // Note: Complex import sections replaced with simple drag and drop
    
    let currentFileToDelete = null;
    let currentTranslationToDelete = null;
    let originalDownloaded = false;
    let currentFileForPairing = null;
    
    const projectId = window.location.pathname.split('/')[2];
    console.log('Project ID:', projectId);
    
    // File management event listeners
    document.addEventListener('click', function(e) {
        if (e.target.closest('.delete-file-btn')) {
            const btn = e.target.closest('.delete-file-btn');
            const fileId = btn.getAttribute('data-file-id');
            const filename = btn.getAttribute('data-filename');
            openDeleteFileModal(fileId, filename);
        } else if (e.target.closest('.delete-translation-btn')) {
            const btn = e.target.closest('.delete-translation-btn');
            const translationId = btn.getAttribute('data-translation-id');
            const translationName = btn.getAttribute('data-translation-name');
            openDeleteTranslationModal(translationId, translationName);
        } else if (e.target.closest('.save-purpose-btn')) {
            const btn = e.target.closest('.save-purpose-btn');
            const fileId = btn.getAttribute('data-file-id');
            const purposeInput = document.querySelector(`.purpose-input[data-file-id="${fileId}"]`);
            if (purposeInput) {
                saveFilePurpose(fileId, purposeInput, btn);
            }
        } else if (e.target.closest('.save-translation-purpose-btn')) {
            const btn = e.target.closest('.save-translation-purpose-btn');
            const translationId = btn.getAttribute('data-translation-id');
            const purposeInput = document.querySelector(`.translation-purpose-input[data-translation-id="${translationId}"]`);
            if (purposeInput) {
                saveTranslationPurpose(translationId, purposeInput, btn);
            }
        }
    });
    
    // Character counting for purpose inputs
    document.addEventListener('input', function(e) {
        if (e.target.classList.contains('purpose-input')) {
            const charCounter = e.target.parentElement.querySelector('.char-counter');
            if (charCounter) {
                const length = e.target.value.length;
                charCounter.textContent = `${length} / 1,000`;
                
                if (length > 1000) {
                    charCounter.style.color = '#dc2626';
                    e.target.style.borderColor = '#dc2626';
                } else {
                    charCounter.style.color = '#6b7280';
                    e.target.style.borderColor = '';
                }
            }
        } else if (e.target.classList.contains('translation-purpose-input')) {
            const charCounter = e.target.parentElement.querySelector('.translation-char-counter');
            if (charCounter) {
                const length = e.target.value.length;
                charCounter.textContent = `${length} / 1,000`;
                
                if (length > 1000) {
                    charCounter.style.color = '#dc2626';
                    e.target.style.borderColor = '#dc2626';
                } else {
                    charCounter.style.color = '#6b7280';
                    e.target.style.borderColor = '';
                }
            }
        }
    });
    
    if (closeDeleteModalBtn) {
        closeDeleteModalBtn.addEventListener('click', closeDeleteFileModal);
    }
    
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', closeDeleteFileModal);
    }
    
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', deleteFile);
    }
    
    if (downloadOriginalBtn) {
        downloadOriginalBtn.addEventListener('click', function() {
            originalDownloaded = true;
            updateDeleteButtonState();
        });
    }
    
    // Translation delete modal event listeners
    if (closeDeleteTranslationModalBtn) {
        closeDeleteTranslationModalBtn.addEventListener('click', closeDeleteTranslationModal);
    }
    
    if (cancelDeleteTranslationBtn) {
        cancelDeleteTranslationBtn.addEventListener('click', closeDeleteTranslationModal);
    }
    
    if (confirmDeleteTranslationBtn) {
        confirmDeleteTranslationBtn.addEventListener('click', deleteTranslation);
    }

    // Initialize drag and drop file upload
    setupDragAndDrop();



    // Fine-tuning functionality
    const filePairSelect = document.getElementById('file-pair-select');
    const baseModelSelect = document.getElementById('base-model-select');
    const modelNameInput = document.getElementById('model-name-input');
    
    // Style dropdowns on load
    styleDropdowns();
    const startFineTuningBtn = document.getElementById('start-fine-tuning-btn');
    const previewExampleBtn = document.getElementById('preview-example-btn');
    const fineTuningEstimate = document.getElementById('fine-tuning-estimate');
    const estimatedExamples = document.getElementById('estimated-examples');
    const estimatedCost = document.getElementById('estimated-cost');
    const estimatedModel = document.getElementById('estimated-model');
    const jobsList = document.getElementById('jobs-list');
    
    // Preview modal elements
    const previewModal = document.getElementById('preview-modal');
    const previewContent = document.getElementById('preview-content');
    const closePreviewModalBtn = document.getElementById('close-preview-modal-btn');
    const closePreviewBtn = document.getElementById('close-preview-btn');
    
    if (filePairSelect) {
        filePairSelect.addEventListener('change', updateFineTuningButton);
    }
    
    if (baseModelSelect) {
        baseModelSelect.addEventListener('change', updateFineTuningButton);
    }
    
    if (modelNameInput) {
        modelNameInput.addEventListener('input', updateFineTuningButton);
    }
    
    if (startFineTuningBtn) {
        startFineTuningBtn.addEventListener('click', function() {
            if (!this.disabled) {
                startFineTuning();
            }
        });
    }
    
    if (previewExampleBtn) {
        previewExampleBtn.addEventListener('click', function() {
            previewTrainingExample();
        });
    }
    
    if (closePreviewModalBtn) {
        closePreviewModalBtn.addEventListener('click', closePreviewModal);
    }
    
    if (closePreviewBtn) {
        closePreviewBtn.addEventListener('click', closePreviewModal);
    }
    
    if (previewModal) {
        previewModal.addEventListener('click', function(e) {
            if (e.target === previewModal) {
                closePreviewModal();
            }
        });
    }
    
    // Setup instruction fine-tuning functionality
    setupFineTuningTabs();
    
    
    // Instruction fine-tuning listeners
    const instructionFilePairSelect = document.getElementById('instruction-file-pair-select');
    const instructionBaseModelSelect = document.getElementById('instruction-base-model-select');
    const instructionModelNameInput = document.getElementById('instruction-model-name-input');
    const maxExamplesSelect = document.getElementById('max-examples-select');
    
    if (instructionFilePairSelect) {
        instructionFilePairSelect.addEventListener('change', updateInstructionFineTuningButton);
    }
    if (instructionBaseModelSelect) {
        instructionBaseModelSelect.addEventListener('change', updateInstructionFineTuningButton);
    }
    if (instructionModelNameInput) {
        instructionModelNameInput.addEventListener('input', updateInstructionFineTuningButton);
    }
    if (maxExamplesSelect) {
        maxExamplesSelect.addEventListener('change', updateInstructionFineTuningButton);
    }
    
    const previewInstructionBtn = document.getElementById('preview-instruction-example-btn');
    const startInstructionBtn = document.getElementById('start-instruction-fine-tuning-btn');
    
    if (previewInstructionBtn) {
        previewInstructionBtn.addEventListener('click', previewInstructionExample);
    }
    
    if (startInstructionBtn) {
        startInstructionBtn.addEventListener('click', startInstructionFineTuning);
    }

    // Load fine-tuning data on page load
    loadFineTuningModels();
    loadFineTuningJobs();
    
    function updateFineTuningButton() {
        const pairSelected = filePairSelect && filePairSelect.value !== '';
        const modelSelected = baseModelSelect && baseModelSelect.value !== '';
        const modelNamed = modelNameInput && modelNameInput.value.trim() !== '';
        const canStart = pairSelected && modelSelected && modelNamed;
        
        // Handle the estimate section visibility
        const fineTuningEstimate = document.getElementById('fine-tuning-estimate');
        const noEstimate = document.getElementById('no-estimate');
        
        if (canStart) {
            // Show estimate section, hide no-estimate section
            if (fineTuningEstimate) fineTuningEstimate.classList.remove('hidden');
            if (noEstimate) noEstimate.classList.add('hidden');
            
            // Enable the main fine-tuning button
            if (startFineTuningBtn) {
                startFineTuningBtn.disabled = false;
                startFineTuningBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
            
            // Get cost estimate when both pair and model are selected
            getFineTuningEstimate();
        } else {
            // Hide estimate section, show no-estimate section
            if (fineTuningEstimate) fineTuningEstimate.classList.add('hidden');
            if (noEstimate) noEstimate.classList.remove('hidden');
            
            // Disable the main fine-tuning button
            if (startFineTuningBtn) {
                startFineTuningBtn.disabled = true;
                startFineTuningBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    }
    
    function openDeleteFileModal(fileId, filename) {
        currentFileToDelete = fileId;
        originalDownloaded = false;
        
        document.getElementById('delete-filename').textContent = filename;
        
        const downloadBtn = document.getElementById('download-original-btn');
        downloadBtn.href = `/project/${projectId}/file/${fileId}/download`;
        
        updateDeleteButtonState();
        deleteFileModal.classList.remove('hidden');
    }
    
    function closeDeleteFileModal() {
        deleteFileModal.classList.add('hidden');
        currentFileToDelete = null;
        originalDownloaded = false;
    }
    
    function updateDeleteButtonState() {
        const confirmBtn = document.getElementById('confirm-delete-btn');
        if (originalDownloaded) {
            confirmBtn.disabled = false;
            confirmBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            confirmBtn.disabled = true;
            confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }
    
    function deleteFile() {
        if (!currentFileToDelete || !originalDownloaded) return;
        
        fetch(`/project/${projectId}/files/${currentFileToDelete}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => {
            if (response.ok) {
                location.reload();
            } else {
                return response.json().then(data => {
                    throw new Error(data.error || 'Failed to delete file');
                });
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error deleting file');
        });
    }
    
    function openDeleteTranslationModal(translationId, translationName) {
        currentTranslationToDelete = translationId;
        document.getElementById('delete-translation-filename').textContent = translationName;
        deleteTranslationModal.classList.remove('hidden');
    }
    
    function closeDeleteTranslationModal() {
        currentTranslationToDelete = null;
        deleteTranslationModal.classList.add('hidden');
    }
    
    function deleteTranslation() {
        if (!currentTranslationToDelete) return;
        
        // All translations are now unified Text records
        fetch(`/project/${projectId}/texts/${currentTranslationToDelete}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            }
        })
        .then(response => {
            if (response.ok) {
                location.reload();
            } else {
                return response.json().then(data => {
                    throw new Error(data.error || 'Failed to delete translation');
                });
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error deleting translation');
        });
    }
    
    function openImportModal() {
        currentImportMethod = 'upload';
        updateImportSections();
        updateImportButton();
        importModal.classList.remove('hidden');
    }
    
    function closeImportModal() {
        importModal.classList.add('hidden');
        selectedCorpusFile = null;
        // Reset form
        const uploadMethodRadios = document.querySelectorAll('input[name="upload_method"]');
        uploadMethodRadios.forEach(radio => {
            if (radio.value === 'file') radio.checked = true;
        });
        
        const importMethodRadios = document.querySelectorAll('input[name="import_method"]');
        importMethodRadios.forEach(radio => {
            if (radio.value === 'upload') radio.checked = true;
        });
        
        // Clear file input and text area
        const fileInput = document.getElementById('file-input');
        const textArea = document.getElementById('text-content-upload');
        if (fileInput) fileInput.value = '';
        if (textArea) textArea.value = '';
        
        // Reset sections
        document.getElementById('file-upload-section').classList.remove('hidden');
        document.getElementById('text-paste-section').classList.add('hidden');
    }
    
    function updateImportSections() {
        // Hide all sections first
        uploadSection.classList.add('hidden');
        corpusSection.classList.add('hidden');
        
        // Show the selected section
        switch(currentImportMethod) {
            case 'upload':
                uploadSection.classList.remove('hidden');
                setupDragAndDrop(); // Initialize drag and drop for upload
                break;
            case 'corpus':
                corpusSection.classList.remove('hidden');
                loadCorpusFiles();
                break;
        }
    }
    
    function updateImportButton() {
        if (!confirmImportBtn) return;
        
        let canImport = false;
        
        switch(currentImportMethod) {
            case 'upload':
                const fileInput = document.getElementById('file-input');
                canImport = fileInput && fileInput.files.length > 0;
                break;
            case 'corpus':
                canImport = selectedCorpusFile !== null;
                break;
        }
        
        confirmImportBtn.disabled = !canImport;
        if (canImport) {
            confirmImportBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            confirmImportBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
        
        // Update button text based on method
        switch(currentImportMethod) {
            case 'upload':
                confirmImportBtn.textContent = 'Upload';
                break;
            case 'corpus':
                confirmImportBtn.textContent = 'Import';
                break;
        }
    }
    
    function handleImport() {
        switch(currentImportMethod) {
            case 'upload':
                uploadFile();
                break;
            case 'corpus':
                importSelectedCorpusFile();
                break;
        }
    }
    
    function uploadFile() {
        const uploadMethod = document.querySelector('input[name="upload_method"]:checked')?.value;
        
        if (uploadMethod === 'file') {
            const fileInput = document.getElementById('text-file-upload');
            if (!fileInput.files.length) return;
            
            const formData = new FormData();
            formData.append('file', fileInput.files[0]);
            formData.append('upload_method', 'file');
            
            fetch(`/project/${projectId}/upload`, {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    if (data.is_usfm && data.redirect_url) {
                        // USFM detected - redirect to USFM import page
                        window.location.href = data.redirect_url;
                    } else {
                        // Regular text file - reload page
                        location.reload();
                    }
                } else {
                    alert('Error uploading file: ' + data.error);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Error uploading file');
            });
        } else if (uploadMethod === 'text') {
            const textContent = document.getElementById('text-content-upload').value;
            if (!textContent.trim()) return;
            
            const formData = new FormData();
            formData.append('text_content', textContent);
            formData.append('upload_method', 'text');
            
            fetch(`/project/${projectId}/upload`, {
                method: 'POST',
                body: formData
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    if (data.is_usfm && data.redirect_url) {
                        // USFM detected - redirect to USFM import page
                        window.location.href = data.redirect_url;
                    } else {
                        // Regular text file - reload page
                        location.reload();
                    }
                } else {
                    alert('Error uploading text: ' + data.error);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Error uploading text');
            });
        }
    }
    
    function loadCorpusFiles() {
        if (!corpusFilesLoading) return;
        
        corpusFilesLoading.classList.remove('hidden');
        corpusFilesList.classList.add('hidden');
        corpusFilesEmpty.classList.add('hidden');
        corpusSearchSection.classList.add('hidden');
        
        fetch('/api/corpus/files')
            .then(response => response.json())
            .then(data => {
                corpusFilesLoading.classList.add('hidden');
                if (data.files && data.files.length > 0) {
                    displayCorpusFiles(data.files);
                    corpusSearchSection.classList.remove('hidden');
                    setupCorpusSearch();
                } else {
                    corpusFilesEmpty.classList.remove('hidden');
                }
            })
            .catch(error => {
                console.error('Error loading corpus files:', error);
                corpusFilesLoading.classList.add('hidden');
                corpusFilesEmpty.classList.remove('hidden');
            });
    }
    
    function displayCorpusFiles(files) {
        corpusFilesList.innerHTML = '';
        
        files.forEach(file => {
            const fileElement = document.createElement('label');
            fileElement.className = 'flex items-center p-3 border border-neutral-200 rounded-lg hover:bg-neutral-50 cursor-pointer transition-colors';
            fileElement.innerHTML = `
                <input type="radio" name="corpus_file" value="${file.filename}" class="mr-3 text-blue-600 focus:ring-blue-500">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center">
                        <i class="fas fa-book text-blue-600 mr-2"></i>
                        <span class="text-sm font-medium text-neutral-900 truncate">${file.display_name || file.filename}</span>
                    </div>
                    <div class="text-xs text-neutral-600 mt-1">
                        ${(file.file_size / 1024).toFixed(1)} KB • ${file.line_count} verses
                    </div>
                </div>
            `;
            
            const radio = fileElement.querySelector('input[type="radio"]');
            radio.addEventListener('change', function() {
                if (this.checked) {
                    selectedCorpusFile = file;
                    updateImportButton();
                }
            });
            
            corpusFilesList.appendChild(fileElement);
        });
        
        corpusFilesList.classList.remove('hidden');
    }
    
    function setupCorpusSearch() {
        if (!corpusSearchInput) return;
        
        corpusSearchInput.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const fileLabels = corpusFilesList.querySelectorAll('label');
            let visibleCount = 0;
            
            fileLabels.forEach(label => {
                const text = label.textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    label.style.display = 'flex';
                    visibleCount++;
                } else {
                    label.style.display = 'none';
                }
            });
            
            if (visibleCount === 0 && searchTerm !== '') {
                corpusNoResults.classList.remove('hidden');
                corpusFilesList.classList.add('hidden');
            } else {
                corpusNoResults.classList.add('hidden');
                corpusFilesList.classList.remove('hidden');
            }
        });
    }
    
    function importSelectedCorpusFile() {
        if (!selectedCorpusFile) return;
        
        fetch(`/project/${projectId}/import-corpus`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filename: selectedCorpusFile.filename
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                location.reload();
            } else {
                alert('Error importing corpus file: ' + data.error);
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert('Error importing corpus file');
        });
    }



    // Fine-tuning functionality
    function loadFineTuningModels() {
        if (!baseModelSelect) return;
        
        fetch(`/project/${projectId}/fine-tuning/models`)
        .then(response => response.json())
        .then(data => {
            if (data.models) {
                // Populate both regular and instruction model selects
                populateModelSelect(baseModelSelect, data.models);
                
                const instructionBaseModelSelect = document.getElementById('instruction-base-model-select');
                if (instructionBaseModelSelect) {
                    populateModelSelect(instructionBaseModelSelect, data.models);
                }
                
                updateFineTuningButton();
            } else {
                throw new Error(data.error || 'Failed to load models');
            }
        })
        .catch(error => {
            console.error('Models error:', error);
            baseModelSelect.innerHTML = '<option value="">Error loading models</option>';
        });
    }
    
    function populateModelSelect(selectElement, models) {
        selectElement.innerHTML = '<option value="">Select a model...</option>';
        
        // Separate base models from fine-tuned models
        const baseModels = [];
        const fineTunedModels = [];
        
        Object.entries(models).forEach(([key, model]) => {
            if (model.type === 'fine_tuned') {
                fineTunedModels.push([key, model]);
            } else if (model.type === 'base') {
                baseModels.push([key, model]);
            }
        });
        
        // Sort fine-tuned models by creation date (newest first)
        fineTunedModels.sort((a, b) => {
            if (!a[1].created_at) return 1;
            if (!b[1].created_at) return -1;
            return new Date(b[1].created_at) - new Date(a[1].created_at);
        });
        
        // Add base models first
        if (baseModels.length > 0) {
            const baseGroup = document.createElement('optgroup');
            baseGroup.label = '🚀 Base Models';
            baseModels.forEach(([key, model]) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = `${model.name} - ${model.description}`;
                if (key === 'gpt-4.1-mini') {
                    option.selected = true;
                }
                baseGroup.appendChild(option);
            });
            selectElement.appendChild(baseGroup);
        }
        
        // Add fine-tuned models
        if (fineTunedModels.length > 0) {
            const fineTunedGroup = document.createElement('optgroup');
            fineTunedGroup.label = '🎯 Fine-tuned Models';
            fineTunedModels.forEach(([key, model]) => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = model.name;
                fineTunedGroup.appendChild(option);
            });
            selectElement.appendChild(fineTunedGroup);
        }
    }
    
    function getFineTuningEstimate() {
        const pairValue = filePairSelect.value;
        const baseModel = baseModelSelect.value;
        if (!pairValue || !baseModel) return;
        
        const [sourceFileId, targetFileId] = pairValue.split(',');
        
        fetch(`/project/${projectId}/fine-tuning/estimate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source_file_id: parseInt(sourceFileId),
                target_file_id: parseInt(targetFileId),
                base_model: baseModel
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.num_examples) {
                estimatedModel.textContent = baseModelSelect.options[baseModelSelect.selectedIndex].text.split(' - ')[0];
                estimatedExamples.textContent = data.num_examples;
                estimatedCost.textContent = data.estimated_cost_usd;
                fineTuningEstimate.classList.remove('hidden');
            } else {
                throw new Error(data.error || 'Failed to get estimate');
            }
        })
        .catch(error => {
            console.error('Estimate error:', error);
            if (fineTuningEstimate) {
                fineTuningEstimate.classList.add('hidden');
            }
        });
    }
    
    function startFineTuning() {
        const pairValue = filePairSelect.value;
        const baseModel = baseModelSelect.value;
        const modelName = modelNameInput ? modelNameInput.value.trim() : '';
        
        if (!pairValue || !baseModel) {
            alert('Please select both a file pair and model');
            return;
        }
        
        if (!modelName) {
            alert('Please enter a model name - this is required for the model to appear in translation dropdown');
            return;
        }
        
        const [sourceFileId, targetFileId] = pairValue.split(',');
        const pairText = filePairSelect.options[filePairSelect.selectedIndex].text;
        const modelText = baseModelSelect.options[baseModelSelect.selectedIndex].text.split(' - ')[0];
        
        if (!confirm(`Start fine-tuning with:\n${pairText}\nModel: ${modelText}\nName: "${modelName}"\n\nThis will take 1-3 hours and cost around $${estimatedCost.textContent}. Continue?`)) {
            return;
        }
        
        startFineTuningBtn.disabled = true;
        startFineTuningBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Starting...';
        
        fetch(`/project/${projectId}/fine-tuning/jobs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source_file_id: parseInt(sourceFileId),
                target_file_id: parseInt(targetFileId),
                base_model: baseModel,
                display_name: modelName
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                if (data.warning) {
                    // Show warning message for partial success
                    alert(`⚠️ ${data.message}\n\nError details: ${data.error_details}`);
                } else {
                    // Full success
                    alert(`✅ Fine-tuning job started! Job ID: ${data.job_id}`);
                }
                loadFineTuningJobs(); // Refresh jobs list
                filePairSelect.value = ''; // Reset selection
                baseModelSelect.value = 'gpt-4o-mini'; // Reset to default
                if (modelNameInput) modelNameInput.value = ''; // Reset model name
                updateFineTuningButton();
            } else {
                throw new Error(data.error || 'Failed to start fine-tuning');
            }
        })
        .catch(error => {
            console.error('Fine-tuning error:', error);
            alert('Failed to start fine-tuning: ' + error.message);
        })
        .finally(() => {
            startFineTuningBtn.disabled = false;
            startFineTuningBtn.innerHTML = '<i class="fas fa-rocket mr-2"></i>Start Fine-Tuning';
        });
    }
    
    function loadFineTuningJobs() {
        if (!jobsList) return;
        
        fetch(`/project/${projectId}/fine-tuning/jobs`)
        .then(response => response.json())
        .then(data => {
            if (data.jobs) {
                displayFineTuningJobs(data.jobs);
                renderModelsSidebar(data.jobs);
            }
        })
        .catch(error => {
            console.error('Error loading jobs:', error);
        });
    }
    
    function displayFineTuningJobs(jobs) {
        if (!jobsList) return;
        
        jobsList.innerHTML = '';
        
        if (jobs.length === 0) {
            jobsList.innerHTML = '<div class="text-neutral-500 text-sm">No fine-tuning jobs yet</div>';
            return;
        }
        
        jobs.forEach(job => {
            const jobElement = document.createElement('div');
            jobElement.className = 'bg-white border border-neutral-200 rounded-lg p-4 mb-4';
            
            const statusClass = getStatusColor(job.status);
            const statusIcon = getStatusIcon(job.status);
            
            jobElement.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-2">
                        <i class="fas ${statusIcon} ${statusClass}"></i>
                        <span class="font-medium ${statusClass}">${job.status.charAt(0).toUpperCase() + job.status.slice(1)}</span>
                    </div>
                    <div class="text-sm text-neutral-500">${formatDate(job.created_at)}</div>
                </div>
                
                <div class="mt-2 text-sm">
                    <div class="font-medium">${job.source_file} → ${job.target_file}</div>
                    <div class="text-neutral-600">Base: ${job.base_model}</div>
                    ${job.training_examples ? `<div class="text-neutral-600">Examples: ${job.training_examples.toLocaleString()}</div>` : ''}
                    ${job.estimated_cost ? `<div class="text-neutral-600">Est. Cost: $${job.estimated_cost.toFixed(2)}</div>` : ''}
                </div>
                
                ${job.progress_message ? `
                    <div class="mt-2 text-sm text-neutral-600">
                        ${job.progress_message}
                    </div>
                ` : ''}
                
                ${job.error_message ? `
                    <div class="mt-2 text-sm text-red-600">
                        Error: ${job.error_message}
                    </div>
                ` : ''}
            `;
            
            jobsList.appendChild(jobElement);
        });
        
        // Auto-refresh for active jobs
        const hasActiveJobs = jobs.some(job => ['preparing', 'uploading', 'training', 'validating'].includes(job.status));
        if (hasActiveJobs) {
            setTimeout(loadFineTuningJobs, 10000);
        }
    }
    
    function getStatusColor(status) {
        switch(status) {
            case 'completed': return 'text-green-600';
            case 'failed': return 'text-red-600';
            case 'training': return 'text-blue-600';
            case 'preparing':
            case 'uploading':
            case 'validating': return 'text-amber-600';
            default: return 'text-neutral-600';
        }
    }
    
    function getStatusIcon(status) {
        switch(status) {
            case 'completed': return 'fa-check-circle';
            case 'failed': return 'fa-times-circle';
            case 'training': return 'fa-cog fa-spin';
            case 'preparing':
            case 'uploading':
            case 'validating': return 'fa-clock';
            default: return 'fa-circle';
        }
    }
    
    function formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    }
    
    function previewTrainingExample() {
        const pairValue = filePairSelect.value;
        if (!pairValue) {
            alert('Please select a file pair first');
            return;
        }
        
        const [sourceFileId, targetFileId] = pairValue.split(',');
        
        // Show loading state
        previewContent.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-blue-600 text-2xl"></i><p class="mt-2 text-neutral-600">Loading preview...</p></div>';
        previewModal.classList.remove('hidden');
        
        fetch(`/project/${projectId}/fine-tuning/preview`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source_file_id: parseInt(sourceFileId),
                target_file_id: parseInt(targetFileId)
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.preview_example) {
                displayPreviewExample(data);
            } else {
                throw new Error(data.error || 'Failed to get preview');
            }
        })
        .catch(error => {
            console.error('Preview error:', error);
            previewContent.innerHTML = `
                <div class="text-center py-8">
                    <i class="fas fa-exclamation-triangle text-red-600 text-2xl"></i>
                    <p class="mt-2 text-red-600 font-medium">Failed to load preview</p>
                    <p class="text-sm text-neutral-600">${error.message}</p>
                </div>
            `;
        });
    }
    
    function displayPreviewExample(data) {
        const preview = data.preview_example;
        
        previewContent.innerHTML = `
            <div class="space-y-4">
                <div class="p-4 bg-blue-50 border border-blue-200">
                    <h4 class="font-bold text-blue-900 mb-2">Training Data Summary</h4>
                    <div class="grid grid-cols-2 gap-4 text-sm">
                        <div>
                            <span class="font-medium">Source File:</span> ${data.source_filename}
                        </div>
                        <div>
                            <span class="font-medium">Target File:</span> ${data.target_filename}
                        </div>
                        <div>
                            <span class="font-medium">Total Lines:</span> ${data.total_lines}
                        </div>
                        <div>
                            <span class="font-medium">Valid Examples:</span> ${data.valid_examples}
                        </div>
                        ${data.filtered_out > 0 ? `
                        <div class="col-span-2">
                            <span class="font-medium text-amber-700">Filtered Out:</span> 
                            <span class="text-amber-700">${data.filtered_out} lines (too short)</span>
                        </div>
                        ` : ''}
                    </div>
                </div>
                
                <div class="p-4 border border-neutral-300 paper-white">
                    <h4 class="font-bold text-neutral-900 mb-3">
                        Example Training Message (Line ${preview.line_number})
                    </h4>
                    
                    <div class="space-y-3">
                        <div class="p-3 bg-neutral-100 border border-neutral-200">
                            <div class="text-xs font-bold text-neutral-600 mb-1">SYSTEM PROMPT:</div>
                            <div class="text-sm text-neutral-800">${preview.system_prompt}</div>
                        </div>
                        
                        <div class="p-3 bg-blue-50 border border-blue-200">
                            <div class="text-xs font-bold text-blue-600 mb-1">USER INPUT:</div>
                            <div class="text-sm text-blue-800">${preview.user_prompt}</div>
                            <div class="mt-2 p-2 bg-white border border-blue-300 text-xs">
                                <span class="font-medium">Source text:</span> "${preview.source_text}"
                            </div>
                        </div>
                        
                        <div class="p-3 bg-green-50 border border-green-200">
                            <div class="text-xs font-bold text-green-600 mb-1">EXPECTED OUTPUT:</div>
                            <div class="text-sm text-green-800">${preview.assistant_response}</div>
                            <div class="mt-2 p-2 bg-white border border-green-300 text-xs">
                                <span class="font-medium">Target text:</span> "${preview.target_text}"
                            </div>
                        </div>
                    </div>
                </div>
                
                ${data.jsonl_example ? `
                <div class="p-4 border border-neutral-300 paper-white">
                    <h4 class="font-bold text-neutral-900 mb-3">
                        <i class="fas fa-code mr-2"></i>Actual JSONL Training Format
                    </h4>
                    <div class="text-xs text-neutral-600 mb-2">
                        This is the exact format that will be sent to OpenAI for fine-tuning:
                    </div>
                    <pre class="bg-neutral-900 text-green-400 p-3 text-xs overflow-x-auto border border-neutral-600 font-mono">${data.jsonl_example}</pre>
                </div>
                ` : ''}
                
                <div class="p-3 bg-amber-50 border border-amber-200">
                    <div class="flex items-start">
                        <i class="fas fa-info-circle text-amber-600 mr-2 mt-0.5"></i>
                        <div class="text-sm text-amber-800">
                            <strong>What this means:</strong> The AI will learn to translate text like "${preview.source_text}" 
                            into "${preview.target_text}" based on ${data.valid_examples} similar examples.
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
    
    function closePreviewModal() {
        if (previewModal) {
            previewModal.classList.add('hidden');
        }
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
        stopBackTranslationStatusChecking();
    });

    // File pairing functions
    // File purpose editing functionality
    function saveFilePurpose(fileId, purposeInput, button) {
        const purposeDescription = purposeInput.value.trim();
        
        if (purposeDescription.length > 1000) {
            alert('Purpose description must be 1000 characters or less');
            return;
        }
        
        // Visual feedback
        purposeInput.style.opacity = '0.6';
        purposeInput.disabled = true;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Saving...';
        
        fetch(`/project/${projectId}/files/${fileId}/purpose`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                purpose_description: purposeDescription,
                file_purpose: purposeDescription ? 'custom' : null
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Show success feedback
                purposeInput.style.borderColor = '#10b981';
                button.innerHTML = '<i class="fas fa-check mr-1"></i>Saved!';
                
                // Reset after 2 seconds
                setTimeout(() => {
                    purposeInput.style.borderColor = '';
                    button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
                }, 2000);
            } else {
                alert('Failed to save purpose: ' + (data.error || 'Unknown error'));
                purposeInput.style.borderColor = '#ef4444';
                button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
            }
        })
        .catch(error => {
            console.error('Save error:', error);
            alert('Failed to save purpose: ' + error.message);
            purposeInput.style.borderColor = '#ef4444';
            button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
        })
        .finally(() => {
            purposeInput.style.opacity = '1';
            purposeInput.disabled = false;
            button.disabled = false;
        });
    }
    
    function saveTranslationPurpose(translationId, purposeInput, button) {
        const purposeDescription = purposeInput.value.trim();
        
        if (purposeDescription.length > 1000) {
            alert('Purpose description must be 1000 characters or less');
            return;
        }
        
        // All translations are now unified Text records
        // Visual feedback
        purposeInput.style.opacity = '0.6';
        purposeInput.disabled = true;
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin mr-1"></i>Saving...';
        
        fetch(`/project/${projectId}/texts/${translationId}/purpose`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                description: purposeDescription
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                // Show success feedback
                purposeInput.style.borderColor = '#10b981';
                button.innerHTML = '<i class="fas fa-check mr-1"></i>Saved!';
                
                // Reset after 2 seconds
                setTimeout(() => {
                    purposeInput.style.borderColor = '';
                    button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
                }, 2000);
            } else {
                alert('Failed to save purpose: ' + (data.error || 'Unknown error'));
                purposeInput.style.borderColor = '#ef4444';
                button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
            }
        })
        .catch(error => {
            console.error('Save error:', error);
            alert('Failed to save purpose: ' + error.message);
            purposeInput.style.borderColor = '#ef4444';
            button.innerHTML = '<i class="fas fa-save mr-1"></i>Save';
        })
        .finally(() => {
            purposeInput.style.opacity = '1';
            purposeInput.disabled = false;
            button.disabled = false;
        });
    }
    

    
    // Close pairing modal when clicking outside
    if (filePairingModal) {
        filePairingModal.addEventListener('click', function(e) {
            if (e.target === filePairingModal) {
                closePairingModal();
            }
        });
    }



    // Tab switching for fine-tuning types
    function setupFineTuningTabs() {
        const regularTab = document.getElementById('regular-tuning-tab');
        const instructionTab = document.getElementById('instruction-tuning-tab');
        const regularConfig = document.getElementById('regular-tuning-config');
        const instructionConfig = document.getElementById('instruction-tuning-config');
        
        if (!regularTab || !instructionTab) return;
        
        // Show regular tab by default
        if (regularConfig) regularConfig.classList.remove('hidden');
        
        regularTab.addEventListener('click', () => {
            // Switch to regular fine-tuning
            regularTab.classList.add('paper-white', 'border-neutral-300');
            regularTab.classList.remove('text-neutral-600');
            instructionTab.classList.remove('paper-white', 'border-neutral-300');
            instructionTab.classList.add('text-neutral-600');
            
            regularConfig.classList.remove('hidden');
            instructionConfig.classList.add('hidden');
            
            updateFineTuningButton();
        });
        
        instructionTab.addEventListener('click', () => {
            // Switch to instruction fine-tuning
            instructionTab.classList.add('paper-white', 'border-neutral-300');
            instructionTab.classList.remove('text-neutral-600');
            regularTab.classList.remove('paper-white', 'border-neutral-300');
            regularTab.classList.add('text-neutral-600');
            
            instructionConfig.classList.remove('hidden');
            regularConfig.classList.add('hidden');
            
            updateInstructionFineTuningButton();
        });
    }
    
    function updateInstructionFineTuningButton() {
        const instructionFilePairSelect = document.getElementById('instruction-file-pair-select');
        const instructionBaseModelSelect = document.getElementById('instruction-base-model-select');
        const instructionModelNameInput = document.getElementById('instruction-model-name-input');
        const instructionEstimate = document.getElementById('instruction-fine-tuning-estimate');
        const noEstimate = document.getElementById('no-estimate');
        
        if (!instructionFilePairSelect || !instructionBaseModelSelect) return;
        
        const pairValue = instructionFilePairSelect.value;
        const baseModel = instructionBaseModelSelect.value;
        const modelName = instructionModelNameInput ? instructionModelNameInput.value.trim() : '';
        const canEstimate = pairValue && baseModel && modelName;
        
        if (canEstimate) {
            getInstructionFineTuningEstimate();
        } else {
            if (instructionEstimate) instructionEstimate.classList.add('hidden');
            if (noEstimate) noEstimate.classList.remove('hidden');
            
            // Disable preview button when requirements not met
            const previewBtn = document.getElementById('preview-instruction-example-btn');
            if (previewBtn) {
                previewBtn.disabled = true;
                previewBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
        }
    }
    
    function getInstructionFineTuningEstimate() {
        const instructionFilePairSelect = document.getElementById('instruction-file-pair-select');
        const instructionBaseModelSelect = document.getElementById('instruction-base-model-select');
        const instructionModelNameInput = document.getElementById('instruction-model-name-input');
        const maxExamplesSelect = document.getElementById('max-examples-select');
        
        const pairValue = instructionFilePairSelect.value;
        const baseModel = instructionBaseModelSelect.value;
        const maxExamples = parseInt(maxExamplesSelect.value) || 50;
        
        if (!pairValue || !baseModel) return;
        
        const [sourceFileId, targetFileId] = pairValue.split(',');
        
        fetch(`/project/${projectId}/fine-tuning/instruction/estimate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source_file_id: parseInt(sourceFileId),
                target_file_id: parseInt(targetFileId),
                base_model: baseModel,
                max_examples: maxExamples
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.num_examples !== undefined) {
                const estimatedModel = document.getElementById('estimated-model');
                const estimatedExamples = document.getElementById('estimated-examples');
                const estimatedCost = document.getElementById('estimated-cost');
                const instructionEstimate = document.getElementById('instruction-fine-tuning-estimate');
                const noEstimate = document.getElementById('no-estimate');
                
                if (estimatedModel) estimatedModel.textContent = instructionBaseModelSelect.options[instructionBaseModelSelect.selectedIndex].text.split(' - ')[0];
                if (estimatedExamples) estimatedExamples.textContent = data.num_examples;
                if (estimatedCost) estimatedCost.textContent = data.estimated_cost_usd;
                if (instructionEstimate) instructionEstimate.classList.remove('hidden');
                if (noEstimate) noEstimate.classList.add('hidden');
                
                // Enable the preview button (now "Get Training Data")
                const previewBtn = document.getElementById('preview-instruction-example-btn');
                if (previewBtn) {
                    previewBtn.disabled = false;
                    previewBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
                
                // Start button stays disabled until user gets training data
                const startBtn = document.getElementById('start-instruction-fine-tuning-btn');
                if (startBtn) {
                    startBtn.disabled = true;
                    startBtn.classList.add('opacity-50', 'cursor-not-allowed');
                }
            } else {
                throw new Error(data.error || 'Failed to get estimate');
            }
        })
        .catch(error => {
            console.error('Instruction estimate error:', error);
            const instructionEstimate = document.getElementById('instruction-fine-tuning-estimate');
            if (instructionEstimate) instructionEstimate.classList.add('hidden');
        });
    }
    
    function previewInstructionExample() {
        const instructionFilePairSelect = document.getElementById('instruction-file-pair-select');
        const instructionBaseModelSelect = document.getElementById('instruction-base-model-select');
        const instructionModelNameInput = document.getElementById('instruction-model-name-input');
        const maxExamplesSelect = document.getElementById('max-examples-select');
        
        const pairValue = instructionFilePairSelect.value;
        const baseModel = instructionBaseModelSelect.value;
        const maxExamples = parseInt(maxExamplesSelect.value) || 50;
        
        if (!pairValue || !baseModel) {
            alert('Please select file pair and model');
            return;
        }
        
        const [sourceFileId, targetFileId] = pairValue.split(',');
        
        const previewBtn = document.getElementById('preview-instruction-example-btn');
        if (previewBtn) {
            previewBtn.disabled = true;
            previewBtn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Processing 0/${maxExamples}...`;
        }
        
        // Start the context-aware training data generation
        fetch(`/project/${projectId}/fine-tuning/instruction/preview`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source_file_id: parseInt(sourceFileId),
                target_file_id: parseInt(targetFileId),
                max_examples: maxExamples
            })
        })
        .then(response => response.json())
        .then(data => {
            console.log('Preview response:', data);
            if (data.progress_id) {
                // Start polling for progress
                pollInstructionProgress(data.progress_id, previewBtn, maxExamples);
            } else {
                console.log('No progress_id in response:', data);
                if (previewBtn) {
                    previewBtn.disabled = false;
                    previewBtn.innerHTML = '<i class="fas fa-database mr-2"></i>Get Training Data';
                }
            }
        });
    }
    
    // Add this variable at the top level of the file
    let lastPreviewProgressId = null;

    // Modify the pollInstructionProgress function
    function pollInstructionProgress(progressId, button, maxExamples) {
        function checkProgress() {
            fetch(`/project/${projectId}/fine-tuning/instruction/preview/progress/${progressId}`)
                .then(response => response.json())
                .then(data => {
                    console.log('Progress data:', data);
                    
                    // Update button with progress
                    if (data.status === 'processing') {
                        const current = data.current || 0;
                        const total = data.total || maxExamples;
                        if (button) {
                            button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>Processing ${current}/${total}...`;
                        }
                        // Continue polling
                        setTimeout(checkProgress, 1000);
                    } else if (data.status === 'completed') {
                        // Store the progress ID for later use
                        lastPreviewProgressId = progressId;
                        
                        // Display the result
                        displayInstructionPreviewExample(data.result);
                        const modal = document.getElementById('preview-modal');
                        if (modal) modal.classList.remove('hidden');
                        
                        // Enable the start button
                        const startBtn = document.getElementById('start-instruction-fine-tuning-btn');
                        if (startBtn) {
                            startBtn.disabled = false;
                            startBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                        }
                        
                        if (button) {
                            button.disabled = false;
                            button.innerHTML = '<i class="fas fa-database mr-2"></i>Get Training Data';
                        }
                    } else if (data.status === 'error') {
                        console.log('Error status:', data.message);
                        if (button) {
                            button.disabled = false;
                            button.innerHTML = '<i class="fas fa-database mr-2"></i>Get Training Data';
                        }
                    } else {
                        // Keep polling for any other status
                        setTimeout(checkProgress, 1000);
                    }
                });
        }
        
        // Start polling
        checkProgress();
    }
    
    function displayInstructionPreviewExample(data) {
        const previewContent = document.getElementById('preview-content');
        if (!previewContent) return;
        
        const example = data.preview_example;
        
        previewContent.innerHTML = `
            <div class="space-y-4">
                <div class="p-3 bg-green-50 border border-green-200">
                    <div class="text-sm text-green-700 font-bold mb-2">✅ Training Data Generated Successfully</div>
                    <div class="grid grid-cols-2 gap-4 text-sm text-green-700">
                        <div><strong>Training Examples:</strong> ${data.selected_examples}</div>
                        <div><strong>Context per Example:</strong> ~${example.context_examples_count} examples</div>
                        <div><strong>Source File:</strong> ${data.source_filename}</div>
                        <div><strong>Target File:</strong> ${data.target_filename}</div>
                    </div>
                    <div class="mt-2 text-xs text-green-600">
                        <strong>${data.selected_examples} complete training examples</strong> have been generated and are ready for fine-tuning. Each example includes contextual translation examples to help the model learn patterns.
                    </div>
                </div>
                
                <div class="p-3 bg-purple-50 border border-purple-200">
                    <div class="text-sm text-purple-700 font-bold mb-2">👁️ Preview: Sample Training Example (1 of ${data.selected_examples})</div>
                    <div class="text-xs text-purple-600">
                        This shows what one training example looks like. The fine-tuning will use all ${data.selected_examples} examples.
                    </div>
                </div>
                
                <div>
                    <div class="text-sm font-bold text-neutral-700 mb-2">🤖 System Prompt:</div>
                    <div class="p-3 paper-light border border-neutral-200 text-sm break-words">${example.system_prompt}</div>
                </div>
                
                <div>
                    <div class="text-sm font-bold text-neutral-700 mb-2">👤 User Prompt ${example.has_context ? `(with ${example.context_examples_count} context examples)` : '(simple)'}:</div>
                    <div class="p-3 paper-light border border-neutral-200 text-sm break-words max-h-60 overflow-y-auto">${example.user_prompt.replace(/\n/g, '<br>')}</div>
                </div>
                
                <div>
                    <div class="text-sm font-bold text-neutral-700 mb-2">🎯 Expected Response:</div>
                    <div class="p-3 paper-light border border-neutral-200 text-sm break-words">${example.assistant_response}</div>
                </div>
                
                <div>
                    <div class="text-sm font-bold text-neutral-700 mb-2">📄 JSONL Format Sample:</div>
                    <pre class="p-3 paper-light border border-neutral-200 text-xs overflow-x-auto max-h-40">${data.jsonl_example}</pre>
                </div>
                
                <div class="p-3 bg-blue-50 border border-blue-200">
                    <div class="text-sm text-blue-700">
                        <strong>📊 Dataset Ready:</strong> ${data.selected_examples} training examples are prepared and ready for OpenAI fine-tuning. Click "Start Fine-Tuning" to begin the training process.
                    </div>
                </div>
            </div>
        `;
    }
    
    // Modify the startInstructionFineTuning function
    function startInstructionFineTuning() {
        const instructionFilePairSelect = document.getElementById('instruction-file-pair-select');
        const instructionBaseModelSelect = document.getElementById('instruction-base-model-select');
        const instructionModelNameInput = document.getElementById('instruction-model-name-input');
        const maxExamplesSelect = document.getElementById('max-examples-select');
        const startBtn = document.getElementById('start-instruction-fine-tuning-btn');
        
        const pairValue = instructionFilePairSelect.value;
        const baseModel = instructionBaseModelSelect.value;
        const modelName = instructionModelNameInput ? instructionModelNameInput.value.trim() : '';
        const maxExamples = parseInt(maxExamplesSelect.value) || 50;
        
        if (!pairValue || !baseModel) {
            alert('Please select file pair and model');
            return;
        }
        
        if (!modelName) {
            alert('Please enter a model name - this is required for the model to appear in translation dropdown');
            return;
        }
        
        const [sourceFileId, targetFileId] = pairValue.split(',');
        
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Starting job...';
        }
        
        // Start the fine-tuning job with the stored preview progress ID
        fetch(`/project/${projectId}/fine-tuning/instruction/jobs-with-progress`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                source_file_id: parseInt(sourceFileId),
                target_file_id: parseInt(targetFileId),
                base_model: baseModel,
                display_name: modelName,
                max_examples: maxExamples,
                preview_progress_id: lastPreviewProgressId  // Pass the stored progress ID
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.progress_id) {
                // Start polling for job creation progress
                pollJobCreationProgress(data.progress_id, startBtn);
            } else {
                if (startBtn) {
                    startBtn.disabled = false;
                    startBtn.innerHTML = '<i class="fas fa-rocket mr-2"></i>Start Fine-Tuning';
                }
                if (data.error) {
                    alert('Error starting fine-tuning job: ' + data.error);
                }
            }
        })
        .catch(error => {
            console.error('Error starting fine-tuning job:', error);
            if (startBtn) {
                startBtn.disabled = false;
                startBtn.innerHTML = '<i class="fas fa-rocket mr-2"></i>Start Fine-Tuning';
            }
            alert('Error starting fine-tuning job. Please try again.');
        });
    }

    // Add the pollJobCreationProgress function
    function pollJobCreationProgress(progressId, button) {
        function checkProgress() {
            fetch(`/project/${projectId}/fine-tuning/instruction/jobs-with-progress/${progressId}`)
                .then(response => response.json())
                .then(data => {
                    console.log('Job creation progress:', data);
                    
                    if (data.status === 'processing') {
                        if (button) {
                            button.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>${data.message}`;
                        }
                        setTimeout(checkProgress, 1000);
                    } else if (data.status === 'completed') {
                        const result = data.result || {};
                        if (result.warning) {
                            alert(result.message + '\n\n' + (result.error_details || ''));
                        } else if (!result.success) {
                            alert('Error: ' + (result.error || 'Unknown error occurred'));
                        }
                        
                        if (button) {
                            button.disabled = false;
                            button.innerHTML = '<i class="fas fa-rocket mr-2"></i>Start Fine-Tuning';
                        }
                        
                        // Refresh the jobs list
                        loadFineTuningJobs();
                    } else if (data.status === 'error') {
                        alert('Error: ' + data.message);
                        if (button) {
                            button.disabled = false;
                            button.innerHTML = '<i class="fas fa-rocket mr-2"></i>Start Fine-Tuning';
                        }
                    } else {
                        setTimeout(checkProgress, 1000);
                    }
                })
                .catch(error => {
                    console.error('Error checking job creation progress:', error);
                    if (button) {
                        button.disabled = false;
                        button.innerHTML = '<i class="fas fa-rocket mr-2"></i>Start Fine-Tuning';
                    }
                });
        }
        
        checkProgress();
    }


    
    // Character counting for inline pair instructions
    document.addEventListener('input', function(e) {
        if (e.target.matches('textarea[data-file1-id]')) {
            const textarea = e.target;
            const charCounter = textarea.parentElement.querySelector('.char-counter');
            if (charCounter) {
                const length = textarea.value.length;
                charCounter.textContent = `${length} / 4,000`;
                
                if (length > 4000) {
                    charCounter.style.color = '#dc2626';
                    textarea.style.borderColor = '#dc2626';
                } else {
                    charCounter.style.color = '#2563eb';
                    textarea.style.borderColor = '#93c5fd';
                }
            }
        }
    });

    // Add this near the top of the file, with other DOM element selections
    const toggleSectionBtns = document.querySelectorAll('.toggle-section-btn');

    // Add this with other event listeners
    toggleSectionBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const targetSection = document.getElementById(targetId);
            const icon = btn.querySelector('i');
            
            if (targetSection.classList.contains('hidden')) {
                targetSection.classList.remove('hidden');
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
            } else {
                targetSection.classList.add('hidden');
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
            }
        });
    });

    // Sidebar: Models List
    const modelsList = document.getElementById('models-list');

    function renderModelsSidebar(jobs) {
        if (!modelsList) return;
        modelsList.innerHTML = '';
        if (!jobs || jobs.length === 0) {
            modelsList.innerHTML = '<div class="text-neutral-500 text-sm">No models yet</div>';
            return;
        }
        // Show base models first (from selects)
        if (baseModelSelect && baseModelSelect.options.length > 0) {
            const baseModels = Array.from(baseModelSelect.options)
                .filter(opt => opt.value && !opt.parentElement.label)
                .map(opt => ({ name: opt.textContent, value: opt.value }));
            baseModels.forEach(model => {
                const div = document.createElement('div');
                div.className = 'flex items-center justify-between p-2 bg-neutral-50 border border-neutral-200 rounded';
                div.innerHTML = `<span class="text-neutral-800 font-medium">${model.name}</span><span class="text-xs text-neutral-400 ml-2">Base</span>`;
                modelsList.appendChild(div);
            });
        }
        // Fine-tuned models from jobs
        jobs.filter(j => j.status === 'completed' && j.model_name).forEach(job => {
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between p-2 bg-white border border-neutral-200 rounded';
            div.innerHTML = `
                <span class="text-neutral-800 font-medium truncate">${job.display_name || job.model_name}</span>
                <button class="toggle-visibility-btn ml-2 text-neutral-500 hover:text-neutral-700" data-job-id="${job.id}" title="${job.hidden ? 'Show in selection dropdown' : 'Hide from selection dropdown'}">
                    <i class="fas ${job.hidden ? 'fa-eye-slash' : 'fa-eye'}"></i>
                </button>
            `;
            if (job.hidden) {
                const badge = document.createElement('span');
                badge.className = 'ml-2 px-2 py-1 text-xs bg-neutral-200 text-neutral-600 rounded';
                badge.textContent = 'Hidden';
                div.insertBefore(badge, div.querySelector('button'));
            }
            modelsList.appendChild(div);
        });
        // Add event listeners for hide/unhide
        modelsList.querySelectorAll('.toggle-visibility-btn').forEach(btn => {
            btn.addEventListener('click', async e => {
                e.preventDefault();
                const jobId = btn.getAttribute('data-job-id');
                const icon = btn.querySelector('i');
                try {
                    const response = await fetch(`/project/${projectId}/fine-tuning/jobs/${jobId}/toggle-visibility`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                    });
                    const data = await response.json();
                    if (data.success) {
                        loadFineTuningJobs(); // Refresh sidebar and jobs
                        loadFineTuningModels();
                    } else {
                        alert(data.error || 'Failed to toggle model visibility');
                    }
                } catch (error) {
                    alert('Failed to toggle model visibility');
                }
            });
        });
    }
    
    // Toggle training files section
    window.toggleTrainingFiles = function() {
        const filesList = document.getElementById('training-files-list');
        const chevron = document.getElementById('training-files-chevron');
        
        if (filesList.classList.contains('hidden')) {
            filesList.classList.remove('hidden');
            chevron.classList.add('rotate-180');
        } else {
            filesList.classList.add('hidden');
            chevron.classList.remove('rotate-180');
        }
    };

    // Simple drag and drop file upload
    function setupDragAndDrop() {
        // Prevent duplicate setup
        if (window.dragDropSetup) {
            console.log('Drag and drop already set up, skipping...');
            return;
        }
        window.dragDropSetup = true;
        
        // Get drag and drop zones
        const dragDropZone = document.getElementById('drag-drop-zone');
        const dragDropZoneEmpty = document.getElementById('drag-drop-zone-empty');
        const fileInput = document.getElementById('file-input');
        const fileInputEmpty = document.getElementById('file-input-empty');
        
        console.log('Setting up drag and drop zones...');
        
        // Setup for main drag zone (when files exist)
        if (dragDropZone && fileInput) {
            console.log('Setting up main drag zone');
            setupDragAndDropZone(dragDropZone, fileInput, 'upload-progress', 'progress-bar');
        }
        
        // Setup for empty state drag zone
        if (dragDropZoneEmpty && fileInputEmpty) {
            console.log('Setting up empty state drag zone');
            setupDragAndDropZone(dragDropZoneEmpty, fileInputEmpty, 'upload-progress-empty', 'progress-bar-empty');
        }
    }
    
    function setupDragAndDropZone(zone, input, progressId, progressBarId) {
        // Click to upload
        zone.addEventListener('click', () => {
            input.click();
        });
        
        // File input change
        input.addEventListener('change', (e) => {
            console.log('File input change - files:', e.target.files);
            if (e.target.files.length > 0) {
                const files = Array.from(e.target.files);
                // Clear the input immediately to prevent duplicate events
                e.target.value = '';
                handleFileUpload(files, progressId, progressBarId);
            }
        });
        
        // Drag and drop events
        zone.addEventListener('dragover', (e) => {
            e.preventDefault();
            zone.classList.add('border-blue-500', 'bg-blue-100');
        });
        
        zone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            zone.classList.remove('border-blue-500', 'bg-blue-100');
        });
        
        zone.addEventListener('drop', (e) => {
            e.preventDefault();
            zone.classList.remove('border-blue-500', 'bg-blue-100');
            
            const files = Array.from(e.dataTransfer.files);
            console.log('Drop event - files:', files);
            if (files.length > 0) {
                handleFileUpload(files, progressId, progressBarId);
            }
        });
    }
    
    function handleFileUpload(files, progressId, progressBarId) {
        console.log('handleFileUpload called with files:', files);
        const progressElement = document.getElementById(progressId);
        const progressBar = document.getElementById(progressBarId);
        
        // Check for non-.txt files and redirect to USFM importer
        const nonTxtFiles = files.filter(file => {
            const ext = '.' + file.name.toLowerCase().split('.').pop();
            console.log(`File: ${file.name}, Extension: ${ext}, Is non-txt: ${['.usfm', '.sfm'].includes(ext)}`);
            return ['.usfm', '.sfm'].includes(ext);
        });
        
        console.log('Non-txt files found:', nonTxtFiles);
        
        if (nonTxtFiles.length > 0) {
            console.log('Redirecting to USFM importer...');
            // Redirect to USFM importer for non-.txt files
            window.location.href = `/project/${projectId}/usfm-import`;
            return;
        }
        
        // Show progress for .txt files
        if (progressElement) progressElement.classList.remove('hidden');
        
        // Filter for .txt files only
        const txtFiles = files.filter(file => {
            const ext = '.' + file.name.toLowerCase().split('.').pop();
            return ext === '.txt';
        });
        
        if (txtFiles.length === 0) {
            alert('Please select .txt files or use the USFM importer for .usfm/.sfm files');
            if (progressElement) progressElement.classList.add('hidden');
            return;
        }
        
        if (txtFiles.length !== files.length) {
            const skippedCount = files.length - txtFiles.length;
            alert(`${skippedCount} non-.txt file(s) will be handled by the USFM importer`);
        }
        
        // Upload .txt files one by one
        uploadFilesSequentially(txtFiles, 0, progressBar, progressElement);
    }
    
    function uploadFilesSequentially(files, index, progressBar, progressElement) {
        if (index >= files.length) {
            // All files uploaded
            setTimeout(() => {
                if (progressElement) progressElement.classList.add('hidden');
                location.reload();
            }, 1000);
            return;
        }
        
        const file = files[index];
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_method', 'file');
        
        // Update progress bar
        const progress = ((index + 1) / files.length) * 100;
        if (progressBar) progressBar.style.width = `${progress}%`;
        
        fetch(`/project/${projectId}/upload`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                if (data.is_usfm && data.redirect_url) {
                    // USFM detected - redirect to USFM import page
                    window.location.href = data.redirect_url;
                    return;
                }
                // Continue with next file
                uploadFilesSequentially(files, index + 1, progressBar, progressElement);
            } else {
                alert(`Error uploading ${file.name}: ${data.error}`);
                if (progressElement) progressElement.classList.add('hidden');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            alert(`Error uploading ${file.name}`);
            if (progressElement) progressElement.classList.add('hidden');
        });
    }

    function styleDropdowns() {
        // Just ensure proper styling is applied - everything else is handled by CSS
        console.log('Dropdowns styled with modern CSS');
    }

    // Simple text name editing
    window.editTextName = function(element, textId) {
        const newName = prompt('Enter new name:', element.textContent);
        if (newName && newName.trim() !== element.textContent) {
            fetch(`/project/${projectId}/text/${textId}/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    element.textContent = newName.trim();
                } else {
                    alert('Failed to rename: ' + (data.error || 'Unknown error'));
                }
            })
            .catch(() => alert('Failed to rename text'));
        }
    };
    
    // Project Flags Manager
    window.ProjectFlagsManager = class {
        constructor() {
            this.projectId = parseInt(window.location.pathname.split('/')[2]);
            this.currentFilter = 'all';
            this.currentSort = 'newest';
            this.currentPage = 1;
            this.totalPages = 1;
            this.totalFlags = 0;
            this.flagsPerPage = 5; // Lower for testing pagination
            this.isLoading = false;
            
            this.initializeElements();
            this.setupEventListeners();
            this.loadFlags();
        }
        
        initializeElements() {
            this.container = document.getElementById('project-flags-container');
            this.loadingEl = document.getElementById('flags-loading');
            this.emptyStateEl = document.getElementById('flags-empty-state');
            
            // Filter buttons  
            this.filterButtons = {
                all: document.getElementById('filter-all-flags'),
                pending: document.getElementById('filter-pending'),
                closed: document.getElementById('filter-closed-flags')
            };
            
            this.flagsCountDisplay = document.getElementById('flags-count-display');
            
            // Pagination elements
            this.paginationEl = document.getElementById('flags-pagination');
            this.paginationInfo = document.getElementById('pagination-info');
            this.prevPageBtn = document.getElementById('prev-page-btn');
            this.nextPageBtn = document.getElementById('next-page-btn');
            this.pageNumbersEl = document.getElementById('page-numbers');
        }
        
        setupEventListeners() {
            // Filter buttons
            Object.entries(this.filterButtons).forEach(([filter, button]) => {
                if (button) {
                    button.addEventListener('click', () => this.setFilter(filter));
                }
            });
            
            // Pagination buttons
            if (this.prevPageBtn) {
                this.prevPageBtn.addEventListener('click', () => this.goToPage(this.currentPage - 1));
            }
            if (this.nextPageBtn) {
                this.nextPageBtn.addEventListener('click', () => this.goToPage(this.currentPage + 1));
            }
        }
        
        setFilter(filter) {
            this.currentFilter = filter;
            this.currentPage = 1;
            
            // Update button states
            Object.entries(this.filterButtons).forEach(([key, button]) => {
                if (button) {
                    if (key === filter) {
                        button.classList.add('active', 'bg-blue-600', 'text-white', 'hover:bg-blue-700');
                        button.classList.remove('bg-white', 'text-neutral-700', 'hover:bg-neutral-50', 'border', 'border-neutral-200');
                    } else {
                        button.classList.remove('active', 'bg-blue-600', 'text-white', 'hover:bg-blue-700');
                        button.classList.add('bg-white', 'text-neutral-700', 'hover:bg-neutral-50', 'border', 'border-neutral-200');
                    }
                }
            });
            
            this.loadFlags();
        }
        
        async loadFlags() {
            if (this.isLoading) return;
            
            this.isLoading = true;
            this.showLoading();
            
            try {
                // Map our filters to backend status filters
                let backendStatus = 'all';
                if (this.currentFilter === 'closed') {
                    backendStatus = 'closed';
                } else if (this.currentFilter !== 'all') {
                    backendStatus = 'open'; // Load all open flags for user resolution filtering
                }
                
                const params = new URLSearchParams({
                    status: backendStatus,
                    sort: this.currentSort,
                    page: this.currentPage,
                    per_page: this.flagsPerPage
                });
                
                const response = await fetch(`/project/${this.projectId}/flags/all?${params}`);
                if (!response.ok) throw new Error('Failed to load flags');
                
                const data = await response.json();
                
                // For client-side filtering, we need to handle pagination differently
                if (this.currentFilter === 'all' || this.currentFilter === 'closed') {
                    // Backend filtering - use server pagination
                    this.totalFlags = data.pagination.total;
                    this.totalPages = data.pagination.pages;
                    this.renderFlags(data.flags);
                    this.updatePagination();
                } else {
                    // Client-side filtering - need to fetch more data
                    let filteredFlags = this.filterFlagsByResolution(data.flags);
                    this.renderFlags(filteredFlags);
                    // For client-side filtering, show total flags but disable pagination controls
                    this.totalFlags = filteredFlags.length;
                    this.totalPages = 1;
                    this.hidePagination();
                }
                
                this.updateFlagsCount();
                
            } catch (error) {
                console.error('Error loading flags:', error);
                this.showError();
            } finally {
                this.isLoading = false;
                this.hideLoading();
            }
        }
        
        filterFlagsByResolution(flags) {
            if (this.currentFilter === 'all' || this.currentFilter === 'closed') {
                return flags; // These are handled by backend filtering
            }
            
            return flags.filter(flag => {
                const userResolution = flag.user_resolution?.status;
                
                switch (this.currentFilter) {
                    case 'pending':
                        return !userResolution; // No resolution yet
                    default:
                        return true;
                }
            });
        }
        
        showLoading() {
            if (this.loadingEl) this.loadingEl.classList.remove('hidden');
            if (this.emptyStateEl) this.emptyStateEl.classList.add('hidden');
        }
        
        hideLoading() {
            if (this.loadingEl) this.loadingEl.classList.add('hidden');
        }
        
        showError() {
            if (this.container) {
                this.container.innerHTML = `
                    <div class="text-center py-12">
                        <i class="fas fa-exclamation-triangle text-2xl text-red-400 mb-4"></i>
                        <p class="text-neutral-500">Failed to load flags</p>
                        <button onclick="window.projectFlagsManager.loadFlags()" 
                                class="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                            Try Again
                        </button>
                    </div>
                `;
            }
        }
        
        updateFlagsCount() {
            if (this.flagsCountDisplay) {
                const displayCount = this.currentFilter === 'all' || this.currentFilter === 'closed' 
                    ? this.totalFlags 
                    : this.container?.children?.length || 0;
                const filterName = this.getFilterDisplayName(this.currentFilter, displayCount);
                this.flagsCountDisplay.textContent = `${displayCount} ${filterName}`;
            }
        }
        
        goToPage(page) {
            if (page < 1 || page > this.totalPages || page === this.currentPage) return;
            this.currentPage = page;
            this.loadFlags();
        }
        
        updatePagination() {
            if (!this.paginationEl) {
                console.log('Pagination element not found');
                return;
            }
            
            console.log(`Pagination check: ${this.totalFlags} flags, ${this.totalPages} pages`);
            
            if (this.totalPages <= 1) {
                console.log('Hiding pagination - only 1 page');
                this.hidePagination();
                return;
            }
            
            console.log('Showing pagination');
            this.paginationEl.classList.remove('hidden');
            
            // Update pagination info
            const startItem = (this.currentPage - 1) * this.flagsPerPage + 1;
            const endItem = Math.min(this.currentPage * this.flagsPerPage, this.totalFlags);
            if (this.paginationInfo) {
                this.paginationInfo.textContent = `Showing ${startItem}-${endItem} of ${this.totalFlags} flags`;
            }
            
            // Update navigation buttons
            if (this.prevPageBtn) {
                this.prevPageBtn.disabled = this.currentPage <= 1;
            }
            if (this.nextPageBtn) {
                this.nextPageBtn.disabled = this.currentPage >= this.totalPages;
            }
            
            // Update page numbers
            this.renderPageNumbers();
        }
        
        hidePagination() {
            if (this.paginationEl) {
                this.paginationEl.classList.add('hidden');
            }
        }
        
        renderPageNumbers() {
            if (!this.pageNumbersEl) return;
            
            this.pageNumbersEl.innerHTML = '';
            
            // Show max 5 page numbers with current page in center when possible
            let startPage = Math.max(1, this.currentPage - 2);
            let endPage = Math.min(this.totalPages, startPage + 4);
            
            // Adjust start if we're near the end
            if (endPage - startPage < 4) {
                startPage = Math.max(1, endPage - 4);
            }
            
            for (let i = startPage; i <= endPage; i++) {
                const pageBtn = document.createElement('button');
                pageBtn.textContent = i;
                pageBtn.className = i === this.currentPage 
                    ? 'px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg'
                    : 'px-3 py-2 text-sm font-medium text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50 rounded-lg';
                
                if (i !== this.currentPage) {
                    pageBtn.addEventListener('click', () => this.goToPage(i));
                }
                
                this.pageNumbersEl.appendChild(pageBtn);
            }
        }
        
        getFilterDisplayName(filter, count) {
            switch (filter) {
                case 'all': return count === 1 ? 'flag' : 'flags';
                case 'pending': return count === 1 ? 'flag needs review' : 'flags need review';
                case 'closed': return count === 1 ? 'closed flag' : 'closed flags';
                default: return count === 1 ? 'flag' : 'flags';
            }
        }
        
        renderFlags(flags) {
            if (!this.container) return;
            
            if (flags.length === 0) {
                this.container.innerHTML = '';
                if (this.emptyStateEl) this.emptyStateEl.classList.remove('hidden');
                return;
            }
            
            if (this.emptyStateEl) this.emptyStateEl.classList.add('hidden');
            
            const flagsHTML = flags.map(flag => this.renderFlagCard(flag)).join('');
            this.container.innerHTML = flagsHTML;
        }
        
        renderFlagCard(flag) {
            const timeAgo = this.formatTimeAgo(flag.created_at);
            const verseRefsText = flag.verse_references.join(', ') || 'Unknown verses';
            
            // Primary status based on user resolution, fallback to flag status
            let statusBadge = '';
            let statusClass = '';
            let statusText = '';
            
            if (flag.status === 'closed') {
                // Closed flags always show as closed regardless of user resolution
                statusClass = 'bg-neutral-100 text-neutral-600';
                statusText = 'Closed';
            } else if (flag.user_resolution) {
                // Open flag with user resolution
                switch (flag.user_resolution.status) {
                    case 'resolved':
                        statusClass = 'bg-green-100 text-green-700';
                        statusText = 'I Resolved';
                        break;
                    case 'unresolved':
                        statusClass = 'bg-orange-100 text-orange-700';
                        statusText = 'I Marked Unresolved';
                        break;
                    default:
                        // Handle any legacy 'not_relevant' as resolved
                        statusClass = 'bg-green-100 text-green-700';
                        statusText = 'I Resolved';
                        break;
                }
            } else {
                // Open flag without user resolution yet
                statusClass = 'bg-blue-100 text-blue-700';
                statusText = 'Need My Review';
            }
            
            statusBadge = `<span class="px-3 py-1 rounded-full text-sm font-medium ${statusClass}">${statusText}</span>`;
            
            return `
                <div class="border border-neutral-200 rounded-xl p-4 sm:p-6 mb-4 bg-white hover:shadow-md transition-shadow cursor-pointer" 
                     onclick="this.querySelector('a').click()">
                    <div class="flex items-start justify-between mb-3">
                        <div class="flex items-center gap-3">
                            ${statusBadge}
                        </div>
                        <span class="text-sm text-neutral-500">${timeAgo}</span>
                    </div>
                    
                    <div class="mb-3">
                        <h3 class="font-semibold text-neutral-900 mb-1">
                            ${verseRefsText}
                        </h3>
                        <p class="text-neutral-600 text-sm line-clamp-2">
                            ${flag.first_comment || 'No content'}
                        </p>
                    </div>
                    
                    <div class="flex items-center justify-between text-sm text-neutral-500">
                        <div class="flex items-center gap-4">
                            <span>
                                <i class="fas fa-user mr-1"></i>
                                ${flag.created_by.name}
                            </span>
                            <span>
                                <i class="fas fa-comments mr-1"></i>
                                ${flag.comment_count} comment${flag.comment_count !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <a href="/project/${this.projectId}/translate?flag=${flag.id}" 
                           class="text-blue-600 hover:text-blue-800 font-medium">
                            View Details →
                        </a>
                    </div>
                </div>
            `;
        }
        
        formatTimeAgo(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diff = now - date;
            
            const minutes = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);
            
            if (minutes < 1) return 'Just now';
            if (minutes < 60) return `${minutes}m ago`;
            if (hours < 24) return `${hours}h ago`;
            if (days < 7) return `${days}d ago`;
            return date.toLocaleDateString();
        }
    };
}); 