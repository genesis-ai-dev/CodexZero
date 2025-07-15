// Constants
const FLAG_CONSTANTS = {
    MAX_COMMENT_LENGTH: 5000,
    EMPTY_STATE_MESSAGE: 'No flags for this verse',
    CREATE_FLAG_MESSAGE: 'Create a flag to start a discussion or note an issue',
    NEW_THREAD_MESSAGE: 'Start a new thread',
    NEW_THREAD_SUBTITLE: 'Write your first comment below'
};

// Error handling utility
const ErrorHandler = {
    show(message, type = 'error') {
        // Simple consistent error display - could be enhanced to use toast notifications
        console.error(`Flag System ${type}:`, message);
        alert(`Error: ${message}`);
    },
    
    logAndShow(message, error = null) {
        if (error) {
            console.error('Flag System Error:', message, error);
        }
        this.show(message);
    }
};

class FlagManager {
    constructor() {
        this.currentVerseData = null;
        this.currentTextId = null;
        this.currentFlagId = null;
        this.projectMembers = [];
        this.projectId = window.location.pathname.split('/')[2];
        
        // Cache DOM elements
        this.elements = {
            flagModal: document.getElementById('flag-modal'),
            flagModalTitle: document.getElementById('flag-modal-title'),
            flagsList: document.getElementById('flags-list'),
            flagComments: document.getElementById('flag-comments'),
            flagVerseReference: document.getElementById('flag-verse-reference'),
            flagVerseLabel: document.getElementById('flag-verse-label'),
            flagDetailsStatus: document.getElementById('flag-details-status'),
            flagStatusToggle: document.getElementById('flag-status-toggle'),
            newCommentText: document.getElementById('new-comment-text'),
            mentionDropdown: document.getElementById('mention-dropdown'),
            flagsListView: document.getElementById('flags-list-view'),
            flagDetailsView: document.getElementById('flag-details-view'),
            flagsListFooter: document.getElementById('flags-list-footer'),
            flagDetailsFooter: document.getElementById('flag-details-footer')
        };
        
        this.setupMentionHandlers();
    }
    
    async openFlagModal(verseData, textId) {
        this.currentVerseData = verseData;
        this.currentTextId = textId;
        
        // Show list view
        this.showFlagModalView('list');
        
        this.elements.flagVerseReference.textContent = verseData.reference;
        this.elements.flagModal.classList.remove('hidden');
        
        await this.loadVerseFlags();
    }
    
    showFlagModalView(view) {
        if (view === 'list') {
            // Show list view
            this.elements.flagModalTitle.textContent = 'Verse Flags';
            this.elements.flagVerseLabel.textContent = 'Current Verse:';
            this.elements.flagsListView.classList.remove('hidden');
            this.elements.flagDetailsView.classList.add('hidden');
            this.elements.flagsListFooter.classList.remove('hidden');
            this.elements.flagDetailsFooter.classList.add('hidden');
            this.elements.flagDetailsStatus.classList.add('hidden');
            this.elements.flagStatusToggle.classList.add('hidden');
        } else if (view === 'details') {
            // Show details view
            this.elements.flagModalTitle.textContent = 'Thread';
            this.elements.flagVerseLabel.textContent = 'Associated Verses:';
            this.elements.flagsListView.classList.add('hidden');
            this.elements.flagDetailsView.classList.remove('hidden');
            this.elements.flagsListFooter.classList.add('hidden');
            this.elements.flagDetailsFooter.classList.remove('hidden');
            this.elements.flagDetailsStatus.classList.remove('hidden');
            this.elements.flagStatusToggle.classList.remove('hidden');
        }
    }
    
    async loadVerseFlags() {
        try {
            const response = await fetch(`/project/${this.projectId}/verse/${this.currentTextId}/${this.currentVerseData.index}/flags`);
            const data = await response.json();
            
            this.renderFlagsList(data.flags);
        } catch (error) {
            ErrorHandler.logAndShow('Failed to load flags', error);
            this.renderFlagsList([]);
        }
    }
    
