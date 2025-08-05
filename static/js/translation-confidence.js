// Translation Confidence Display System - SIMPLIFIED
// 
// Clean approach: Simple confidence panel above the textarea:
// 1. Set the textarea value immediately to the AI translation
// 2. Create a minimal confidence panel showing color-coded segments
// 3. Keep textarea fully editable and compatible with language server
// 4. Auto-save the translation immediately (no accept/reject needed)
// 5. Panel stays visible until manually closed (no auto-hide)
// 6. Allow users to edit immediately while seeing confidence feedback
//
// This provides:
// - Immediate editability (no confusion about non-editable state)
// - Clean visual confidence feedback (intuitive color coding)
// - Language server compatibility (no overlay interference)
// - Automatic saving (leverages existing version history)
// - Simplified UX (minimal text, just the essentials)
//
class TranslationConfidence {
    constructor() {
        this.verseConfidenceData = {};
    }
    
    displayTranslationWithConfidence(textarea, translation, confidence, verseIndex, translationEditor) {
        if (!confidence?.segments?.length) {
            confidence = {
                segments: [{
                    text: translation,
                    confidence: 0.2,
                    matching_examples: []
                }]
            };
        }

        // Set the textarea value immediately
        textarea.value = translation;
        
        // Create confidence panel above the textarea
        const confidencePanel = this.createConfidencePanel(confidence.segments, verseIndex);
        
        // Insert confidence panel above the textarea
        textarea.parentElement.insertBefore(confidencePanel, textarea);
        
        // Store confidence data for potential cleanup
        this.verseConfidenceData[verseIndex] = {
            translation: translation,
            confidence: confidence,
            panel: confidencePanel
        };
        
        // Mark textarea as having confidence panel for later cleanup
        textarea.dataset.hasConfidencePanel = 'true';
        
        // Auto-save the translation immediately since user can edit it
        if (translationEditor.saveSystem) {
            const targetWindow = this.getTextWindowForTextarea(textarea, translationEditor);
            const averageConfidence = this.calculateAverageConfidence(confidence);
            
            // Save with AI metadata
            setTimeout(() => {
                translationEditor.saveVerse(verseIndex, translation, targetWindow?.id, {
                    source: 'ai_translation',
                    confidence: averageConfidence,
                    comment: 'AI translation with confidence panel'
                }).catch(error => {
                    console.error('Error auto-saving AI translation:', error);
                });
            }, 100);
        }
        
        // Panel stays visible - no auto-hide functionality
    }
    
    createConfidencePanel(segments, verseIndex) {
        const panel = document.createElement('div');
        panel.className = 'confidence-panel mb-2 p-3 bg-blue-50 border border-blue-200 rounded-lg shadow-sm';
        panel.style.cssText = `
            background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
            border: 1px solid #93c5fd;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 8px;
            box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1);
            transition: opacity 0.3s ease-in-out;
            position: relative;
        `;
        
        // Simple close button in top-right corner
        const closeButton = document.createElement('button');
        closeButton.className = 'absolute top-2 right-2 text-blue-500 hover:text-blue-700 text-sm';
        closeButton.innerHTML = '<i class="fas fa-times"></i>';
        closeButton.onclick = () => panel.remove();
        
        // Confidence content area - simplified, no header or extra text
        const content = document.createElement('div');
        content.className = 'confidence-segments text-base leading-relaxed';
        
        // Render confidence segments
        this.renderConfidenceSegmentsInPanel(content, segments);
        
        panel.appendChild(closeButton);
        panel.appendChild(content);
        
        return panel;
    }
    
    renderConfidenceSegmentsInPanel(content, segments) {
        content.innerHTML = '';
        
        segments.forEach(segment => {
            const span = document.createElement('span');
            span.textContent = segment.text;
            span.className = 'confidence-segment';
            
            const colors = this.getConfidenceColors(segment.confidence);
            const confidencePercent = Math.round(segment.confidence * 100);
            
            Object.assign(span.style, {
                backgroundColor: colors.background,
                color: colors.text,
                padding: '2px 4px',
                borderRadius: '4px',
                margin: '0 1px',
                display: 'inline',
                cursor: 'help'
            });
            
            // Add detailed tooltip
            span.title = `Confidence: ${confidencePercent}%\nClick to see details`;
            
            // Add the original tooltip listeners for source information
            this.addTooltipListeners(span, segment);
            
            // Add click handler for detailed confidence info
            span.addEventListener('click', () => {
                this.showSegmentDetails(segment, span);
            });
            
            content.appendChild(span);
        });
        
        // Legend removed - confidence colors are intuitive
    }
    
    // fadeOutConfidencePanel method removed - no auto-hide functionality needed
    
