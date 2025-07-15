class FlagManager {
    constructor() {
        this.currentVerseData = null;
        this.currentTextId = null;
        this.currentFlagId = null;
        this.projectMembers = [];
        this.projectId = window.location.pathname.split('/')[2];
        
        this.setupMentionHandlers();
    }
    
    async openFlagModal(verseData, textId) {
        this.currentVerseData = verseData;
        this.currentTextId = textId;
        
        document.getElementById('flag-verse-reference').textContent = verseData.reference;
        document.getElementById('flag-modal').classList.remove('hidden');
        
        await this.loadVerseFlags();
    }
    
    async loadVerseFlags() {
        try {
            const response = await fetch(`/project/${this.projectId}/verse/${this.currentTextId}/${this.currentVerseData.index}/flags`);
            const data = await response.json();
            
            this.renderFlagsList(data.flags);
        } catch (error) {
            console.error('Error loading flags:', error);
            this.renderFlagsList([]);
        }
    }
    
    renderFlagsList(flags) {
        const container = document.getElementById('flags-list');
        
        if (flags.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-neutral-500">
                    <i class="fas fa-flag text-4xl mb-4 text-neutral-300"></i>
                    <p class="text-lg font-medium">No flags for this verse</p>
                    <p class="text-sm">Create a flag to start a discussion or note an issue</p>
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
        
        document.getElementById('flag-details-status').textContent = 'open';
        document.getElementById('flag-details-status').className = 'px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700';
        
        const statusToggle = document.getElementById('flag-status-toggle');
        statusToggle.textContent = 'Close Thread';
        statusToggle.style.display = 'none'; // Hide until thread is created
        
        document.getElementById('flag-details-verses').textContent = `Verse ${this.currentVerseData.verse}`;
        
        // Clear comments and show placeholder
        document.getElementById('flag-comments').innerHTML = `
            <div class="text-center py-8 text-neutral-500">
                <i class="fas fa-comments text-4xl mb-4 text-neutral-300"></i>
                <p class="text-lg font-medium">Start a new thread</p>
                <p class="text-sm">Write your first comment below</p>
            </div>
        `;
        
        document.getElementById('flag-modal').classList.add('hidden');
        document.getElementById('flag-details-modal').classList.remove('hidden');
        
        // Focus on comment input and setup mention handlers
        const commentInput = document.getElementById('new-comment-text');
        commentInput.focus();
        this.setupMentionHandlersForTextarea(commentInput);
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
                alert(data.error || 'Failed to create thread');
            }
        } catch (error) {
            console.error('Error creating thread:', error);
            alert('Failed to create thread');
        }
    }
    
    async openFlagDetails(flagId) {
        this.currentFlagId = flagId;
        
        try {
            const response = await fetch(`/project/${this.projectId}/flags/${flagId}`);
            const flag = await response.json();
            
            document.getElementById('flag-details-status').textContent = flag.status;
            document.getElementById('flag-details-status').className = `px-3 py-1 rounded-full text-sm font-medium ${this.getStatusClasses(flag.status)}`;
            
            const statusToggle = document.getElementById('flag-status-toggle');
            statusToggle.textContent = flag.status === 'open' ? 'Close Flag' : 'Reopen Flag';
            
            const versesText = flag.verses.map(v => `Verse ${v.verse_index + 1}`).join(', ');
            document.getElementById('flag-details-verses').textContent = versesText;
            
            this.renderComments(flag.comments);
            
            document.getElementById('flag-modal').classList.add('hidden');
            document.getElementById('flag-details-modal').classList.remove('hidden');
            
            // Setup mention handlers for this modal
            this.setupMentionHandlersForTextarea(document.getElementById('new-comment-text'));
        } catch (error) {
            console.error('Error loading flag details:', error);
            alert('Failed to load flag details');
        }
    }
    
    renderComments(comments) {
        const container = document.getElementById('flag-comments');
        
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
        
        container.innerHTML = comments.map(comment => `
            <div class="flex space-x-3 p-4 bg-neutral-50 rounded-xl">
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
            </div>
        `).join('');
    }
    
    renderCommentText(text) {
        return this.escapeHtml(text).replace(/@(\w+(?:\.\w+)*@\w+(?:\.\w+)+|\w+)/g, 
            '<span class="text-blue-600 font-medium">@$1</span>');
    }
    
    async addComment() {
        const text = document.getElementById('new-comment-text').value.trim();
        
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
                document.getElementById('new-comment-text').value = '';
                this.openFlagDetails(this.currentFlagId);
            } else {
                alert(data.error || 'Failed to add comment');
            }
        } catch (error) {
            console.error('Error adding comment:', error);
            alert('Failed to add comment');
        }
    }
    
    async toggleFlagStatus() {
        const currentStatus = document.getElementById('flag-details-status').textContent;
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
                alert(data.error || 'Failed to update flag status');
            }
        } catch (error) {
            console.error('Error updating flag status:', error);
            alert('Failed to update flag status');
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
        document.getElementById('mention-dropdown').classList.add('hidden');
    }
    
    handleMentionKeydown(event) {
        const dropdown = document.getElementById('mention-dropdown');
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
        document.getElementById('flag-modal').classList.add('hidden');
    }
    

    
    closeFlagDetailsModal() {
        document.getElementById('flag-details-modal').classList.add('hidden');
    }
}

window.flagManager = new FlagManager();

function openFlagDetails(flagId) {
    window.flagManager.openFlagDetails(flagId);
}

function showNewThreadForm() {
    window.flagManager.showNewThreadForm();
}

function addComment() {
    window.flagManager.addComment();
}

function toggleFlagStatus() {
    window.flagManager.toggleFlagStatus();
}

function closeFlagModal() {
    window.flagManager.closeFlagModal();
}



function closeFlagDetailsModal() {
    window.flagManager.closeFlagDetailsModal();
}

 