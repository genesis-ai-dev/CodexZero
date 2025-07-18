// Translation Confidence Display System
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

        const originalContent = textarea.value;
        const confidenceDiv = this.createConfidenceDiv(textarea);
        const buttonOverlay = this.createButtonOverlay(confidenceDiv, textarea, translation, originalContent, verseIndex, translationEditor);
        const refinementArea = this.createRefinementArea(textarea, translation, verseIndex, translationEditor);
        
        this.renderConfidenceSegments(confidenceDiv, confidence.segments);
        this.replaceTextareaWithConfidence(textarea, confidenceDiv, buttonOverlay, refinementArea);
        
        // Store confidence data
        this.verseConfidenceData[verseIndex] = {
            translation: translation,
            confidence: confidence
        };
    }
    
    createConfidenceDiv(textarea) {
        const div = document.createElement('div');
        div.className = 'w-full min-h-20 p-3 pt-6 border border-neutral-300 rounded-lg text-lg leading-relaxed relative z-0 bg-white';
        div.style.minHeight = textarea.style.minHeight || '80px';
        return div;
    }
    
    createButtonOverlay(confidenceDiv, textarea, translation, originalContent, verseIndex, translationEditor) {
        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 pointer-events-none z-40';
        
        const container = document.createElement('div');
        container.className = 'absolute top-2 right-2 flex space-x-2 pointer-events-auto';
        
        const acceptBtn = this.createButton('✓', 'Accept translation', 'bg-green-500', () => {
            this.acceptTranslation(confidenceDiv, textarea, translation, verseIndex, translationEditor);
            overlay.remove();
        });
        
        const rejectBtn = this.createButton('✗', 'Reject translation', 'bg-red-500', () => {
            this.rejectTranslation(confidenceDiv, textarea, originalContent, verseIndex, translationEditor);
            overlay.remove();
        });
        
        container.appendChild(acceptBtn);
        container.appendChild(rejectBtn);
        overlay.appendChild(container);
        
        return overlay;
    }
    
    updateButtonOverlay(confidenceDiv, textarea, newTranslation, verseIndex, translationEditor) {
        // Find the existing button overlay
        const existingOverlay = confidenceDiv.parentElement.querySelector('.absolute.inset-0');
        if (existingOverlay) {
            // Find the accept button and update its click handler
            const acceptBtn = existingOverlay.querySelector('button[title="Accept translation"]');
            if (acceptBtn) {
                // Remove old event listeners by cloning the button
                const newAcceptBtn = acceptBtn.cloneNode(true);
                
                // Add new event listener with updated translation
                newAcceptBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.acceptTranslation(confidenceDiv, textarea, newTranslation, verseIndex, translationEditor);
                    existingOverlay.remove();
                });
                
                // Replace the old button with the new one
                acceptBtn.parentNode.replaceChild(newAcceptBtn, acceptBtn);
            }
        }
    }
    
    createButton(text, title, colorClasses, onClick) {
        const button = document.createElement('button');
        button.className = `w-6 h-6 ${colorClasses} text-white text-xs rounded-full flex items-center justify-center shadow-lg`;
        button.textContent = text;
        button.title = title;
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return button;
    }
    
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
    
    renderConfidenceSegments(confidenceDiv, segments) {
        // Clear existing content first
        confidenceDiv.innerHTML = '';
        
        segments.forEach(segment => {
            const span = document.createElement('span');
            span.textContent = segment.text;
            span.className = 'confidence-segment';
            
            const colors = this.getConfidenceColors(segment.confidence);
            Object.assign(span.style, {
                color: colors.text,
                backgroundColor: colors.background,
                padding: '1px 2px',
                borderRadius: '3px'
            });
            
            this.addTooltipListeners(span, segment);
            confidenceDiv.appendChild(span);
        });
    }
    
    addTooltipListeners(span, segment) {
        span.addEventListener('mouseenter', () => {
            window.confidenceTooltip?.show(span, segment.confidence, segment.sources || [], segment.text);
        });
        
        span.addEventListener('mouseleave', () => {
            window.confidenceTooltip?.hide();
        });
    }
    
    replaceTextareaWithConfidence(textarea, confidenceDiv, buttonOverlay, refinementArea) {
        textarea.style.display = 'none';
        textarea.parentElement.insertBefore(confidenceDiv, textarea.nextSibling);
        
        // Insert refinement area after confidence div
        if (refinementArea) {
            confidenceDiv.parentElement.insertBefore(refinementArea, confidenceDiv.nextSibling);
            textarea.refinementArea = refinementArea;
        }
        
        textarea.parentElement.insertBefore(buttonOverlay, textarea.nextSibling);
        textarea.confidenceDiv = confidenceDiv;
    }

    async acceptTranslation(confidenceDiv, textarea, translation, verseIndex, translationEditor) {
        this.cleanupConfidenceDisplay(confidenceDiv, textarea, verseIndex);
        textarea.value = translation;
        
        // Find the target window that contains this textarea
        const targetWindow = this.getTextWindowForTextarea(textarea, translationEditor);
        const targetId = targetWindow?.id;
        
        // Save the translation directly with AI source tracking (no need to buffer first)
        try {
            const confidence = this.verseConfidenceData[verseIndex]?.confidence;
            const averageConfidence = this.calculateAverageConfidence(confidence);
            
            await translationEditor.saveVerse(verseIndex, translation, targetId, {
                source: 'ai_translation',
                confidence: averageConfidence,
                comment: 'AI translation accepted by user'
            });
            
            // Track this save to prevent duplicates in the save system
            if (translationEditor.saveSystem) {
                translationEditor.saveSystem.recentSaves.set(verseIndex, {
                    text: translation,
                    timestamp: Date.now()
                });
            }
            
            // Remove from unsaved changes since it's now saved
            translationEditor.unsavedChanges.delete(verseIndex);
        } catch (error) {
            console.error('Error saving accepted translation:', error);
        }
    }
    
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
    
    rejectTranslation(confidenceDiv, textarea, originalContent, verseIndex, translationEditor) {
        this.cleanupConfidenceDisplay(confidenceDiv, textarea, verseIndex);
        textarea.value = originalContent; // Restore original content
        
        // Track this restoration in the save system to prevent duplicate saves
        if (translationEditor.saveSystem) {
            translationEditor.saveSystem.recentSaves.set(verseIndex, {
                text: originalContent,
                timestamp: Date.now()
            });
        }
        
        textarea.focus();
    }
    
    cleanupConfidenceDisplay(confidenceDiv, textarea, verseIndex) {
        if (confidenceDiv && confidenceDiv.parentElement) {
            // Remove any button overlays first
            const overlays = confidenceDiv.parentElement.querySelectorAll('.absolute.inset-0');
            overlays.forEach(overlay => overlay.remove());
            
            // Remove refinement area if it exists
            if (textarea.refinementArea && textarea.refinementArea.parentElement) {
                textarea.refinementArea.remove();
                delete textarea.refinementArea;
            }
            
            // Replace confidence div with textarea
            confidenceDiv.parentElement.replaceChild(textarea, confidenceDiv);
            textarea.style.display = '';
            textarea.style.visibility = '';
        }
        delete this.verseConfidenceData[verseIndex];
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
            
            const requestBody = {
                text: sourceText,
                source_file_id: sourceWindow.id,
                target_file_id: translationEditor.primaryTextId,
                target_language: project?.target_language,
                project_id: translationEditor.projectId,
                temperature: settings.temperature,
                use_examples: settings.useExamples,
                refinement_prompt: refinementPrompt,
                current_verse_index: verseIndex
            };
            
            const response = await fetch('/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });
            
            const data = await response.json();
            
            if (data.success) {
                // Find the current confidence div and refinement area
                const currentConfidenceDiv = textarea.confidenceDiv;
                const currentRefinementArea = textarea.refinementArea;
                
                if (currentConfidenceDiv) {
                    // Update the confidence segments with the new translation
                    this.renderConfidenceSegments(currentConfidenceDiv, data.confidence?.segments || [{
                        text: data.translation,
                        confidence: 0.2,
                        matching_examples: []
                    }]);
                    
                    // Update stored confidence data
                    this.verseConfidenceData[verseIndex] = {
                        translation: data.translation,
                        confidence: data.confidence
                    };
                    
                    // Update the accept button to use the new translation
                    this.updateButtonOverlay(currentConfidenceDiv, textarea, data.translation, verseIndex, translationEditor);
                    
                    // Clear the refinement textarea since the refinement has been applied
                    if (currentRefinementArea) {
                        const refinementTextarea = currentRefinementArea.querySelector('textarea');
                        if (refinementTextarea) {
                            refinementTextarea.value = '';
                        }
                        
                        // Re-enable and reset the refine button
                        const refineButton = currentRefinementArea.querySelector('button');
                        if (refineButton) {
                            refineButton.disabled = true;
                            refineButton.textContent = 'Refine Translation';
                        }
                        
                        // Re-enable the refinement textarea
                        if (refinementTextarea) {
                            refinementTextarea.disabled = false;
                        }
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