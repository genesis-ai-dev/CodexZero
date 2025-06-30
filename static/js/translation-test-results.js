// Translation Test Results Component
class TranslationTestResults {
    constructor(editor) {
        this.editor = editor;
        this.testResults = new Map(); // Store results by textarea for copying
    }
    
    displayTestResult(textarea, data, verseIndex) {
        // Store result for copying later
        const textareaId = textarea.dataset.verseIndex || textarea.id || Math.random().toString();
        if (!this.testResults.has(textareaId)) {
            this.testResults.set(textareaId, []);
        }
        
        const timestamp = new Date();
        const resultData = {
            timestamp: timestamp,
            chrfScore: data.similarity?.chrf_score || 0,
            modelUsed: data.model_used || 'Unknown',
            temperature: data.temperature || 0.7,
            examplesUsed: data.examples_used || 0,
            aiTranslation: data.translation,
            groundTruth: data.ground_truth,
            verseReference: textarea.dataset.reference || `Verse ${verseIndex}`
        };
        
        this.testResults.get(textareaId).push(resultData);
        
        // Create compact test results container
        const testResults = this.createTestResultElement(resultData, textarea, verseIndex);
        
        // Insert after textarea, before any existing test results
        const insertionPoint = textarea.nextSibling;
        textarea.parentNode.insertBefore(testResults, insertionPoint);
        
        // Add copy button if this is the first result for this textarea
        this.ensureCopyButton(textarea);
    }
    