    renderFlagsList(flags) {
        const container = this.elements.flagsList;
        
        if (flags.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-neutral-500">
                    <i class="fas fa-flag text-4xl mb-4 text-neutral-300"></i>
                    <p class="text-lg font-medium">${FLAG_CONSTANTS.EMPTY_STATE_MESSAGE}</p>
                    <p class="text-sm">${FLAG_CONSTANTS.CREATE_FLAG_MESSAGE}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = flags.map(flag => `
            <div class="border border-neutral-200 rounded-xl p-4 hover:bg-neutral-50 transition-all duration-200 cursor-pointer" onclick="openFlagDetails(${flag.id})">
                <div class="flex items-start justify-between mb-3">
                    <div class="flex-1 mr-4">
                        <p class="text-neutral-900 mb-2">${this.escapeHtml(flag.first_comment)}</p>
                        <div class="flex items-center justify-between text-sm text-neutral-600">
                            <span>by ${this.escapeHtml(flag.created_by.name)} • ${this.formatDate(flag.created_at)}</span>
                            <span>${flag.comment_count} comment${flag.comment_count !== 1 ? 's' : ''}</span>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2 flex-shrink-0">
                        ${this.renderStatusBadge(flag.status)}
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    renderStatusBadge(status) {
        const classes = status === 'open' 
            ? 'bg-green-100 text-green-700' 
            : 'bg-gray-100 text-gray-700';
        return `<span class="px-2 py-1 rounded-full text-xs font-medium ${classes}">${status}</span>`;
    }
    

    
    async showNewThreadForm() {
        // Go directly to the thread view with a new thread
        this.currentFlagId = null;
        
        this.elements.flagDetailsStatus.textContent = 'open';
        this.elements.flagDetailsStatus.className = 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700';
        
        this.elements.flagStatusToggle.textContent = 'Close Thread';
        this.elements.flagStatusToggle.style.display = 'none'; // Hide until thread is created
        
        this.elements.flagVerseReference.textContent = `Verse ${this.currentVerseData.verse}`;
        
        // Clear comments and show placeholder
        this.elements.flagComments.innerHTML = `
            <div class="text-center py-8 text-neutral-500">
                <i class="fas fa-comments text-4xl mb-4 text-neutral-300"></i>
                <p class="text-lg font-medium">${FLAG_CONSTANTS.NEW_THREAD_MESSAGE}</p>
                <p class="text-sm">${FLAG_CONSTANTS.NEW_THREAD_SUBTITLE}</p>
            </div>
        `;
        
        // Switch to details view
        this.showFlagModalView('details');
        
        // Focus on comment input and setup mention handlers
        this.elements.newCommentText.focus();
        this.setupMentionHandlersForTextarea(this.elements.newCommentText);
    }
    

    
    async createNewThread(commentText) {
        try {
            const response = await fetch(`/project/${this.projectId}/flags`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    comment_text: commentText,
                    text_id: this.currentTextId,
                    verse_index: this.currentVerseData.index
                })
            });
            
            const data = await response.json();
            if (data.success) {
                this.currentFlagId = data.flag_id;
                this.openFlagDetails(data.flag_id);
            } else {
                ErrorHandler.show(data.error || 'Failed to create thread');
            }
        } catch (error) {
            ErrorHandler.logAndShow('Failed to create thread', error);
        }
    }
    
    async openFlagDetails(flagId) {
        this.currentFlagId = flagId;
        
        try {
            const response = await fetch(`/project/${this.projectId}/flags/${flagId}`);
            const flag = await response.json();
            
            // If modal isn't open, open it first with flag context
            if (this.elements.flagModal.classList.contains('hidden')) {
                this.currentVerseData = { 
                    index: flag.verses[0]?.verse_index || 0,
                    reference: flag.verses.map(v => `Verse ${v.verse_index + 1}`).join(', ')
                };
                this.currentTextId = 'primary'; // Default to primary text
                this.elements.flagModal.classList.remove('hidden');
            }
            
            this.elements.flagDetailsStatus.textContent = flag.status;
            this.elements.flagDetailsStatus.className = `px-3 py-1 rounded-full text-sm font-medium ${this.getStatusClasses(flag.status)}`;
            
            this.elements.flagStatusToggle.textContent = flag.status === 'open' ? 'Close Flag' : 'Reopen Flag';
            
            const versesText = flag.verses.map(v => `Verse ${v.verse_index + 1}`).join(', ');
            this.elements.flagVerseReference.textContent = versesText;
            
            this.renderComments(flag.comments);
            
            // Switch to details view
            this.showFlagModalView('details');
            
            // Setup mention handlers for this modal
            this.setupMentionHandlersForTextarea(this.elements.newCommentText);
        } catch (error) {
            ErrorHandler.logAndShow('Failed to load flag details', error);
        }
    }
    
    renderComments(comments) {
        const container = this.elements.flagComments;
        
        // Clear existing content
        container.innerHTML = '';
        
        if (comments.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-neutral-500">
                    <i class="fas fa-comments text-4xl mb-4 text-neutral-300"></i>
                    <p class="text-lg font-medium">No comments yet</p>
                    <p class="text-sm">Be the first to add a comment</p>
                </div>
            `;
            return;
        }
        
        // Create fragment for better performance
        const fragment = document.createDocumentFragment();
        
        comments.forEach(comment => {
            const commentEl = this.createCommentElement(comment);
            fragment.appendChild(commentEl);
        });
        
        container.appendChild(fragment);
    }
    
    createCommentElement(comment) {
        const commentDiv = document.createElement('div');
        commentDiv.className = 'flex space-x-3 p-4 bg-neutral-50 rounded-xl';
        
        commentDiv.innerHTML = `
            <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                <i class="fas fa-user text-blue-600 text-sm"></i>
            </div>
            <div class="flex-1">
                <div class="flex items-center space-x-2 mb-2">
                    <span class="font-medium text-neutral-900">${this.escapeHtml(comment.user.name)}</span>
                    <span class="text-sm text-neutral-500">${this.formatDate(comment.created_at)}</span>
                    ${comment.edited_at ? `<span class="text-xs text-neutral-400">(edited)</span>` : ''}
                </div>
                <div class="text-neutral-700">${this.renderCommentText(comment.text)}</div>
            </div>
        `;
        
        return commentDiv;
    }
    
    // Method to add single comment (for future use when adding comments)
    addCommentToDisplay(comment) {
        const container = this.elements.flagComments;
        
        // If showing empty state, clear it first
        if (container.querySelector('.text-center')) {
            container.innerHTML = '';
        }
        
        const commentEl = this.createCommentElement(comment);
        container.appendChild(commentEl);
    }
    
    renderCommentText(text) {
        return this.escapeHtml(text).replace(/@(\w+(?:\.\w+)*@\w+(?:\.\w+)+|\w+)/g, 
            '<span class="text-blue-600 font-medium">@$1</span>');
    }
    
    async addComment() {
        const text = this.elements.newCommentText.value.trim();
        
        if (!text) return;
        
        // If no current flag ID, create a new thread
        if (!this.currentFlagId) {
            await this.createNewThread(text);
            return;
        }
        
        try {
            const response = await fetch(`/project/${this.projectId}/flags/${this.currentFlagId}/comments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ comment_text: text })
            });
            
            const data = await response.json();
            if (data.success) {
                this.elements.newCommentText.value = '';
                this.openFlagDetails(this.currentFlagId);
            } else {
                ErrorHandler.show(data.error || 'Failed to add comment');
            }
        } catch (error) {
            ErrorHandler.logAndShow('Failed to add comment', error);
        }
    }
    
    async toggleFlagStatus() {
        const currentStatus = this.elements.flagDetailsStatus.textContent;
        const newStatus = currentStatus === 'open' ? 'closed' : 'open';
        
        try {
            const response = await fetch(`/project/${this.projectId}/flags/${this.currentFlagId}/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus })
            });
            
