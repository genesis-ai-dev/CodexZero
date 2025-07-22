// Enhanced auto-resize for textareas
function autoResize(textarea) {
    if (!textarea || !textarea.classList.contains('auto-resize-textarea')) {
        return;
    }
    
    // Reset height to auto to get the natural content height
    textarea.style.height = 'auto';
    
    // Set height to scrollHeight to fit content
    const newHeight = Math.max(textarea.scrollHeight, 60); // Minimum 60px
    textarea.style.height = newHeight + 'px';
}

// Initialize auto-resize functionality
document.addEventListener('DOMContentLoaded', function() {
    // Handle existing textareas
    document.querySelectorAll('.auto-resize-textarea').forEach(autoResize);
    
    // Handle new textareas and input events with improved performance
    document.addEventListener('input', function(e) {
        if (e.target.classList.contains('auto-resize-textarea')) {
            // Use requestAnimationFrame for smoother resizing
            requestAnimationFrame(() => autoResize(e.target));
        }
    });
    
    // Also handle paste events
    document.addEventListener('paste', function(e) {
        if (e.target.classList.contains('auto-resize-textarea')) {
            // Small delay to allow paste to complete
            setTimeout(() => autoResize(e.target), 10);
        }
    });
    
    // Handle when textareas are dynamically added to the DOM
    const observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType === 1) { // Element node
                    // Check if the added node is an auto-resize textarea
                    if (node.classList && node.classList.contains('auto-resize-textarea')) {
                        autoResize(node);
                    }
                    // Check for auto-resize textareas within the added node
                    const textareas = node.querySelectorAll && node.querySelectorAll('.auto-resize-textarea');
                    if (textareas) {
                        textareas.forEach(autoResize);
                    }
                }
            });
        });
    });
    
    // Observe the document for new textareas
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});

// Export for manual use
window.autoResize = autoResize; 