    createTestResultElement(resultData, textarea, verseIndex) {
        const testResults = document.createElement('div');
        testResults.className = 'test-result bg-blue-50 border border-blue-200 rounded-md p-3 mt-1 text-xs';
        
        const { timestamp, chrfScore, modelUsed, temperature, examplesUsed, aiTranslation, groundTruth } = resultData;
        
        // Color code based on CHRF score
        let scoreColor = 'text-red-600';
        if (chrfScore >= 50) scoreColor = 'text-green-600';
        else if (chrfScore >= 30) scoreColor = 'text-yellow-600';
        
        testResults.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-3 text-xs">
                    <div class="font-semibold text-blue-800">Test ${timestamp.toLocaleTimeString()}</div>
                    <div class="bg-gray-100 px-2 py-1 rounded">${modelUsed}</div>
                    <div class="bg-gray-100 px-2 py-1 rounded">T:${temperature}</div>
                    <div class="bg-gray-100 px-2 py-1 rounded">${examplesUsed}ex</div>
                </div>
                <div class="text-right">
                    <div class="text-lg font-bold ${scoreColor}">${chrfScore}</div>
                    <div class="text-xs text-gray-500">CHRF</div>
                </div>
            </div>
            
            <div class="space-y-2">
                <div>
                    <div class="font-medium text-gray-600 mb-1">AI:</div>
                    <div class="bg-white border border-gray-200 rounded p-2 text-gray-800 text-sm">${aiTranslation}</div>
                </div>
                
                <div>
                    <div class="font-medium text-gray-600 mb-1">Ground Truth:</div>
                    <div class="bg-gray-100 border border-gray-200 rounded p-2 text-gray-700 text-sm">${groundTruth}</div>
                </div>
                
                <div class="flex gap-1">
                    <button class="use-ai-btn flex-1 bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700">
                        Use AI
                    </button>
                    <button class="keep-original-btn flex-1 bg-gray-600 text-white px-2 py-1 rounded text-xs hover:bg-gray-700">
                        Keep Original
                    </button>
                    <button class="dismiss-btn flex-1 bg-gray-300 text-gray-700 px-2 py-1 rounded text-xs hover:bg-gray-400">
                        Dismiss
                    </button>
                </div>
            </div>
        `;
        
        // Add event listeners
        this.addButtonListeners(testResults, textarea, verseIndex, aiTranslation, groundTruth);
        
        return testResults;
    }
    
    addButtonListeners(testResults, textarea, verseIndex, aiTranslation, groundTruth) {
        const useAiBtn = testResults.querySelector('.use-ai-btn');
        const keepOriginalBtn = testResults.querySelector('.keep-original-btn');
        const dismissBtn = testResults.querySelector('.dismiss-btn');
        
        useAiBtn.addEventListener('click', () => {
            textarea.value = aiTranslation;
            this.editor.ui.autoResizeTextarea(textarea);
            this.editor.saveSystem.bufferVerseChange(verseIndex, aiTranslation);
            testResults.remove();
        });
        
        keepOriginalBtn.addEventListener('click', () => {
            textarea.value = groundTruth;
            this.editor.ui.autoResizeTextarea(textarea);
            this.editor.saveSystem.bufferVerseChange(verseIndex, groundTruth);
            testResults.remove();
        });
        
        dismissBtn.addEventListener('click', () => {
            testResults.remove();
        });
    }
    
    ensureCopyButton(textarea) {
        // Check if copy button already exists for this textarea
        const existingCopyBtn = textarea.parentNode.querySelector('.copy-test-results-btn');
        if (existingCopyBtn) return;
        
        // Create copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-test-results-btn bg-green-600 text-white px-3 py-1 rounded text-xs hover:bg-green-700 mt-2';
        copyBtn.innerHTML = '<i class="fas fa-copy mr-1"></i>Copy All Test Results';
        
        copyBtn.addEventListener('click', () => {
            this.copyAllTestResults();
        });
        
        // Insert after the last test result or after textarea if no results
        const lastTestResult = Array.from(textarea.parentNode.querySelectorAll('.test-result')).pop();
        const insertionPoint = lastTestResult ? lastTestResult.nextSibling : textarea.nextSibling;
        textarea.parentNode.insertBefore(copyBtn, insertionPoint);
    }
    
    copyAllTestResults() {
        let markdown = '# Translation Test Results\n\n';
        
        this.testResults.forEach((results, textareaId) => {
            if (results.length === 0) return;
            
            const firstResult = results[0];
            markdown += `## ${firstResult.verseReference}\n\n`;
            markdown += `**Ground Truth:** ${firstResult.groundTruth}\n\n`;
            
            results.forEach((result, index) => {
                markdown += `### Test ${index + 1} - ${result.timestamp.toLocaleString()}\n\n`;
                markdown += `- **Model:** ${result.modelUsed}\n`;
                markdown += `- **Temperature:** ${result.temperature}\n`;
                markdown += `- **Examples:** ${result.examplesUsed}\n`;
                markdown += `- **CHRF Score:** ${result.chrfScore}\n`;
                markdown += `- **AI Translation:** ${result.aiTranslation}\n\n`;
            });
            
            markdown += '---\n\n';
        });
        
        // Copy to clipboard
        navigator.clipboard.writeText(markdown).then(() => {
            this.showCopyFeedback();
        }).catch(err => {
            console.error('Failed to copy: ', err);
            // Fallback - create temporary textarea
            this.fallbackCopy(markdown);
        });
    }
    
    showCopyFeedback() {
        // Find copy button and temporarily change its text
        const copyBtn = document.querySelector('.copy-test-results-btn');
        if (copyBtn) {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check mr-1"></i>Copied!';
            copyBtn.className = copyBtn.className.replace('bg-green-600', 'bg-green-800');
            
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.className = copyBtn.className.replace('bg-green-800', 'bg-green-600');
            }, 2000);
        }
    }
    
    fallbackCopy(text) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.showCopyFeedback();
    }
    
    clearResultsForTextarea(textarea) {
        const textareaId = textarea.dataset.verseIndex || textarea.id || Math.random().toString();
        this.testResults.delete(textareaId);
        
        // Remove copy button
        const copyBtn = textarea.parentNode.querySelector('.copy-test-results-btn');
        if (copyBtn) copyBtn.remove();
        
        // Remove all test result elements
        const testResultElements = textarea.parentNode.querySelectorAll('.test-result');
        testResultElements.forEach(el => el.remove());
    }
}

window.TranslationTestResults = TranslationTestResults; 