            const data = await response.json();
            if (data.success) {
                this.openFlagDetails(this.currentFlagId);
            } else {
                ErrorHandler.show(data.error || 'Failed to update flag status');
            }
        } catch (error) {
            ErrorHandler.logAndShow('Failed to update flag status', error);
        }
    }
    
    setupMentionHandlers() {
        // Setup is done dynamically when modals are opened since elements don't exist yet
    }
    
    setupMentionHandlersForTextarea(textarea) {
        if (textarea) {
            textarea.addEventListener('input', (e) => this.handleMentionInput(e));
            textarea.addEventListener('keydown', (e) => this.handleMentionKeydown(e));
        }
    }
    
    async handleMentionInput(event) {
        const textarea = event.target;
        const text = textarea.value;
        const cursorPos = textarea.selectionStart;
        
        const beforeCursor = text.substring(0, cursorPos);
        const atMatch = beforeCursor.match(/@(\w*)$/);
        
        if (atMatch) {
            if (this.projectMembers.length === 0) {
                await this.loadProjectMembers();
            }
            
            const query = atMatch[1].toLowerCase();
            const matches = this.projectMembers.filter(member => 
                member.name.toLowerCase().includes(query) || 
                member.email.toLowerCase().includes(query)
            );
            
            this.showMentionDropdown(textarea, matches, atMatch.index + 1);
        } else {
            this.hideMentionDropdown();
        }
    }
    
    async loadProjectMembers() {
        try {
            const response = await fetch(`/project/${this.projectId}/flags/members`);
            const data = await response.json();
            this.projectMembers = data.members;
        } catch (error) {
            console.error('Error loading project members:', error);
        }
    }
    
    showMentionDropdown(textarea, members, atPos) {
        const dropdown = document.getElementById('mention-dropdown');
        
        if (members.length === 0) {
            this.hideMentionDropdown();
            return;
        }
        
        dropdown.innerHTML = members.map(member => `
            <div class="mention-option px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm" 
                 data-name="${member.name}" data-email="${member.email}">
                <div class="font-medium">${this.escapeHtml(member.name)}</div>
                <div class="text-xs text-neutral-500">${this.escapeHtml(member.email)}</div>
            </div>
        `).join('');
        
        const rect = textarea.getBoundingClientRect();
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = (rect.bottom + 5) + 'px';
        dropdown.classList.remove('hidden');
        
        dropdown.querySelectorAll('.mention-option').forEach(option => {
            option.addEventListener('click', () => this.insertMention(textarea, option, atPos));
        });
    }
    
    insertMention(textarea, option, atPos) {
        const name = option.dataset.name;
        const email = option.dataset.email;
        const mention = email.includes('@') ? `@${email}` : `@${name}`;
        
        const text = textarea.value;
        const beforeAt = text.substring(0, atPos - 1);
        const afterCursor = text.substring(textarea.selectionStart);
        
        textarea.value = beforeAt + mention + ' ' + afterCursor;
        textarea.setSelectionRange(beforeAt.length + mention.length + 1, beforeAt.length + mention.length + 1);
        
        this.hideMentionDropdown();
        textarea.focus();
    }
    
    hideMentionDropdown() {
        this.elements.mentionDropdown.classList.add('hidden');
    }
    
    handleMentionKeydown(event) {
        const dropdown = this.elements.mentionDropdown;
        if (dropdown.classList.contains('hidden')) return;
        
        if (event.key === 'Escape') {
            this.hideMentionDropdown();
            event.preventDefault();
        }
    }
    
    getStatusClasses(status) {
        return status === 'open' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700';
    }
    

    
    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diff = now - date;
        
        if (diff < 86400000) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diff < 604800000) {
            return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    closeFlagModal() {
        this.elements.flagModal.classList.add('hidden');
    }
}

// Module pattern to avoid global pollution
const FlagManagerModule = (() => {
    let instance;
    
    function getInstance() {
        if (!instance) {
            instance = new FlagManager();
        }
        return instance;
    }
    
    // Public API
    return {
        openFlagDetails: (flagId) => getInstance().openFlagDetails(flagId),
        showNewThreadForm: () => getInstance().showNewThreadForm(),
        addComment: () => getInstance().addComment(),
        toggleFlagStatus: () => getInstance().toggleFlagStatus(),
        closeFlagModal: () => getInstance().closeFlagModal(),
        openFlagModal: (verseData, textId) => getInstance().openFlagModal(verseData, textId)
    };
})();

// Global functions for template compatibility (cleaner than updating all templates)
function openFlagDetails(flagId) {
    FlagManagerModule.openFlagDetails(flagId);
}

function showNewThreadForm() {
    FlagManagerModule.showNewThreadForm();
}

function addComment() {
    FlagManagerModule.addComment();
}

function toggleFlagStatus() {
    FlagManagerModule.toggleFlagStatus();
}

function closeFlagModal() {
    FlagManagerModule.closeFlagModal();
}

// Export for other modules
window.FlagManager = FlagManagerModule;

 