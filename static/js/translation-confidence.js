// Translation Confidence Display System
class TranslationConfidence {
    constructor() {
        this.verseConfidenceData = {};
    }
    
    displayTranslationWithConfidence(textarea, translation, confidence, verseIndex, translationEditor) {
        // Ensure we have confidence data
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
        
        this.renderConfidenceSegments(confidenceDiv, confidence.segments);
        this.replaceTextareaWithConfidence(textarea, confidenceDiv, buttonOverlay);
        
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
        container.className = 'absolute top-2 right-2 flex space-x-1 pointer-events-auto';
        
        const acceptBtn = this.createButton('✓', 'Accept translation', 'bg-green-500 hover:bg-green-600', () => {
            this.acceptTranslation(confidenceDiv, textarea, translation, verseIndex, translationEditor);
            overlay.remove();
        });
        
        const rejectBtn = this.createButton('✗', 'Reject translation', 'bg-red-500 hover:bg-red-600', () => {
            this.rejectTranslation(confidenceDiv, textarea, originalContent, verseIndex, translationEditor);
            overlay.remove();
        });
        
        container.appendChild(acceptBtn);
        container.appendChild(rejectBtn);
        overlay.appendChild(container);
        
        return overlay;
    }
    
    createButton(text, title, colorClasses, onClick) {
        const button = document.createElement('button');
        button.className = `w-6 h-6 ${colorClasses} text-white text-xs rounded-full transition-colors flex items-center justify-center shadow-lg`;
        button.textContent = text;
        button.title = title;
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return button;
    }
    
    renderConfidenceSegments(confidenceDiv, segments) {
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
    
    replaceTextareaWithConfidence(textarea, confidenceDiv, buttonOverlay) {
        textarea.style.display = 'none';
        textarea.parentElement.insertBefore(confidenceDiv, textarea.nextSibling);
        textarea.parentElement.insertBefore(buttonOverlay, textarea.nextSibling);
        textarea.confidenceDiv = confidenceDiv;
    }

    async acceptTranslation(confidenceDiv, textarea, translation, verseIndex, translationEditor) {
        this.cleanupConfidenceDisplay(confidenceDiv, textarea, verseIndex);
        textarea.value = translation;
        
        // Buffer the change for save tracking
        translationEditor.bufferVerseChange(verseIndex, translation);
        
        // Auto-save the translation when accepted
        try {
            await translationEditor.saveVerse(verseIndex, translation);
            // Remove from unsaved changes since it's now saved
            translationEditor.unsavedChanges.delete(verseIndex);
            translationEditor.updateSaveButtonState();
        } catch (error) {
            console.error('Error saving accepted translation:', error);
        }
    }
    
    rejectTranslation(confidenceDiv, textarea, originalContent, verseIndex, translationEditor) {
        this.cleanupConfidenceDisplay(confidenceDiv, textarea, verseIndex);
        textarea.value = originalContent; // Restore original content
        translationEditor.bufferVerseChange(verseIndex, originalContent); // Track the restoration
        textarea.focus();
    }
    
    cleanupConfidenceDisplay(confidenceDiv, textarea, verseIndex) {
        confidenceDiv.remove();
        // Also remove button overlay if it exists
        const buttonOverlay = textarea.parentElement.querySelector('.absolute.inset-0');
        if (buttonOverlay) {
            buttonOverlay.remove();
        }
        textarea.style.display = 'block';
        delete this.verseConfidenceData[verseIndex];
        delete textarea.confidenceDiv;
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