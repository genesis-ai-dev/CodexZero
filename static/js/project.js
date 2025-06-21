document.addEventListener('DOMContentLoaded', function() {
    console.log('Project.js loaded');
    
    // Back translation elements
    const startBtn = document.getElementById('start-back-translation-btn');
    const btnText = document.getElementById('btn-text');
    const jobStatus = document.getElementById('job-status');
    const jobProgress = document.getElementById('job-progress');
    const progressBar = document.getElementById('progress-bar');
    const backTranslationResults = document.getElementById('back-translation-results');
    const downloadResultsBtn = document.getElementById('download-results-btn');
    const redoBackTranslationBtn = document.getElementById('redo-back-translation-btn');
    const lineCountSelect = document.getElementById('line-count');
    
    // File selection modal elements
    const selectFileBtn = document.getElementById('select-file-btn');
    const fileModal = document.getElementById('file-selection-modal');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const cancelModalBtn = document.getElementById('cancel-modal-btn');
    const confirmFileBtn = document.getElementById('confirm-file-btn');
    const selectedFileText = document.getElementById('selected-file-text');
    
    // File management modal elements
    const deleteFileModal = document.getElementById('delete-file-modal');
    const closeDeleteModalBtn = document.getElementById('close-delete-modal-btn');
    const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    const downloadOriginalBtn = document.getElementById('download-original-btn');
    const downloadBackTranslationBtn = document.getElementById('download-back-translation-btn');
    const backTranslationDownloadSection = document.getElementById('back-translation-download-section');
    
    const uploadBackTranslationBtn = document.getElementById('upload-back-translation-btn');
    const uploadBackTranslationModal = document.getElementById('upload-back-translation-modal');
    const closeUploadModalBtn = document.getElementById('close-upload-modal-btn');
    const cancelUploadBtn = document.getElementById('cancel-upload-btn');
    const confirmUploadBtn = document.getElementById('confirm-upload-btn');
    
    // Target text upload elements
    const uploadTargetTextBtn = document.getElementById('upload-target-text-btn');
    const uploadTargetTextModal = document.getElementById('upload-target-text-modal');
    const closeTargetUploadModalBtn = document.getElementById('close-target-upload-modal-btn');
    const cancelTargetUploadBtn = document.getElementById('cancel-target-upload-btn');
    const confirmTargetUploadBtn = document.getElementById('confirm-target-upload-btn');
    
    // File upload modal elements
    const openUploadModalBtn = document.getElementById('open-upload-modal-btn');
    const openUploadModalBtnEmpty = document.getElementById('open-upload-modal-btn-empty');
    const fileUploadModal = document.getElementById('file-upload-modal');
    const closeFileUploadModalBtn = document.getElementById('close-file-upload-modal-btn');
    const cancelFileUploadBtn = document.getElementById('cancel-file-upload-btn');
    const confirmFileUploadBtn = document.getElementById('confirm-file-upload-btn');
    
    let currentFileToDelete = null;
    let originalDownloaded = false;
    let backTranslationDownloaded = false;
    
    let selectedFileId = null;
    
    console.log('Elements found:', {
        startBtn: !!startBtn,
        btnText: !!btnText,
        jobStatus: !!jobStatus,
        jobProgress: !!jobProgress,
        lineCountSelect: !!lineCountSelect,
        selectFileBtn: !!selectFileBtn,
        fileModal: !!fileModal
    });
    
    const projectId = window.location.pathname.split('/')[2];
    console.log('Project ID:', projectId);
    
    let backTranslationStatusInterval = null;
    
    // Check for existing jobs on page load
    checkBackTranslationStatus();
    
    // Initialize file selection
    initializeFileSelection();
    
    // Back translation event listeners
    if (startBtn) {
        startBtn.addEventListener('click', function(e) {
            console.log('Start button clicked');
            e.preventDefault();
            startBackTranslation();
        });
    } else {
        console.error('Start button not found!');
    }
    
    // File selection modal event listeners
    if (selectFileBtn) {
        selectFileBtn.addEventListener('click', function(e) {
            e.preventDefault();
            openFileModal();
        });
    }
    
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeFileModal);
    }
    
    if (cancelModalBtn) {
        cancelModalBtn.addEventListener('click', closeFileModal);
    }
    
    if (confirmFileBtn) {
        confirmFileBtn.addEventListener('click', confirmFileSelection);
    }
    
    // Close modal when clicking outside
    if (fileModal) {
        fileModal.addEventListener('click', function(e) {
            if (e.target === fileModal) {
                closeFileModal();
            }
        });
    }
    
    if (downloadResultsBtn) {
        downloadResultsBtn.addEventListener('click', function() {
            console.log('Download results clicked');
            const jobId = downloadResultsBtn.getAttribute('data-job-id');
            if (jobId) {
                // Trigger download by navigating to download URL
                window.location.href = `/project/${projectId}/back-translation/${jobId}/download`;
            }
        });
    }
    
    if (redoBackTranslationBtn) {
        redoBackTranslationBtn.addEventListener('click', function() {
            console.log('Redo back translation clicked');
            redoBackTranslation();
        });
    }
    
    // File deletion event listeners
    document.addEventListener('click', function(e) {
        if (e.target.closest('.delete-file-btn')) {
            const btn = e.target.closest('.delete-file-btn');
            const fileId = btn.getAttribute('data-file-id');
            const filename = btn.getAttribute('data-filename');
            openDeleteFileModal(fileId, filename);
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
    
    if (downloadBackTranslationBtn) {
        downloadBackTranslationBtn.addEventListener('click', function() {
            backTranslationDownloaded = true;
            updateDeleteButtonState();
        });
    }
    
    // Upload back translation event listeners
    if (uploadBackTranslationBtn) {
        uploadBackTranslationBtn.addEventListener('click', openUploadBackTranslationModal);
    }
    
    if (closeUploadModalBtn) {
        closeUploadModalBtn.addEventListener('click', closeUploadBackTranslationModal);
    }
    
    if (cancelUploadBtn) {
        cancelUploadBtn.addEventListener('click', closeUploadBackTranslationModal);
    }
    
    if (confirmUploadBtn) {
        confirmUploadBtn.addEventListener('click', uploadBackTranslationFile);
    }
    
    // Close upload modal when clicking outside
    if (uploadBackTranslationModal) {
        uploadBackTranslationModal.addEventListener('click', function(e) {
            if (e.target === uploadBackTranslationModal) {
                closeUploadBackTranslationModal();
            }
        });
    }
    
    // Target text upload event listeners
    if (uploadTargetTextBtn) {
        uploadTargetTextBtn.addEventListener('click', openUploadTargetTextModal);
    }
    
    if (closeTargetUploadModalBtn) {
        closeTargetUploadModalBtn.addEventListener('click', closeUploadTargetTextModal);
    }
    
    if (cancelTargetUploadBtn) {
        cancelTargetUploadBtn.addEventListener('click', closeUploadTargetTextModal);
    }
    
    if (confirmTargetUploadBtn) {
        confirmTargetUploadBtn.addEventListener('click', uploadTargetTextFile);
    }
    
    // Close target upload modal when clicking outside
    if (uploadTargetTextModal) {
        uploadTargetTextModal.addEventListener('click', function(e) {
            if (e.target === uploadTargetTextModal) {
                closeUploadTargetTextModal();
            }
        });
    }
    
    // File upload modal event listeners
    if (openUploadModalBtn) {
        openUploadModalBtn.addEventListener('click', openFileUploadModal);
    }
    
    if (openUploadModalBtnEmpty) {
        openUploadModalBtnEmpty.addEventListener('click', openFileUploadModal);
    }
    
    if (closeFileUploadModalBtn) {
        closeFileUploadModalBtn.addEventListener('click', closeFileUploadModal);
    }
    
    if (cancelFileUploadBtn) {
        cancelFileUploadBtn.addEventListener('click', closeFileUploadModal);
    }
    
    if (confirmFileUploadBtn) {
        confirmFileUploadBtn.addEventListener('click', uploadFile);
    }
    
    // Close file upload modal when clicking outside
    if (fileUploadModal) {
        fileUploadModal.addEventListener('click', function(e) {
            if (e.target === fileUploadModal) {
                closeFileUploadModal();
            }
        });
    }
    
    // Handle upload method toggle for file upload modal
    document.addEventListener('change', function(e) {
        if (e.target.name === 'upload_method' && e.target.closest('#file-upload-modal')) {
            const fileSection = document.getElementById('file-upload-section-modal');
            const textSection = document.getElementById('text-paste-section-modal');
            
            if (e.target.value === 'file') {
                fileSection.classList.remove('hidden');
                textSection.classList.add('hidden');
            } else {
                fileSection.classList.add('hidden');
                textSection.classList.remove('hidden');
            }
        }
        
        // Handle file type toggle for pairing section
        if (e.target.name === 'file_type' && e.target.closest('#file-upload-modal')) {
            const pairingSection = document.getElementById('pairing-section-modal');
            
            if (e.target.value === 'back_translation') {
                pairingSection.classList.remove('hidden');
            } else {
                pairingSection.classList.add('hidden');
            }
        }
    });
    
    // Character counter for file upload modal
    const textContentUpload = document.getElementById('text-content-upload');
    const uploadCharCount = document.getElementById('upload-char-count');
    
    if (textContentUpload && uploadCharCount) {
        textContentUpload.addEventListener('input', function() {
            const length = this.value.length;
            uploadCharCount.textContent = `${length} / 16,000`;
            
            if (length > 16000) {
                uploadCharCount.classList.add('text-red-600');
                uploadCharCount.classList.remove('text-neutral-500');
            } else {
                uploadCharCount.classList.remove('text-red-600');
                uploadCharCount.classList.add('text-neutral-500');
            }
        });
    }
    
    function startBackTranslation() {
        console.log('Starting back translation...');
        
        // Get selected line count
        const lineCount = lineCountSelect ? lineCountSelect.value : 'all';
        console.log('Selected line count:', lineCount);
        
        // Use the selected file ID from modal
        console.log('Selected file ID:', selectedFileId);
        
        // Check if button is disabled (no lines available)
        if (startBtn.classList.contains('cursor-not-allowed')) {
            alert('No text files available for back translation. Please upload text files first.');
            return;
        }
        
        // Disable button and show loading state
        startBtn.disabled = true;
        if (btnText) btnText.textContent = 'Starting...';
        startBtn.classList.add('opacity-50');
        
        const requestBody = { line_count: lineCount };
        if (selectedFileId) {
            requestBody.file_id = selectedFileId;
        }
        
        fetch(`/project/${projectId}/start-back-translation`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        })
        .then(response => {
            console.log('Response status:', response.status);
            return response.json();
        })
        .then(data => {
            console.log('Response data:', data);
            if (data.success) {
                // Show job status and start monitoring
                if (jobStatus) jobStatus.classList.remove('hidden');
                const lineText = lineCount === 'all' ? 'all lines' : `first ${lineCount} lines`;
                if (jobProgress) jobProgress.textContent = `Processing ${lineText} (${data.total_lines} lines total). May take up to 24 hours to save costs.`;
                
                // Start status checking
                startBackTranslationStatusChecking();
            } else {
                // Show error
                console.error('Error from server:', data.error);
                alert(data.error || 'Failed to start back translation');
                resetButton();
            }
        })
        .catch(error => {
            console.error('Fetch error:', error);
            alert('Failed to start back translation: ' + error.message);
            resetButton();
        });
    }
    
    function checkBackTranslationStatus() {
        fetch(`/project/${projectId}/back-translation-status`)
        .then(response => response.json())
        .then(data => {
            if (data.jobs && data.jobs.length > 0) {
                const latestJob = data.jobs[0];
                updateUIForJob(latestJob);
                
                // If job is in progress, start monitoring
                if (latestJob.status === 'in_progress') {
                    startBackTranslationStatusChecking();
                }
            }
        })
        .catch(error => {
            console.error('Error checking status:', error);
        });
    }
    
    function startBackTranslationStatusChecking() {
        if (backTranslationStatusInterval) {
            clearInterval(backTranslationStatusInterval);
        }
        
        backTranslationStatusInterval = setInterval(() => {
            checkBackTranslationStatus();
        }, 5000); // Check every 5 seconds
    }
    
    function stopBackTranslationStatusChecking() {
        if (backTranslationStatusInterval) {
            clearInterval(backTranslationStatusInterval);
            backTranslationStatusInterval = null;
        }
    }
    
    function updateUIForJob(job) {
        switch (job.status) {
            case 'in_progress':
                startBtn.disabled = true;
                if (btnText) btnText.textContent = 'Processing...';
                startBtn.classList.add('opacity-50');
                if (jobStatus) jobStatus.classList.remove('hidden');
                if (jobProgress) jobProgress.textContent = `Processing ${job.total_lines} lines from ${job.source_filename}. May take up to 24 hours to save costs.`;
                if (backTranslationResults) backTranslationResults.classList.add('hidden');
                break;
                
            case 'completed':
                resetButton();
                if (jobStatus) jobStatus.classList.add('hidden');
                if (backTranslationResults) backTranslationResults.classList.remove('hidden');
                stopBackTranslationStatusChecking();
                
                // Store job ID for downloading results and update button text
                if (downloadResultsBtn) {
                    downloadResultsBtn.setAttribute('data-job-id', job.id);
                    downloadResultsBtn.textContent = `Download results for ${job.source_filename}`;
                }
                break;
                
            case 'failed':
            case 'expired':
                resetButton();
                if (jobStatus) jobStatus.classList.add('hidden');
                if (jobProgress) jobProgress.textContent = `Failed: ${job.error || job.status}`;
                if (backTranslationResults) backTranslationResults.classList.add('hidden');
                stopBackTranslationStatusChecking();
                break;
                
            default:
                resetButton();
                if (jobStatus) jobStatus.classList.add('hidden');
                if (jobProgress) jobProgress.textContent = '';
                if (backTranslationResults) backTranslationResults.classList.add('hidden');
        }
    }
    
    function resetButton() {
        startBtn.disabled = false;
        if (btnText) btnText.textContent = 'Generate Back Translations';
        startBtn.classList.remove('opacity-50');
    }
    
    function initializeFileSelection() {
        // Set the first file as selected by default
        const firstFileRadio = document.querySelector('input[name="selected-file"]');
        if (firstFileRadio) {
            selectedFileId = firstFileRadio.value;
            const lineCount = parseInt(firstFileRadio.getAttribute('data-line-count'));
            
            // Update line count selector for the initially selected file
            updateLineCountSelector(lineCount);
            
            console.log('Initial file selected:', selectedFileId, 'Lines:', lineCount);
        }
    }
    
    function updateLineCountSelector(lineCount) {
        if (!lineCountSelect || lineCount <= 0) return;
        
        // Clear existing options
        lineCountSelect.innerHTML = '';
        
        // Add "All" option
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = `All ${lineCount}`;
        lineCountSelect.appendChild(allOption);
        
        // Add incremental options based on line count
        const increments = [10, 25, 50, 100, 250, 500];
        
        for (const increment of increments) {
            if (lineCount > increment) {
                const option = document.createElement('option');
                option.value = increment.toString();
                option.textContent = `First ${increment}`;
                lineCountSelect.appendChild(option);
            }
        }
    }
    
    function openFileModal() {
        if (fileModal) {
            fileModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }
    
    function closeFileModal() {
        if (fileModal) {
            fileModal.classList.add('hidden');
            document.body.style.overflow = '';
        }
    }
    
    function confirmFileSelection() {
        const selectedRadio = document.querySelector('input[name="selected-file"]:checked');
        if (selectedRadio) {
            selectedFileId = selectedRadio.value;
            const fileName = selectedRadio.getAttribute('data-filename');
            const lineCount = parseInt(selectedRadio.getAttribute('data-line-count'));
            
            if (selectedFileText) {
                selectedFileText.textContent = fileName;
            }
            
            // Update line count selector
            updateLineCountSelector(lineCount);
            
            console.log('File selected:', fileName, 'ID:', selectedFileId, 'Lines:', lineCount);
        }
        closeFileModal();
    }
    
    // File deletion modal functions
    function openDeleteFileModal(fileId, filename) {
        currentFileToDelete = { id: fileId, filename: filename };
        originalDownloaded = false;
        backTranslationDownloaded = false;
        
        document.getElementById('delete-filename').textContent = filename;
        
        // Check for back translations
        fetch(`/project/${projectId}/files/${fileId}/back-translations`)
        .then(response => response.json())
        .then(data => {
            if (data.back_translation_jobs && data.back_translation_jobs.length > 0) {
                backTranslationDownloadSection.classList.remove('hidden');
                // Set up download link for the latest back translation
                const latestJob = data.back_translation_jobs[0];
                downloadBackTranslationBtn.onclick = function() {
                    window.location.href = latestJob.download_url;
                    backTranslationDownloaded = true;
                    updateDeleteButtonState();
                };
            } else {
                backTranslationDownloadSection.classList.add('hidden');
                backTranslationDownloaded = true; // No back translation to download
            }
            updateDeleteButtonState();
        })
        .catch(error => {
            console.error('Error checking back translations:', error);
            backTranslationDownloadSection.classList.add('hidden');
            backTranslationDownloaded = true;
            updateDeleteButtonState();
        });
        
        // Set up original file download
        downloadOriginalBtn.onclick = function() {
            // Use the dedicated download endpoint
            const downloadUrl = `/project/${projectId}/files/${fileId}/download`;
            window.location.href = downloadUrl;
            originalDownloaded = true;
            updateDeleteButtonState();
        };
        
        deleteFileModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
    
    function closeDeleteFileModal() {
        deleteFileModal.classList.add('hidden');
        document.body.style.overflow = '';
        currentFileToDelete = null;
    }
    
    function updateDeleteButtonState() {
        const canDelete = originalDownloaded && backTranslationDownloaded;
        confirmDeleteBtn.disabled = !canDelete;
        
        if (canDelete) {
            confirmDeleteBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        } else {
            confirmDeleteBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }
    
    function deleteFile() {
        if (!currentFileToDelete || !originalDownloaded || !backTranslationDownloaded) {
            return;
        }
        
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.textContent = 'Deleting...';
        
        fetch(`/project/${projectId}/files/${currentFileToDelete.id}`, {
            method: 'DELETE'
        })
        .then(response => {
            if (response.ok) {
                closeDeleteFileModal();
                window.location.reload(); // Refresh to update file list
            } else {
                throw new Error('Delete failed');
            }
        })
        .catch(error => {
            console.error('Delete error:', error);
            alert('Failed to delete file');
            confirmDeleteBtn.disabled = false;
            confirmDeleteBtn.textContent = 'Delete File';
        });
    }
    
    // Upload back translation modal functions
    function openUploadBackTranslationModal() {
        uploadBackTranslationModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
    
    function closeUploadBackTranslationModal() {
        uploadBackTranslationModal.classList.add('hidden');
        document.body.style.overflow = '';
        // Reset form
        document.getElementById('upload-back-translation-form').reset();
    }
    
    function uploadBackTranslationFile() {
        const fileInput = document.getElementById('back-translation-file');
        const file = fileInput.files[0];
        
        if (!file) {
            alert('Please select a file');
            return;
        }
        
        confirmUploadBtn.disabled = true;
        confirmUploadBtn.textContent = 'Uploading...';
        
        const formData = new FormData();
        formData.append('back_translation_file', file);
        
        fetch(`/project/${projectId}/upload-back-translation`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeUploadBackTranslationModal();
                alert(data.message);
                // Refresh back translation status
                checkBackTranslationStatus();
            } else {
                alert(data.error || 'Upload failed');
            }
        })
        .catch(error => {
            console.error('Upload error:', error);
            alert('Upload failed: ' + error.message);
        })
        .finally(() => {
            confirmUploadBtn.disabled = false;
            confirmUploadBtn.textContent = 'Upload File';
        });
    }
    
    // Redo back translation function
    function redoBackTranslation() {
        const currentJobInfo = downloadResultsBtn ? downloadResultsBtn.textContent : 'back translation';
        const confirmMessage = `Are you sure you want to redo the back translation?\n\nThis will:\n• Start a new back translation job\n• Keep your previous results available\n• Use the same file and line count settings`;
        
        if (confirm(confirmMessage)) {
            // Reset UI to initial state
            if (backTranslationResults) backTranslationResults.classList.add('hidden');
            if (jobStatus) jobStatus.classList.add('hidden');
            resetButton();
            
            // Show immediate feedback
            if (btnText) btnText.textContent = 'Starting redo...';
            if (startBtn) startBtn.disabled = true;
            
            // Small delay to show the feedback, then start
            setTimeout(() => {
                startBackTranslation();
            }, 300);
        }
    }

    // Target text upload modal functions
    function openUploadTargetTextModal() {
        uploadTargetTextModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
    
    function closeUploadTargetTextModal() {
        uploadTargetTextModal.classList.add('hidden');
        document.body.style.overflow = '';
        // Reset form
        document.getElementById('upload-target-text-form').reset();
        // Reset sections
        document.getElementById('file-upload-section').classList.remove('hidden');
        document.getElementById('text-paste-section').classList.add('hidden');
        // Reset character counter
        if (targetCharCount) {
            targetCharCount.textContent = '0 / 16,000';
            targetCharCount.classList.remove('text-red-600');
            targetCharCount.classList.add('text-neutral-500');
        }
    }
    
    function uploadTargetTextFile() {
        const uploadMethod = document.querySelector('input[name="upload_method"]:checked').value;
        
        confirmTargetUploadBtn.disabled = true;
        confirmTargetUploadBtn.textContent = 'Uploading...';
        
        const formData = new FormData();
        formData.append('upload_method', uploadMethod);
        
        if (uploadMethod === 'file') {
            const fileInput = document.getElementById('target-text-file');
            const file = fileInput.files[0];
            
            if (!file) {
                alert('Please select a file');
                confirmTargetUploadBtn.disabled = false;
                confirmTargetUploadBtn.textContent = 'Upload';
                return;
            }
            
            formData.append('target_text_file', file);
        } else if (uploadMethod === 'text') {
            const textContent = document.getElementById('target-text-content').value.trim();
            
            if (!textContent) {
                alert('Please enter some text');
                confirmTargetUploadBtn.disabled = false;
                confirmTargetUploadBtn.textContent = 'Upload';
                return;
            }
            
            if (textContent.length > 16000) {
                alert('Text content exceeds 16,000 character limit');
                confirmTargetUploadBtn.disabled = false;
                confirmTargetUploadBtn.textContent = 'Upload';
                return;
            }
            
            formData.append('target_text_content', textContent);
        }
        
        fetch(`/project/${projectId}/upload-target-text`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeUploadTargetTextModal();
                alert(data.message);
                // Refresh the page to show the new file
                window.location.reload();
            } else {
                alert(data.error || 'Upload failed');
            }
        })
        .catch(error => {
            console.error('Upload error:', error);
            alert('Upload failed: ' + error.message);
        })
        .finally(() => {
            confirmTargetUploadBtn.disabled = false;
            confirmTargetUploadBtn.textContent = 'Upload';
        });
    }

    // File upload modal functions
    function openFileUploadModal() {
        fileUploadModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
    
    function closeFileUploadModal() {
        fileUploadModal.classList.add('hidden');
        document.body.style.overflow = '';
        // Reset form
        document.getElementById('file-upload-form').reset();
        // Reset sections
        document.getElementById('file-upload-section-modal').classList.remove('hidden');
        document.getElementById('text-paste-section-modal').classList.add('hidden');
        document.getElementById('pairing-section-modal').classList.add('hidden');
        // Reset character counter
        if (uploadCharCount) {
            uploadCharCount.textContent = '0 / 16,000';
            uploadCharCount.classList.remove('text-red-600');
            uploadCharCount.classList.add('text-neutral-500');
        }
    }
    
    function uploadFile() {
        const uploadMethod = document.querySelector('#file-upload-modal input[name="upload_method"]:checked').value;
        const fileType = document.querySelector('#file-upload-modal input[name="file_type"]:checked').value;
        
        confirmFileUploadBtn.disabled = true;
        confirmFileUploadBtn.textContent = 'Uploading...';
        
        const formData = new FormData();
        formData.append('upload_method', uploadMethod);
        formData.append('file_type', fileType);
        
        // Add pairing info if it's a back translation
        if (fileType === 'back_translation') {
            const pairedWithInput = document.querySelector('#file-upload-modal input[name="paired_with_id"]:checked');
            if (pairedWithInput) {
                formData.append('paired_with_id', pairedWithInput.value);
            } else {
                alert('Please select a forward translation to pair with');
                confirmFileUploadBtn.disabled = false;
                confirmFileUploadBtn.textContent = 'Upload File';
                return;
            }
        }
        
        if (uploadMethod === 'file') {
            const fileInput = document.getElementById('text-file-upload');
            const file = fileInput.files[0];
            
            if (!file) {
                alert('Please select a file');
                confirmFileUploadBtn.disabled = false;
                confirmFileUploadBtn.textContent = 'Upload File';
                return;
            }
            
            formData.append('text_file', file);
        } else if (uploadMethod === 'text') {
            const textContent = document.getElementById('text-content-upload').value.trim();
            
            if (!textContent) {
                alert('Please enter some text');
                confirmFileUploadBtn.disabled = false;
                confirmFileUploadBtn.textContent = 'Upload File';
                return;
            }
            
            if (textContent.length > 16000) {
                alert('Text content exceeds 16,000 character limit');
                confirmFileUploadBtn.disabled = false;
                confirmFileUploadBtn.textContent = 'Upload File';
                return;
            }
            
            formData.append('text_content', textContent);
        }
        
        fetch(`/project/${projectId}/upload-file`, {
            method: 'POST',
            body: formData
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                closeFileUploadModal();
                alert(data.message);
                // Refresh the page to show the new file
                window.location.reload();
            } else {
                alert(data.error || 'Upload failed');
            }
        })
        .catch(error => {
            console.error('Upload error:', error);
            alert('Upload failed: ' + error.message);
        })
        .finally(() => {
            confirmFileUploadBtn.disabled = false;
            confirmFileUploadBtn.textContent = 'Upload File';
        });
    }

    // Cleanup on page unload
    window.addEventListener('beforeunload', function() {
        stopBackTranslationStatusChecking();
    });

    // Instructions functionality
    const instructionsTextarea = document.getElementById('translation-instructions');
    const charCount = document.getElementById('char-count');
    const saveBtn = document.getElementById('save-instructions-btn');
    
    if (instructionsTextarea && charCount) {
        instructionsTextarea.addEventListener('input', function() {
            const length = this.value.length;
            charCount.textContent = `${length} / 4,000`;
            
            if (length > 4000) {
                charCount.classList.add('text-red-500');
                charCount.classList.remove('text-neutral-500');
            } else {
                charCount.classList.remove('text-red-500');
                charCount.classList.add('text-neutral-500');
            }
        });
    }
    
    if (saveBtn) {
        saveBtn.addEventListener('click', async function() {
            const instructions = instructionsTextarea.value.trim();
            
            if (instructions.length > 4000) {
                alert('Instructions must be 4000 characters or less');
                return;
            }
            
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            
            try {
                const projectId = window.location.pathname.split('/')[2];
                const response = await fetch(`/project/${projectId}/update-instructions`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ instructions })
                });
                
                if (response.ok) {
                    saveBtn.textContent = 'Saved!';
                    setTimeout(() => {
                        saveBtn.textContent = 'Save Instructions';
                        saveBtn.disabled = false;
                    }, 2000);
                } else {
                    throw new Error('Failed to save');
                }
            } catch (error) {
                alert('Failed to save instructions');
                saveBtn.textContent = 'Save Instructions';
                saveBtn.disabled = false;
            }
        });
    }
}); 