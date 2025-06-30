document.addEventListener('DOMContentLoaded', function() {
    const translateBtn = document.getElementById('translate-btn');
    const loadingSection = document.getElementById('loading-section');
    const translationResult = document.getElementById('translation-result');
    const errorSection = document.getElementById('error-section');
    
    // Check if required elements exist
    if (!translateBtn) {
        console.error('Translate button not found');
        return;
    }

    translateBtn.addEventListener('click', async function() {
        const textToTranslate = document.getElementById('text-to-translate')?.value?.trim();
        const targetLanguage = document.getElementById('target-language')?.value;
        const selectedSources = Array.from(document.querySelectorAll('input[name="example-sources"]:checked'))
            .map(checkbox => checkbox.value);

        if (!textToTranslate) {
            showError('Please enter text to translate');
            return;
        }

        if (selectedSources.length === 0) {
            showError('Please select at least one example source');
            return;
        }

        showLoading();

        try {
            const response = await fetch('/translate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: textToTranslate,
                    target_language: targetLanguage,
                    example_sources: selectedSources,
                    project_id: window.location.pathname.split('/')[2]
                })
            });

            const data = await response.json();

            if (data.success) {
                showTranslationResult(data, textToTranslate);
            } else {
                showError('Translation failed: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error:', error);
            showError('An error occurred during translation');
        }
    });

    // Reset/translate another button functionality
    const translateAnotherBtn = document.getElementById('translate-another-btn');
    if (translateAnotherBtn) {
        translateAnotherBtn.addEventListener('click', function() {
            resetForm();
        });
    }

    function showLoading() {
        hideAllSections();
        if (loadingSection) {
            loadingSection.classList.remove('hidden');
        }
    }

    function showTranslationResult(data, originalText) {
        hideAllSections();
        
        if (translationResult) {
            // Populate result fields
            const originalTextEl = document.getElementById('original-text');
            const translatedTextEl = document.getElementById('translated-text');
            const translationMetaEl = document.getElementById('translation-meta');
            
            if (originalTextEl) originalTextEl.textContent = originalText;
            
            // Handle confidence visualization
            if (data.confidence && translatedTextEl) {
                console.log('Confidence data received:', data.confidence);
                displayTranslationWithConfidence(translatedTextEl, data.translation, data.confidence);
                showConfidenceIndicator(data.confidence.overall_confidence);
            } else if (translatedTextEl) {
                translatedTextEl.textContent = data.translation;
            }
            
            if (translationMetaEl) {
                const sourceCount = data.sources ? data.sources.length : 0;
                const exampleCount = data.examples_used || 0;
                let metaText = `Generated using ${exampleCount} examples from ${sourceCount} source(s)`;
                
                if (data.confidence) {
                    const coverage = data.confidence.coverage_stats;
                    metaText += ` • Coverage: ${coverage.covered_chars}/${coverage.total_chars} characters`;
                }
                
                translationMetaEl.textContent = metaText;
            }
            
            translationResult.classList.remove('hidden');
        }
    }
    
    function displayTranslationWithConfidence(container, translation, confidence) {
        container.innerHTML = '';
        
        if (!confidence.segments || confidence.segments.length === 0) {
            container.textContent = translation;
            return;
        }
        
        const tooltip = document.getElementById('custom-tooltip');
        const tooltipContent = document.getElementById('tooltip-content');
        let popperInstance = null;
        let showTimeout, hideTimeout;

        confidence.segments.forEach(segment => {
            const span = document.createElement('span');
            span.textContent = segment.text;
            
            // Apply smooth color gradient
            const colors = getConfidenceColors(segment.confidence);
            span.style.color = colors.text;
            span.style.backgroundColor = colors.background;
            span.style.padding = '1px 2px';
            span.style.borderRadius = '3px';
            
            if (segment.sources && segment.sources.length > 0) {
                span.style.cursor = 'pointer';

                span.addEventListener('mouseenter', (event) => {
                    clearTimeout(hideTimeout);
                    showTimeout = setTimeout(() => {
                        // Build tooltip content
                        tooltipContent.innerHTML = '<div id="tooltip-header">Matching Examples</div>';
                        segment.sources.forEach(source => {
                            const target = source.original;
                            const preMatch = target.substring(0, source.match_start);
                            const match = target.substring(source.match_start, source.match_end);
                            const postMatch = target.substring(source.match_end);
                            const highlightedTargetHTML = `${preMatch}<strong class="tooltip-highlight">${match}</strong>${postMatch}`;

                            const sourceDiv = document.createElement('div');
                            sourceDiv.className = 'tooltip-source';
                            sourceDiv.innerHTML = `
                                <div class="tooltip-source-eng">"${source.english}"</div>
                                <div class="tooltip-source-target">→ ${highlightedTargetHTML}</div>
                            `;
                            tooltipContent.appendChild(sourceDiv);
                        });

                        // Create and show tooltip with Popper
                        tooltip.classList.remove('hidden');
                        popperInstance = Popper.createPopper(event.target, tooltip, {
                            placement: 'bottom-start',
                            modifiers: [{ name: 'offset', options: { offset: [0, 8] } }],
                        });
                    }, 200); // 200ms delay before showing
                });

                span.addEventListener('mouseleave', () => {
                    clearTimeout(showTimeout);
                    hideTimeout = setTimeout(() => {
                        tooltip.classList.add('hidden');
                        if (popperInstance) {
                            popperInstance.destroy();
                            popperInstance = null;
                        }
                    }, 300); // 300ms delay before hiding
                });
            }
            
            container.appendChild(span);
        });
        
        // Ensure tooltip hides if mouse leaves to it
        tooltip.addEventListener('mouseenter', () => clearTimeout(hideTimeout));
        tooltip.addEventListener('mouseleave', () => {
            hideTimeout = setTimeout(() => {
                tooltip.classList.add('hidden');
                if (popperInstance) {
                    popperInstance.destroy();
                    popperInstance = null;
                }
            }, 300);
        });
    }
    
    function getConfidenceColors(confidence) {
        // Smooth gradient from red (0%) to green (100%)
        const percentage = Math.max(0, Math.min(100, confidence));
        
        if (percentage === 0) {
            return {
                text: '#991b1b',
                background: '#fef2f2'
            };
        }
        
        // Calculate RGB values for smooth gradient
        // Red to Yellow to Green transition
        let red, green, blue;
        
        if (percentage <= 50) {
            // Red to Yellow (0-50%)
            const factor = percentage / 50;
            red = 255;
            green = Math.round(255 * factor);
            blue = 0;
        } else {
            // Yellow to Green (50-100%)
            const factor = (percentage - 50) / 50;
            red = Math.round(255 * (1 - factor));
            green = 255;
            blue = 0;
        }
        
        // Adjust for text readability
        const textRed = Math.round(red * 0.6);
        const textGreen = Math.round(green * 0.6);
        const textBlue = Math.round(blue * 0.6);
        
        // Adjust background for subtle highlighting
        const bgRed = Math.round(255 - (255 - red) * 0.15);
        const bgGreen = Math.round(255 - (255 - green) * 0.15);
        const bgBlue = Math.round(255 - (255 - blue) * 0.15);
        
        return {
            text: `rgb(${textRed}, ${textGreen}, ${textBlue})`,
            background: `rgb(${bgRed}, ${bgGreen}, ${bgBlue})`
        };
    }
    
    function showConfidenceIndicator(overallConfidence) {
        const indicatorEl = document.getElementById('confidence-indicator');
        const fillEl = document.getElementById('confidence-fill');
        const percentageEl = document.getElementById('confidence-percentage');
        
        if (indicatorEl && fillEl && percentageEl) {
            // Show the indicator
            indicatorEl.classList.remove('hidden');
            
            // Update the progress bar
            fillEl.style.width = `${overallConfidence}%`;
            
            // Color the bar based on confidence level
            if (overallConfidence < 30) {
                fillEl.style.backgroundColor = '#dc2626'; // Red
            } else if (overallConfidence < 70) {
                fillEl.style.backgroundColor = '#d97706'; // Orange
            } else {
                fillEl.style.backgroundColor = '#059669'; // Green
            }
            
            // Update percentage text
            percentageEl.textContent = `${overallConfidence}%`;
        }
    }

    function showError(message) {
        hideAllSections();
        
        if (errorSection) {
            const errorMessageEl = document.getElementById('error-message');
            if (errorMessageEl) {
                errorMessageEl.textContent = message;
            }
            errorSection.classList.remove('hidden');
        } else {
            // Fallback to alert if error section doesn't exist
            alert(message);
        }
    }

    function hideAllSections() {
        [loadingSection, translationResult, errorSection].forEach(section => {
            if (section) {
                section.classList.add('hidden');
            }
        });
    }

    function resetForm() {
        hideAllSections();
        
        const textToTranslateEl = document.getElementById('text-to-translate');
        if (textToTranslateEl) {
            textToTranslateEl.value = '';
            textToTranslateEl.focus();
        }
        
        // Hide confidence indicators
        const confidenceIndicator = document.getElementById('confidence-indicator');
        if (confidenceIndicator) confidenceIndicator.classList.add('hidden');
        
        // Uncheck all example sources
        document.querySelectorAll('input[name="example-sources"]').forEach(checkbox => {
            checkbox.checked = false;
        });
    }

    // Auto-focus on text area
    const textToTranslateEl = document.getElementById('text-to-translate');
    if (textToTranslateEl) {
        textToTranslateEl.focus();
    }
}); 