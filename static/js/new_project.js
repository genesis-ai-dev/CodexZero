document.addEventListener('DOMContentLoaded', function() {
    const inputs = document.querySelectorAll('.inline-input');
    const nextButton = document.getElementById('next-step');
    const nextButton2 = document.getElementById('next-step-2');
    const prevButton2 = document.getElementById('prev-step-2');
    const prevButton3 = document.getElementById('prev-step-3');
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const step3 = document.getElementById('step-3');
    const languageDisplay = document.getElementById('language-display');
    const targetLanguageInput = document.querySelector('input[name="target_language"]');
    const trainingOptions = document.querySelectorAll('.training-option.available');
    const optionDetails = document.getElementById('option-details');
    const addRuleBtn = document.getElementById('add-rule-btn');
    const rulesContainer = document.getElementById('language-rules-container');
    const ruleTemplate = document.getElementById('rule-template');
    
    let currentStep = 1;
    let ruleCounter = 0;
    
    // Create a hidden span to measure text width
    const measureElement = document.createElement('span');
    measureElement.style.position = 'absolute';
    measureElement.style.visibility = 'hidden';
    measureElement.style.whiteSpace = 'nowrap';
    measureElement.style.fontSize = '2rem'; // Match the form text size
    measureElement.style.fontFamily = 'inherit';
    measureElement.style.fontWeight = '500';
    document.body.appendChild(measureElement);
    
    function adjustInputWidth(input) {
        const value = input.value || input.placeholder;
        measureElement.textContent = value;
        
        const measuredWidth = measureElement.offsetWidth;
        const minWidth = input.classList.contains('wide') ? 200 : 120;
        const newWidth = Math.max(measuredWidth + 20, minWidth); // Add some padding
        
        input.style.width = newWidth + 'px';
    }
    
    function updateStepIndicators() {
        const step1Indicator = document.getElementById('step-indicator-1');
        const step2Indicator = document.getElementById('step-indicator-2');
        const step3Indicator = document.getElementById('step-indicator-3');
        
        // Reset all indicators
        [step1Indicator, step2Indicator, step3Indicator].forEach(indicator => {
            indicator.classList.remove('opacity-100');
            indicator.classList.add('opacity-50');
            indicator.querySelector('span:first-child').classList.remove('bg-neutral-900', 'text-white');
            indicator.querySelector('span:first-child').classList.add('bg-neutral-200', 'text-neutral-500');
            indicator.querySelector('span:last-child').classList.remove('text-neutral-900', 'font-semibold');
            indicator.querySelector('span:last-child').classList.add('text-neutral-500');
        });
        
        // Activate current step
        const currentIndicator = document.getElementById(`step-indicator-${currentStep}`);
        currentIndicator.classList.remove('opacity-50');
        currentIndicator.classList.add('opacity-100');
        currentIndicator.querySelector('span:first-child').classList.remove('bg-neutral-200', 'text-neutral-500');
        currentIndicator.querySelector('span:first-child').classList.add('bg-neutral-900', 'text-white');
        currentIndicator.querySelector('span:last-child').classList.remove('text-neutral-500');
        currentIndicator.querySelector('span:last-child').classList.add('text-neutral-900', 'font-semibold');
    }
    
    function showStep(stepNumber) {
        // Hide all steps
        step1.classList.add('hidden', 'opacity-0', 'translate-x-5');
        step2.classList.add('hidden', 'opacity-0', 'translate-x-5');
        step3.classList.add('hidden', 'opacity-0', 'translate-x-5');
        
        // Show target step
        setTimeout(() => {
            if (stepNumber === 1) {
                step1.classList.remove('hidden');
                setTimeout(() => {
                    step1.classList.remove('opacity-0', 'translate-x-5');
                }, 10);
            } else if (stepNumber === 2) {
                step2.classList.remove('hidden');
                setTimeout(() => {
                    step2.classList.remove('opacity-0', 'translate-x-5');
                }, 10);
                // Update language display from step 1
                const targetLanguage = targetLanguageInput.value;
                if (targetLanguage) {
                    languageDisplay.textContent = targetLanguage;
                }
            } else if (stepNumber === 3) {
                step3.classList.remove('hidden');
                setTimeout(() => {
                    step3.classList.remove('opacity-0', 'translate-x-5');
                }, 10);
            }
        }, 100);
        
        currentStep = stepNumber;
        updateStepIndicators();
        
        // Re-adjust input widths for the new step
        setTimeout(() => {
            const activeInputs = document.querySelectorAll(`#step-${stepNumber} .inline-input`);
            activeInputs.forEach(adjustInputWidth);
        }, 200);
    }
    
    // Language Rules Management
    function createLanguageRule(title = '', description = '', ruleId = null) {
        const template = ruleTemplate.cloneNode(true);
        template.removeAttribute('id');
        template.classList.remove('hidden');
        
        const titleInput = template.querySelector('.rule-title');
        const descriptionTextarea = template.querySelector('.rule-description');
        const charCount = template.querySelector('.char-count');
        const removeBtn = template.querySelector('.remove-rule');
        
        // Set values
        titleInput.value = title;
        descriptionTextarea.value = description;
        charCount.textContent = description.length;
        
        // Set rule ID if editing existing rule
        if (ruleId) {
            template.setAttribute('data-rule-id', ruleId);
        }
        
        // Add unique identifier for new rules
        template.setAttribute('data-rule-index', ruleCounter++);
        
        // Character counting
        descriptionTextarea.addEventListener('input', function() {
            charCount.textContent = this.value.length;
        });
        
        // Remove rule
        removeBtn.addEventListener('click', function() {
            template.remove();
        });
        
        // Auto-resize textarea
        descriptionTextarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.max(this.scrollHeight, 50) + 'px';
        });
        
        return template;
    }
    
    // Add rule button
    if (addRuleBtn) {
        addRuleBtn.addEventListener('click', function() {
            const newRule = createLanguageRule();
            rulesContainer.appendChild(newRule);
            
            // Focus on the title input
            const titleInput = newRule.querySelector('.rule-title');
            titleInput.focus();
        });
    }
    
    // Initialize existing rules (for edit mode)
    document.querySelectorAll('.rule-item').forEach(ruleItem => {
        const charCount = ruleItem.querySelector('.char-count');
        const descriptionTextarea = ruleItem.querySelector('.rule-description');
        const removeBtn = ruleItem.querySelector('.remove-rule');
        
        // Character counting
        descriptionTextarea.addEventListener('input', function() {
            charCount.textContent = this.value.length;
        });
        
        // Remove rule
        removeBtn.addEventListener('click', function() {
            ruleItem.remove();
        });
        
        // Auto-resize textarea
        descriptionTextarea.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.max(this.scrollHeight, 50) + 'px';
        });
    });
    
    // Collect language rules before form submission
    function collectLanguageRules() {
        const rules = [];
        document.querySelectorAll('#language-rules-container .rule-item').forEach((ruleItem, index) => {
            const title = ruleItem.querySelector('.rule-title').value.trim();
            const description = ruleItem.querySelector('.rule-description').value.trim();
            const ruleId = ruleItem.getAttribute('data-rule-id');
            
            if (title || description) {
                rules.push({
                    id: ruleId,
                    title: title,
                    description: description,
                    order_index: index
                });
            }
        });
        return rules;
    }
    
    // Add hidden input with rules data before form submission
    document.addEventListener('submit', function(e) {
        const form = e.target;
        if (form.querySelector('#language-rules-container')) {
            // Remove any existing language rules input
            const existingInput = form.querySelector('input[name="language_rules"]');
            if (existingInput) {
                existingInput.remove();
            }
            
            // Add new input with current rules
            const rulesInput = document.createElement('input');
            rulesInput.type = 'hidden';
            rulesInput.name = 'language_rules';
            rulesInput.value = JSON.stringify(collectLanguageRules());
            form.appendChild(rulesInput);
        }
    });
    
    // Step navigation
    nextButton.addEventListener('click', () => {
        if (currentStep === 1) {
            showStep(2);
        }
    });
    
    nextButton2.addEventListener('click', () => {
        if (currentStep === 2) {
            showStep(3);
        }
    });
    
    prevButton2.addEventListener('click', () => {
        if (currentStep === 2) {
            showStep(1);
        }
    });
    
    prevButton3.addEventListener('click', () => {
        if (currentStep === 3) {
            showStep(2);
        }
    });
    
    // Training option selection
    trainingOptions.forEach(option => {
        option.addEventListener('click', () => {
            // Remove selection from all options
            trainingOptions.forEach(opt => {
                opt.classList.remove('border-neutral-900', 'bg-neutral-50');
                opt.classList.add('border-neutral-200');
            });
            
            // Add selection to clicked option
            option.classList.remove('border-neutral-200');
            option.classList.add('border-neutral-900', 'bg-neutral-50');
            
            // Show option details
            const optionType = option.getAttribute('data-option');
            showOptionDetails(optionType);
        });
    });
    
    function showOptionDetails(optionType) {
        // Hide all option details
        document.querySelectorAll('.option-detail').forEach(detail => {
            detail.classList.add('hidden');
        });
        
        // Show selected option details
        if (optionType === 'ebible' || optionType === 'paste') {
            optionDetails.classList.remove('hidden');
            document.getElementById(`${optionType}-details`).classList.remove('hidden');
        }
    }
    
    // Update language display when target language changes
    targetLanguageInput.addEventListener('input', () => {
        const value = targetLanguageInput.value;
        if (value) {
            languageDisplay.textContent = value;
        } else {
            languageDisplay.textContent = 'this language';
        }
    });
    
    // Character count for textarea
    const textarea = document.querySelector('textarea[name="example_text"]');
    const charCount = document.getElementById('char-count');
    
    if (textarea && charCount) {
        textarea.addEventListener('input', () => {
            const currentLength = textarea.value.length;
            charCount.textContent = `${currentLength.toLocaleString()} / 16,000`;
            
            // Change color when approaching limit
            if (currentLength > 14400) { // 90% of 16000
                charCount.classList.add('text-red-500');
                charCount.classList.remove('text-neutral-500');
            } else if (currentLength > 12000) { // 75% of 16000
                charCount.classList.add('text-orange-500');
                charCount.classList.remove('text-neutral-500', 'text-red-500');
            } else {
                charCount.classList.add('text-neutral-500');
                charCount.classList.remove('text-red-500', 'text-orange-500');
            }
        });
    }

    inputs.forEach((input, index) => {
        // Set initial width
        adjustInputWidth(input);
        
        let typingTimer;
        
        // Adjust width on input
        input.addEventListener('input', () => {
            adjustInputWidth(input);
            
            // Add typing indicator
            input.classList.add('typing');
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                input.classList.remove('typing');
            }, 1000);
        });
        
        // Adjust width on focus (in case placeholder changes)
        input.addEventListener('focus', () => adjustInputWidth(input));
        
        // Add stagger animation on page load
        setTimeout(() => {
            input.style.animation = 'float-in 0.6s ease-out forwards';
        }, index * 150); // Stagger each input by 150ms
    });
    
    // Initialize first step
    showStep(1);
    
    // Clean up
    window.addEventListener('beforeunload', () => {
        document.body.removeChild(measureElement);
    });
}); 