    showSegmentDetails(segment, span) {
        // Use the existing confidence tooltip instead of a modal for consistency
        const sources = segment.sources || segment.matching_examples || [];
        if (window.confidenceTooltip) {
            // Force show the tooltip with a longer delay
            window.confidenceTooltip.show(span, segment.confidence, sources, segment.text);
            
            // Keep it visible for longer
            setTimeout(() => {
                if (window.confidenceTooltip) {
                    window.confidenceTooltip.hide();
                }
            }, 5000);
        } else {
            // Fallback modal if tooltip isn't available
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
            modal.innerHTML = `
                <div class="bg-white rounded-lg p-6 max-w-md mx-4">
                    <h3 class="text-lg font-bold mb-3">Confidence Details</h3>
                    <div class="space-y-2">
                        <p><strong>Text:</strong> "${segment.text}"</p>
                        <p><strong>Confidence:</strong> ${Math.round(segment.confidence * 100)}%</p>
                        <p><strong>Sources:</strong> ${sources.length} similar examples</p>
                    </div>
                    <button class="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700" onclick="this.parentElement.parentElement.remove()">
                        Close
                    </button>
                </div>
            `;
            document.body.appendChild(modal);
            
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.remove();
            });
        }
    }
    
    // Note: Accept/reject buttons removed - translation is immediately editable
    // and auto-saved with confidence metadata. Panel cleanup happens on page reload.
    
    // Button overlay methods removed - no longer needed since translations are immediately editable
    
    // createButton method removed - no longer needed without accept/reject buttons
    
    createRefinementArea(textarea, translation, verseIndex, translationEditor) {
        const refinementContainer = document.createElement('div');
        refinementContainer.className = 'mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg';
        
        // Title
        const title = document.createElement('div');
        title.className = 'text-sm font-medium text-blue-800 mb-2';
        title.textContent = 'Refine this translation:';
        
        // Refinement textarea
        const refinementTextarea = document.createElement('textarea');
        refinementTextarea.className = 'w-full p-2 border border-blue-300 rounded text-sm resize-none';
        refinementTextarea.placeholder = 'e.g., "Don\'t use the word X" or "Make it more formal" or "Use simpler language"';
        refinementTextarea.rows = 2;
        
        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'flex gap-2 mt-2';
        
        // Refine button
        const refineButton = document.createElement('button');
        refineButton.className = 'px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50';
        refineButton.textContent = 'Refine Translation';
        
        // Initially disabled until user types something
        refineButton.disabled = true;
        
        // Enable/disable refine button based on input
        refinementTextarea.addEventListener('input', () => {
            refineButton.disabled = !refinementTextarea.value.trim();
        });
        
        // Handle refine action
        refineButton.onclick = async () => {
            const refinementPrompt = refinementTextarea.value.trim();
            if (!refinementPrompt) return;
            
            // Disable form while processing
            refineButton.disabled = true;
            refinementTextarea.disabled = true;
            refineButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refining...';
            
            try {
                // Save refinement prompt
                await this.saveRefinementPrompt(verseIndex, refinementPrompt, translationEditor);
                
                // Retranslate with refinement and replace current display
                await this.retranslateAndReplace(textarea, verseIndex, refinementPrompt, translationEditor);
                
            } catch (error) {
                console.error('Error refining translation:', error);
                // Re-enable form on error
                refineButton.disabled = false;
                refinementTextarea.disabled = false;
                refineButton.textContent = 'Refine Translation';
                
                // Show error message
                const errorMsg = document.createElement('div');
                errorMsg.className = 'text-red-600 text-xs mt-1';
                errorMsg.textContent = 'Failed to refine translation. Please try again.';
                buttonContainer.appendChild(errorMsg);
                setTimeout(() => errorMsg.remove(), 3000);
            }
        };
        
        // Handle enter key (Shift+Enter for new line, Enter to submit)
        refinementTextarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!refineButton.disabled) {
                    refineButton.click();
                }
            }
        });
        
        buttonContainer.appendChild(refineButton);
        
        refinementContainer.appendChild(title);
        refinementContainer.appendChild(refinementTextarea);
        refinementContainer.appendChild(buttonContainer);
        
        return refinementContainer;
    }
    
    // renderConfidenceSegments method removed - replaced with renderConfidenceSegmentsAsOverlay
    
    addTooltipListeners(span, segment) {
        span.addEventListener('mouseenter', () => {
            // Use matching_examples if sources is not available (new API format)
            const sources = segment.sources || segment.matching_examples || [];
            window.confidenceTooltip?.show(span, segment.confidence, sources, segment.text);
        });
        
        span.addEventListener('mouseleave', () => {
            window.confidenceTooltip?.hide();
        });
    }
    
    // replaceTextareaWithConfidence method removed - textarea stays editable with confidence overlay behind it

    // acceptTranslation method removed - translations auto-save immediately when received
    
    calculateAverageConfidence(confidence) {
        if (!confidence?.segments?.length) return null;
        
        const total = confidence.segments.reduce((sum, segment) => sum + (segment.confidence || 0), 0);
        return total / confidence.segments.length;
    }
    
    getTextWindowForTextarea(textarea, translationEditor) {
        for (const [id, window] of translationEditor.textWindows) {
            if (window.element?.contains(textarea)) {
                return window;
            }
        }
        return null;
    }
    
    // rejectTranslation method removed - users can edit directly, version history tracks changes
    
    cleanupConfidencePanel(verseIndex) {
        const data = this.verseConfidenceData[verseIndex];
        if (data?.panel && data.panel.parentElement) {
            // Remove the confidence panel
            data.panel.remove();
            
            // Find the textarea and clean up any panel markers
            const textarea = document.querySelector(`textarea[data-has-confidence-panel="true"][data-verse-index="${verseIndex}"]`);
            if (textarea) {
                delete textarea.dataset.hasConfidencePanel;
            }
        }
        delete this.verseConfidenceData[verseIndex];
    }
    
    // Clean up all confidence panels (useful for page reload or navigation)
    cleanupAllConfidencePanels() {
        Object.keys(this.verseConfidenceData).forEach(verseIndex => {
            this.cleanupConfidencePanel(parseInt(verseIndex));
        });
    }

    
    async saveRefinementPrompt(verseIndex, refinementPrompt, translationEditor) {
        const targetId = translationEditor.primaryTextId;
        if (!targetId) return;
        
        try {
            const response = await fetch(`/project/${translationEditor.projectId}/translation/${targetId}/verse/${verseIndex}/refinement`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    refinement_prompt: refinementPrompt
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            console.log(`✅ Saved refinement prompt for verse ${verseIndex}`);
        } catch (error) {
            console.error('Error saving refinement prompt:', error);
        }
    }
    
    async retranslateAndReplace(textarea, verseIndex, refinementPrompt, translationEditor) {
        // Find source text
        let sourceText = '';
        let sourceWindow = null;
        
        for (const [id, textWindow] of translationEditor.textWindows) {
            if (textWindow.id !== translationEditor.primaryTextId) {
                const sourceTextarea = textWindow.element?.querySelector(`textarea[data-verse-index="${verseIndex}"]`);
                if (sourceTextarea && sourceTextarea.value?.trim()) {
                    sourceText = sourceTextarea.value.trim();
                    sourceWindow = textWindow;
                    break;
                }
            }
        }
        
        if (!sourceText) {
            console.error('No source text found for retranslation');
            return;
        }
        
        try {
            const project = await translationEditor.getProjectInfo();
            const settings = translationEditor.ui.getTranslationSettings();
            
            // Get the current translation that we're refining
            const currentTranslation = this.verseConfidenceData[verseIndex]?.translation || '';
            
            const requestBody = {
                text: sourceText,
                source_file_id: sourceWindow.id,
                target_file_id: translationEditor.primaryTextId,
                target_language: project?.target_language,
                project_id: translationEditor.projectId,
                temperature: settings.temperature,
                use_examples: settings.useExamples,
                refinement_prompt: refinementPrompt,
                current_verse_index: verseIndex,
                current_translation: currentTranslation
            };
            
            const response = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Update the textarea value with the refined translation
                textarea.value = data.translation;
                
                // Update the confidence panel with new segments
                const confidenceData = this.verseConfidenceData[verseIndex];
                if (confidenceData?.panel) {
                    const content = confidenceData.panel.querySelector('.confidence-segments');
                    if (content) {
                        this.renderConfidenceSegmentsInPanel(content, data.confidence?.segments || [{
                            text: data.translation,
                            confidence: 0.2,
                            matching_examples: []
                        }]);
                    }
                    
                    // Update stored confidence data
                    confidenceData.translation = data.translation;
                    confidenceData.confidence = data.confidence;
                }
                
                // Auto-save the refined translation
                const targetWindow = this.getTextWindowForTextarea(textarea, translationEditor);
                const averageConfidence = this.calculateAverageConfidence(data.confidence);
                
                translationEditor.saveVerse(verseIndex, data.translation, targetWindow?.id, {
                    source: 'ai_refined',
                    confidence: averageConfidence,
                    comment: 'Refined AI translation'
                }).catch(error => {
                    console.error('Error saving refined translation:', error);
                });
                
                // Clear and reset the refinement area
                const currentRefinementArea = textarea.refinementArea;
                if (currentRefinementArea) {
                    const refinementTextarea = currentRefinementArea.querySelector('textarea');
                    const refineButton = currentRefinementArea.querySelector('button');
                    
                    if (refinementTextarea) {
                        refinementTextarea.value = '';
                        refinementTextarea.disabled = false;
                    }
                    
                    if (refineButton) {
                        refineButton.disabled = true;
                        refineButton.textContent = 'Refine Translation';
                    }
                }
            } else {
                throw new Error(data.error || 'Translation failed');
            }
        } catch (error) {
            console.error('Error refining translation:', error);
            throw error; // Let the calling code handle the error display
        }
    }

    getConfidenceColors(confidence) {
        // Simple confidence-based coloring: red (low) -> yellow (medium) -> green (high)
        if (confidence < 0.4) {
            return { text: '#991b1b', background: '#fef2f2' }; // Red
        } else if (confidence < 0.7) {
            return { text: '#92400e', background: '#fef3c7' }; // Yellow
        } else {
            return { text: '#166534', background: '#dcfce7' }; // Green
        }
    }
}

// Make available globally
window.TranslationConfidence = TranslationConfidence; 