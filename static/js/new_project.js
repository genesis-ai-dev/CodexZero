document.addEventListener('DOMContentLoaded', function() {
    const inputs = document.querySelectorAll('.inline-input');
    
    // Create a hidden span to measure text width
    const measureElement = document.createElement('span');
    measureElement.style.position = 'absolute';
    measureElement.style.visibility = 'hidden';
    measureElement.style.whiteSpace = 'nowrap';
    measureElement.style.fontSize = '3rem'; // Match the new larger form text size
    measureElement.style.fontFamily = 'inherit';
    measureElement.style.fontWeight = '500';
    document.body.appendChild(measureElement);
    
    function adjustInputWidth(input) {
        const value = input.value || input.placeholder;
        measureElement.textContent = value;
        
        const measuredWidth = measureElement.offsetWidth;
        const minWidth = input.classList.contains('wide') ? 200 : 140;
        const newWidth = Math.max(measuredWidth + 30, minWidth); // Add more padding for better visual
        
        input.style.width = newWidth + 'px';
    }

    inputs.forEach((input, index) => {
        // Set initial width
        adjustInputWidth(input);
        
        let typingTimer;
        
        // Adjust width on input
        input.addEventListener('input', () => {
            adjustInputWidth(input);
            
            // Add subtle glow effect while typing
            input.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.15)';
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => {
                input.style.boxShadow = 'none';
            }, 1000);
        });
        
        // Adjust width on focus
        input.addEventListener('focus', () => {
            adjustInputWidth(input);
            input.style.transform = 'scale(1.05)';
        });
        
        // Reset on blur
        input.addEventListener('blur', () => {
            input.style.transform = 'scale(1)';
        });
        
        // Add stagger animation on page load with improved timing
        setTimeout(() => {
            input.style.opacity = '1';
            input.style.transform = 'translateY(0)';
            input.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
        }, index * 200); // Stagger each input by 200ms
        
        // Initial state for animation
        input.style.opacity = '0';
        input.style.transform = 'translateY(20px)';
    });
    
    // Clean up
    window.addEventListener('beforeunload', () => {
        if (document.body.contains(measureElement)) {
            document.body.removeChild(measureElement);
        }
    });
}); 