// Constants
const FLAG_CONSTANTS = {
    MAX_COMMENT_LENGTH: 5000,
    EMPTY_STATE_MESSAGE: 'No flags for this verse',
    CREATE_FLAG_MESSAGE: 'Create a flag to start a discussion or note an issue'
};

// Error handling utility
const ErrorHandler = {
    show(message, type = 'error') {
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
            flagsCount: document.getElementById('flags-count'),
            flagComments: document.getElementById('flag-comments'),
            flagVerseReference: document.getElementById('flag-verse-reference'),
            flagDetailsStatus: document.getElementById('flag-details-status'),
            flagStatusToggle: document.getElementById('flag-status-toggle'),
            newCommentText: document.getElementById('new-comment-text'),
            commentCharCount: document.getElementById('comment-char-count'),
            mentionDropdown: document.getElementById('mention-dropdown'),
            flagsListView: document.getElementById('flags-list-view'),
            flagDetailsView: document.getElementById('flag-details-view'),
            newThreadBtn: document.getElementById('new-thread-btn'),
            backToListBtn: document.getElementById('back-to-list-btn'),
            flagVerseCellContainer: document.getElementById('flag-verse-cell-container'),
            resolutionResolved: document.getElementById('resolution-resolved'),
            resolutionUnresolved: document.getElementById('resolution-unresolved')
        };
        
        this.setupCommentCharCounter();
    }
    
    async openFlagModal(verseData, textId) {
        this.currentVerseData = verseData;
        this.currentTextId = textId;
        
        // Show list view
        this.showFlagModalView('list');
        
        // Set verse information
        this.elements.flagVerseReference.textContent = verseData.reference;
        this.elements.flagModal.classList.remove('hidden');
        
        // Create verse cell using proper verse cell structure
        await this.createVerseCell();
        
        // Refresh verse content from database to ensure we have the latest version
        await this.refreshVerseContent();
        
        // Load flags for this verse
        await this.loadVerseFlags();
    }
    
    showFlagModalView(view) {
        if (view === 'list') {
            this.elements.flagModalTitle.textContent = 'Flags';
            this.elements.flagsListView.classList.remove('hidden');
            this.elements.flagDetailsView.classList.add('hidden');
            this.elements.newThreadBtn.classList.remove('hidden');
            this.elements.backToListBtn.classList.add('hidden');
        } else if (view === 'details') {
            this.elements.flagModalTitle.textContent = 'Flag Details';
            this.elements.flagsListView.classList.add('hidden');
            this.elements.flagDetailsView.classList.remove('hidden');
            this.elements.newThreadBtn.classList.add('hidden');
            this.elements.backToListBtn.classList.remove('hidden');
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
        
        // Update flags count
        if (this.elements.flagsCount) {
            this.elements.flagsCount.textContent = `${flags.length} flag${flags.length !== 1 ? 's' : ''}`;
        }
        
        if (flags.length === 0) {
            container.innerHTML = `
                <div class="text-center py-16 text-slate-500">
                    <div class="w-20 h-20 mx-auto mb-6 bg-slate-100 rounded-2xl flex items-center justify-center">
                        <i class="fas fa-flag text-slate-400 text-3xl"></i>
                    </div>
                    <p class="text-xl font-semibold mb-3">No flags yet</p>
                    <p class="text-base">Create a flag to report an issue or start a discussion about this verse</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = flags.map(flag => `
            <div class="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-lg hover:border-slate-300 transition-all cursor-pointer group" onclick="openFlagDetails(${flag.id})">
                <div class="flex items-start justify-between mb-4">
                    <div class="flex items-center space-x-3">
                        ${this.renderStatusBadge(flag.status, flag.current_user_resolution?.status)}
                    </div>
                    <span class="text-sm text-slate-500 font-medium">${this.formatDate(flag.created_at)}</span>
                </div>
                <div class="mb-4">
                    <p class="text-slate-800 leading-relaxed mb-3 line-clamp-3 text-base">${this.escapeHtml(flag.first_comment)}</p>
                    <div class="flex items-center justify-between text-sm text-slate-500">
                        <div class="flex items-center space-x-4">
                            <span class="flex items-center font-medium">
                                <i class="fas fa-user mr-2"></i>
                                ${this.escapeHtml(flag.created_by.name)}
                            </span>
                            <span class="flex items-center font-medium">
                                <i class="fas fa-comments mr-2"></i>
                                ${flag.comment_count} ${flag.comment_count === 1 ? 'comment' : 'comments'}
                            </span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center justify-end">
                    <div class="text-sm text-slate-400 group-hover:text-red-500 transition-colors font-medium">
                        Click to view flag <i class="fas fa-arrow-right ml-2"></i>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    renderStatusBadge(status, userResolution = null) {
        // If user has a resolution, show that prominently
        if (userResolution) {
            const resolutionClasses = {
                'resolved': 'bg-green-100 text-green-800',
                'unresolved': 'bg-orange-100 text-orange-800', 
                'not_relevant': 'bg-gray-100 text-gray-700'
            };
            const resolutionText = {
                'resolved': 'Resolved',
                'unresolved': 'Unresolved',
                'not_relevant': 'Not Relevant'
            };
            return `<span class="px-3 py-1.5 rounded-full text-sm font-semibold ${resolutionClasses[userResolution]}">${resolutionText[userResolution]}</span>`;
        }
        
        // Fallback to flag status for users who haven't resolved
        const classes = status === 'open' 
            ? 'bg-blue-100 text-blue-800' 
            : 'bg-gray-100 text-gray-700';
        return `<span class="px-3 py-1.5 rounded-full text-sm font-semibold ${classes}">${status}</span>`;
    }
    
    async showNewThreadForm() {
        this.currentFlagId = null;
        
        this.elements.flagDetailsStatus.textContent = 'open';
        this.elements.flagDetailsStatus.className = 'px-3 py-1.5 rounded-full text-sm font-semibold bg-green-100 text-green-800';
        this.elements.flagDetailsStatus.classList.remove('hidden');
        
        this.elements.flagStatusToggle.textContent = 'Close Flag';
        this.elements.flagStatusToggle.classList.add('hidden'); // Hide until flag is created
        
        // Clear comments and show placeholder
        this.elements.flagComments.innerHTML = `
            <div class="text-center py-12 text-slate-500">
                <i class="fas fa-flag text-5xl mb-6 text-slate-300"></i>
                <p class="text-xl font-semibold mb-2">Start a new flag</p>
                <p class="text-base">Write your first comment below to create this flag</p>
            </div>
        `;
        
        // Switch to details view
        this.showFlagModalView('details');
        
        // Focus on comment input
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
                await this.openFlagDetails(data.flag_id);
            } else {
                ErrorHandler.show(data.error || 'Failed to create flag');
            }
        } catch (error) {
            ErrorHandler.logAndShow('Failed to create flag', error);
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
                await this.createVerseCell();
            }
            
            this.elements.flagDetailsStatus.textContent = flag.status;
            this.elements.flagDetailsStatus.className = `px-3 py-1.5 rounded-full text-sm font-semibold ${this.getStatusClasses(flag.status)}`;
            this.elements.flagDetailsStatus.classList.remove('hidden');
            
            const flagStatusButton = this.elements.flagStatusToggle;
            if (flagStatusButton) {
                if (flag.status === 'open') {
                    flagStatusButton.innerHTML = '<i class="fas fa-crown mr-1"></i>Admin Close';
                    flagStatusButton.className = 'px-4 py-2 text-sm font-medium bg-red-50 text-red-600 border border-red-200 rounded-lg hover:bg-red-100 transition-colors';
                } else {
                    flagStatusButton.innerHTML = '<i class="fas fa-crown mr-1"></i>Admin Reopen';
                    flagStatusButton.className = 'px-4 py-2 text-sm font-medium bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors';
                }
            }
            this.elements.flagStatusToggle.classList.remove('hidden');
            
            this.renderTimeline(flag.timeline);
            this.updateResolutionButtons(flag.current_user_resolution);
            
            // Switch to details view
            this.showFlagModalView('details');
            
            // Setup mention handlers
            this.setupMentionHandlersForTextarea(this.elements.newCommentText);
        } catch (error) {
            ErrorHandler.logAndShow('Failed to load flag details', error);
        }
    }
    
    renderTimeline(timeline) {
        const container = this.elements.flagComments;
        
        if (!timeline || timeline.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12 text-slate-500">
                    <div class="w-16 h-16 mx-auto mb-4 bg-slate-200 rounded-full flex items-center justify-center">
                        <i class="fas fa-comments text-slate-400 text-2xl"></i>
                    </div>
                    <p class="text-lg font-medium">No messages yet</p>
                    <p class="text-sm">Be the first to comment on this flag</p>
                </div>
            `;
            return;
        }
        
        // Group consecutive revisions and consecutive messages by same user
        const groupedTimeline = this.groupConsecutiveItems(timeline);
        
        container.innerHTML = groupedTimeline.map(group => {
            if (group.type === 'comment') {
                return this.renderDiscordMessage(group, false); // First message shows username
            } else if (group.type === 'comment_group') {
                return group.comments.map((comment, index) => 
                    this.renderDiscordMessage(comment, index > 0) // Only first shows username
                ).join('');
            } else if (group.type === 'revision_group') {
                return this.renderRevisionGroup(group);
            }
        }).join('');
    }
    
    renderDiscordMessage(comment, isGrouped = false) {
        const commentText = comment.text.replace(
            /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
            '<span class="text-indigo-600 font-medium bg-indigo-50 px-1 rounded">@$1</span>'
        );
        
        // Generate a consistent avatar color based on user name
        const avatarColor = this.getUserAvatarColor(comment.user.name);
        const userInitials = this.getUserInitials(comment.user.name);
        
        // Format timestamp in Discord style
        const timestamp = this.formatDiscordTimestamp(comment.created_at);
        
        if (isGrouped) {
            // Grouped message - same indentation as main messages
            return `
                <div class="hover:bg-slate-100/50 transition-colors py-0.5">
                    <div class="flex">
                        <!-- Avatar space (invisible to maintain alignment) -->
                        <div class="w-8 h-8 mr-2"></div>
                        
                        <!-- Message Content -->
                        <div class="flex-1">
                            <div class="text-slate-800 leading-tight text-sm group">
                                ${commentText}
                                <span class="text-xs text-slate-400 opacity-0 group-hover:opacity-100 ml-2" title="${this.formatDiscordTimestamp(comment.created_at)}">${timestamp}</span>
                                ${comment.edited_at ? `
                                    <span class="text-xs text-slate-400 bg-slate-100 px-1 py-0.5 rounded ml-1" title="Edited ${this.formatDate(comment.edited_at)}">
                                        edited
                                    </span>
                                ` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // First message from user - show full header
            return `
                <div class="hover:bg-slate-100/50 transition-colors py-1">
                    <div class="flex">
                        <!-- User Avatar -->
                        <div class="w-8 h-8 mr-2">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs ${avatarColor}">
                                ${userInitials}
                            </div>
                        </div>
                        
                        <!-- Message Content -->
                        <div class="flex-1">
                            <!-- Message Header -->
                            <div class="flex items-baseline gap-1 mb-1">
                                <span class="font-semibold text-slate-900 text-sm">${this.escapeHtml(comment.user.name)}</span>
                                <span class="text-xs text-slate-500">${timestamp}</span>
                                ${comment.edited_at ? `
                                    <span class="text-xs text-slate-400 bg-slate-100 px-1 py-0.5 rounded" title="Edited ${this.formatDate(comment.edited_at)}">
                                        edited
                                    </span>
                                ` : ''}
                            </div>
                            
                            <!-- Message Body -->
                            <div class="text-slate-800 leading-tight text-sm">
                                ${commentText}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
    }
    
    renderRevisionGroup(group) {
        const firstRevision = group.revisions[0];
        const revisionCount = group.revisions.length;
        const avatarColor = this.getUserAvatarColor(firstRevision.user.name);
        const userInitials = this.getUserInitials(firstRevision.user.name);
        const timestamp = this.formatDiscordTimestamp(firstRevision.created_at);
        
        return `
            <div class="flex space-x-2 group hover:bg-emerald-50/50 px-2 py-1 -mx-2 rounded transition-colors">
                <!-- User Avatar -->
                <div class="flex-shrink-0">
                    <div class="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-xs ${avatarColor} relative">
                        ${userInitials}
                        <div class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full flex items-center justify-center">
                            <i class="fas fa-pencil-alt text-white text-xs"></i>
                        </div>
                    </div>
                </div>
                
                <!-- Revision Content -->
                <div class="flex-1 min-w-0">
                    <!-- Revision Header -->
                    <div class="flex items-baseline space-x-1 mb-1">
                        <span class="font-semibold text-slate-900 text-sm">${this.escapeHtml(firstRevision.user.name)}</span>
                        <span class="text-sm text-emerald-600 font-medium">
                            ${revisionCount === 1 ? 'made a revision' : `made ${revisionCount} revisions`}
                        </span>
                        <span class="text-xs text-slate-500 font-medium">${timestamp}</span>
                        ${revisionCount > 1 ? `
                            <span class="text-xs text-slate-500">
                                - ${this.formatDiscordTimestamp(group.revisions[revisionCount-1].created_at)}
                            </span>
                        ` : ''}
                    </div>
                    
                    <!-- Revision Summary Card -->
                    <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-2 mb-1">
                        <div class="flex items-center justify-between cursor-pointer" onclick="this.querySelector('.revision-toggle').click()">
                            <div class="flex items-center space-x-2">
                                <button class="revision-toggle text-emerald-600 hover:text-emerald-800 transition-colors" onclick="event.stopPropagation(); this.closest('.group').querySelector('.revision-details').classList.toggle('hidden'); this.querySelector('i').classList.toggle('fa-chevron-right'); this.querySelector('i').classList.toggle('fa-chevron-down');">
                                    <i class="fas fa-chevron-right text-sm"></i>
                                </button>
                                <span class="text-sm font-medium text-emerald-800">
                                    View ${revisionCount === 1 ? 'revision' : `${revisionCount} revisions`}
                                </span>
                            </div>
                            <div class="text-xs text-emerald-600 bg-emerald-100 px-2 py-1 rounded-full">
                                ${revisionCount} change${revisionCount !== 1 ? 's' : ''}
                            </div>
                        </div>
                    </div>
                    
                    <!-- Detailed Revisions (Hidden by default) -->
                    <div class="revision-details hidden space-y-2 ml-3 pl-3 border-l-2 border-emerald-200">
                        ${group.revisions.map(revision => {
                            const editTypeLabel = {
                                'create': 'edited verse',
                                'update': 'edited verse',
                                'delete': 'edited verse',
                                'revert': 'reverted verse'
                            }[revision.edit_type] || 'edited verse';
                            
                            return `
                                <div class="bg-white border border-emerald-200 rounded-lg p-3 shadow-sm">
                                    <div class="flex items-center justify-between mb-2">
                                        <div class="flex items-center space-x-2">
                                            <div class="w-2 h-2 bg-emerald-500 rounded-full"></div>
                                            <span class="text-sm font-medium text-emerald-700">${editTypeLabel}</span>
                                        </div>
                                        <span class="text-xs text-slate-500">${this.formatDiscordTimestamp(revision.created_at)}</span>
                                    </div>
                                    ${revision.edit_comment ? `
                                        <div class="text-sm text-slate-600 italic mb-2 bg-slate-50 p-2 rounded border-l-4 border-slate-300">
                                            "${this.escapeHtml(revision.edit_comment)}"
                                        </div>
                                    ` : ''}
                                    <div class="bg-slate-50 border border-slate-200 rounded-lg p-3">
                                        <div class="text-xs text-slate-500 mb-1 font-medium">VERSE TEXT</div>
                                        <div class="text-slate-800 text-sm leading-relaxed font-mono">
                                            ${this.escapeHtml(revision.new_text)}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            </div>
        `;
    }
    
    groupConsecutiveRevisions(timeline) {
        const grouped = [];
        let currentRevisionGroup = null;
        
        for (const item of timeline) {
            if (item.type === 'verse_edit') {
                // Check if we can add to current group (same user and consecutive)
                if (currentRevisionGroup && 
                    currentRevisionGroup.user.id === item.user.id) {
                    currentRevisionGroup.revisions.push(item);
                } else {
                    // Start new revision group
                    if (currentRevisionGroup) {
                        grouped.push(currentRevisionGroup);
                    }
                    currentRevisionGroup = {
                        type: 'revision_group',
                        user: item.user,
                        revisions: [item]
                    };
                }
            } else {
                // Non-revision item, close current group if exists
                if (currentRevisionGroup) {
                    grouped.push(currentRevisionGroup);
                    currentRevisionGroup = null;
                }
                grouped.push(item);
            }
        }
        
        // Don't forget the last group
        if (currentRevisionGroup) {
            grouped.push(currentRevisionGroup);
        }
        
        return grouped;
    }
    
    groupConsecutiveItems(timeline) {
        const grouped = [];
        let currentRevisionGroup = null;
        let currentCommentGroup = null;
        
        for (const item of timeline) {
            if (item.type === 'verse_edit') {
                // Close any current comment group
                if (currentCommentGroup) {
                    if (currentCommentGroup.comments.length === 1) {
                        grouped.push(currentCommentGroup.comments[0]);
                    } else {
                        grouped.push(currentCommentGroup);
                    }
                    currentCommentGroup = null;
                }
                
                // Handle revision grouping
                if (currentRevisionGroup && 
                    currentRevisionGroup.user.id === item.user.id) {
                    currentRevisionGroup.revisions.push(item);
                } else {
                    if (currentRevisionGroup) {
                        grouped.push(currentRevisionGroup);
                    }
                    currentRevisionGroup = {
                        type: 'revision_group',
                        user: item.user,
                        revisions: [item]
                    };
                }
            } else if (item.type === 'comment') {
                // Close any current revision group
                if (currentRevisionGroup) {
                    grouped.push(currentRevisionGroup);
                    currentRevisionGroup = null;
                }
                
                // Handle comment grouping
                if (currentCommentGroup && 
                    currentCommentGroup.user.id === item.user.id) {
                    currentCommentGroup.comments.push(item);
                } else {
                    if (currentCommentGroup) {
                        if (currentCommentGroup.comments.length === 1) {
                            grouped.push(currentCommentGroup.comments[0]);
                        } else {
                            grouped.push(currentCommentGroup);
                        }
                    }
                    currentCommentGroup = {
                        type: 'comment_group',
                        user: item.user,
                        comments: [item]
                    };
                }
            } else {
                // Other item types, close current groups
                if (currentRevisionGroup) {
                    grouped.push(currentRevisionGroup);
                    currentRevisionGroup = null;
                }
                if (currentCommentGroup) {
                    if (currentCommentGroup.comments.length === 1) {
                        grouped.push(currentCommentGroup.comments[0]);
                    } else {
                        grouped.push(currentCommentGroup);
                    }
                    currentCommentGroup = null;
                }
                grouped.push(item);
            }
        }
        
        // Don't forget the last groups
        if (currentRevisionGroup) {
            grouped.push(currentRevisionGroup);
        }
        if (currentCommentGroup) {
            if (currentCommentGroup.comments.length === 1) {
                grouped.push(currentCommentGroup.comments[0]);
            } else {
                grouped.push(currentCommentGroup);
            }
        }
        
        return grouped;
    }
    
    async addComment() {
        const text = this.elements.newCommentText.value.trim();
        
        if (!text) return;
        
        // If no current flag ID, create a new flag
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
                await this.openFlagDetails(this.currentFlagId);
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
                await this.openFlagDetails(this.currentFlagId);
            } else {
                ErrorHandler.show(data.error || 'Failed to update flag status');
            }
        } catch (error) {
            ErrorHandler.logAndShow('Failed to update flag status', error);
        }
    }
    
    // Create verse cell using the same structure as text-window.js
    async createVerseCell() {
        if (!this.currentVerseData || !this.currentTextId) return;
        
        // Clear existing content
        this.elements.flagVerseCellContainer.innerHTML = '';
        
        // Modern verse cell structure
        const verseWrapper = document.createElement('div');
        verseWrapper.className = 'verse-cell relative bg-white border border-gray-200/60 rounded-xl shadow-sm focus-within:border-blue-300/80 focus-within:shadow-lg transition-all duration-200 overflow-hidden mb-4';
        verseWrapper.dataset.verse = this.currentVerseData.verse;
        verseWrapper.dataset.verseCell = 'true';
        verseWrapper.dataset.verseIndex = this.currentVerseData.index;
        
        // Modern header
        const navBar = document.createElement('div');
        navBar.className = 'flex items-center justify-between px-4 py-2 bg-gradient-to-r from-gray-50 to-gray-100 border-b border-gray-200/50 min-h-[40px] focus-within:from-blue-50 focus-within:to-blue-100 transition-all duration-200';
        
        // Left side: Audio controls container
        const leftControlsContainer = document.createElement('div');
        leftControlsContainer.className = 'flex items-center gap-1';
        
        // Center: Modern verse label
        const verseLabel = document.createElement('div');
        verseLabel.className = 'verse-label primary';
        verseLabel.textContent = this.currentVerseData.reference;
        
        // Right side: Controls container
        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'flex items-center gap-1';
        
        navBar.appendChild(leftControlsContainer);
        navBar.appendChild(verseLabel);
        navBar.appendChild(controlsContainer);
        verseWrapper.appendChild(navBar);
        
        // Create textarea (same as text-window.js)
        const textarea = document.createElement('textarea');
        textarea.className = 'auto-resize-textarea w-full px-5 py-4 border-0 text-base leading-relaxed text-gray-900 font-normal tracking-wide resize-none overflow-hidden bg-white focus:outline-none focus:bg-gray-50/30 transition-colors duration-200 placeholder:text-gray-400 placeholder:italic placeholder:opacity-80';
        textarea.dir = 'auto'; // Use native HTML direction detection
        textarea.placeholder = `Edit verse ${this.currentVerseData.verse} or drop text here...`;
        textarea.dataset.verse = this.currentVerseData.verse;
        textarea.dataset.verseIndex = this.currentVerseData.index;
        textarea.dataset.reference = this.currentVerseData.reference || `Verse ${this.currentVerseData.verse}`;
        textarea.draggable = false;
        
        // Load verse content
        await this.loadVerseContent(textarea);
        
        // Trigger auto-resize for initial content
        if (window.autoResize && textarea.value) {
            requestAnimationFrame(() => window.autoResize(textarea));
        }
        
        // Disable editing for viewers
        if (window.translationEditor && !window.translationEditor.canEdit) {
            textarea.disabled = true;
            textarea.style.backgroundColor = '#f9fafb';
            textarea.style.cursor = 'not-allowed';
            textarea.placeholder = 'Read-only mode - Editor access required to edit';
            textarea.title = 'Editor access required to edit translations';
        } else {
            // Use the existing TextWindow save functionality
            this.attachTextareaSaveListeners(textarea);
        }
        
        verseWrapper.appendChild(textarea);
        
        // Add the same controls as text-window.js
        this.setupVerseControls(controlsContainer, leftControlsContainer, textarea, verseWrapper);
        
        this.elements.flagVerseCellContainer.appendChild(verseWrapper);
    }
    
    // Reuse the existing TextWindow save functionality
    attachTextareaSaveListeners(textarea) {
        // Find a TextWindow instance to borrow the listener method from
        if (window.translationEditor && window.translationEditor.textWindows) {
            // Get any TextWindow instance to call its method
            const textWindow = Array.from(window.translationEditor.textWindows.values())[0];
            if (textWindow && textWindow.attachOptimizedTextareaListeners) {
                // Use the existing optimized listeners from TextWindow
                textWindow.attachOptimizedTextareaListeners(textarea);
                console.log('💾 Flag modal: Using existing TextWindow save functionality');
                return;
            }
        }
        
        // Fallback: minimal save functionality if TextWindow not available
        console.warn('TextWindow not found, using minimal save functionality');
        let currentValue = textarea.value || '';
        let hasChanges = false;
        
        textarea.addEventListener('input', (e) => {
            const newValue = e.target.value;
            hasChanges = (newValue !== currentValue);
            currentValue = newValue;

        }, { passive: true });
        
        textarea.addEventListener('blur', () => {
            if (hasChanges && window.translationEditor?.saveSystem) {
                const verseIndex = parseInt(textarea.dataset.verseIndex);
                if (!isNaN(verseIndex)) {
                    window.translationEditor.saveSystem.bufferVerseChange(verseIndex, currentValue);
                    hasChanges = false;
                }
            }
        }, { passive: true });
    }
    
    // Setup verse controls like in text-window.js
    setupVerseControls(rightControlsContainer, leftControlsContainer, textarea, verseWrapper) {
        const rightFragment = document.createDocumentFragment();
        
        // History button (same as text-window.js)
        const historyButton = document.createElement('button');
        historyButton.className = 'verse-control-btn';
        historyButton.innerHTML = '<i class="fas fa-history"></i>';
        historyButton.title = 'View edit history';
        historyButton.onclick = () => this.showVerseHistory();
        rightFragment.appendChild(historyButton);
        
        // Refresh button - fetch latest from database
        const refreshButton = document.createElement('button');
        refreshButton.className = 'verse-control-btn';
        refreshButton.innerHTML = '<i class="fas fa-sync"></i>';
        refreshButton.title = 'Refresh verse content from database';
        refreshButton.onclick = () => this.refreshVerseContent();
        rightFragment.appendChild(refreshButton);
        

        
        // Add editing controls if user can edit
        if (window.translationEditor?.canEdit) {
            // Audio controls on the left (same as text-window.js)
            if (window.translationEditor.textWindows?.get(this.currentTextId)?.audioManager) {
                const audioManager = window.translationEditor.textWindows.get(this.currentTextId).audioManager;
                audioManager.createAudioControls(leftControlsContainer, this.currentVerseData, textarea);
            }
            
            // Text direction is now handled automatically with dir="auto" on textareas
            // No need for a manual toggle button
            
            // Sparkle button (AI translate)
            const sparkleButton = document.createElement('button');
            sparkleButton.className = 'w-7 h-7 bg-transparent border-0 cursor-pointer flex items-center justify-center text-gray-400 rounded-sm';
            sparkleButton.innerHTML = '<i class="fas fa-magic text-sm"></i>';
            sparkleButton.title = 'Translate this verse with AI';
            sparkleButton.onclick = (e) => this.handleSparkleClick(e, textarea, sparkleButton);
            rightFragment.appendChild(sparkleButton);
            
            // Drag handle
            const dragHandle = document.createElement('div');
            dragHandle.className = 'w-7 h-7 bg-gray-100 border border-gray-300 rounded-sm cursor-move flex items-center justify-center';
            dragHandle.innerHTML = '<i class="fas fa-arrows-alt text-sm text-gray-500"></i>';
            dragHandle.title = 'Drag to translate';
            dragHandle.draggable = true;
            rightFragment.appendChild(dragHandle);
        } else {
            // Disable editing for viewers
            textarea.disabled = true;
            textarea.style.backgroundColor = '#f9fafb';
            textarea.style.cursor = 'not-allowed';
            textarea.placeholder = 'Read-only mode - Editor access required to edit';
        }
        
        rightControlsContainer.appendChild(rightFragment);
    }
    
    async loadVerseContent(textarea) {
        if (!this.currentVerseData || !this.currentTextId) return;
        
        try {
            // PRIORITY 1: Fetch the most recent version from the database to avoid conflicts
            const projectId = window.translationEditor?.projectId || window.location.pathname.split('/')[2];
            
            if (projectId) {
                const response = await fetch(`/project/${projectId}/verse/${this.currentTextId}/${this.currentVerseData.index}/content`);
                
                if (response.ok) {
                    const data = await response.json();
                    textarea.value = data.content || '';
                    console.log(`📥 Flag modal: Loaded verse ${this.currentVerseData.index} from database`);
                    return;
                } else {
                    console.warn('Failed to fetch verse from database, falling back to DOM search');
                }
            }
            
            // FALLBACK 1: Try to find verse content from the translation editor
            if (window.translationEditor) {
                const textWindow = window.translationEditor.textWindows.get(this.currentTextId);
                if (textWindow && textWindow.element) {
                    // Find existing textarea in the text window for this verse
                    const existingTextarea = textWindow.element.querySelector(`textarea[data-verse-index="${this.currentVerseData.index}"]`);
                    if (existingTextarea) {
                        textarea.value = existingTextarea.value || '';
                        console.log(`📥 Flag modal: Loaded verse ${this.currentVerseData.index} from text window`);
                        return;
                    }
                    
                    // Alternative: try finding by verse number
                    const verseTextarea = textWindow.element.querySelector(`textarea[data-verse="${this.currentVerseData.verse}"]`);
                    if (verseTextarea) {
                        textarea.value = verseTextarea.value || '';
                        console.log(`📥 Flag modal: Loaded verse ${this.currentVerseData.verse} from text window (by verse number)`);
                        return;
                    }
                }
            }
            
            // FALLBACK 2: Try to find any existing textarea with this verse anywhere in the document
            const existingTextarea = document.querySelector(`textarea[data-verse-index="${this.currentVerseData.index}"]`);
            if (existingTextarea && existingTextarea !== textarea) {
                textarea.value = existingTextarea.value || '';
                console.log(`📥 Flag modal: Loaded verse ${this.currentVerseData.index} from DOM search`);
                return;
            }
            
            // FALLBACK 3: Set empty if no content found
            textarea.value = '';
            console.log(`📥 Flag modal: No content found for verse ${this.currentVerseData.index}, setting empty`);
        } catch (error) {
            console.error('Error loading verse content:', error);
            textarea.value = '';
            textarea.placeholder = 'Error loading verse content';
        }
    }
    
    // Refresh verse content from database to get the most recent version
    async refreshVerseContent() {
        const textarea = this.elements.flagVerseCellContainer.querySelector('textarea');
        const refreshButton = this.elements.flagVerseCellContainer.querySelector('button[title="Refresh verse content from database"]');
        
        if (textarea && this.currentVerseData && this.currentTextId) {
            try {
                // Show loading state
                if (refreshButton) {
                    refreshButton.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i>';
                    refreshButton.disabled = true;
                }
                
                const originalPlaceholder = textarea.placeholder;
                textarea.placeholder = 'Refreshing from database...';
                
                // Fetch fresh content
                await this.loadVerseContent(textarea);
                
        
                
                // Show success feedback
                textarea.style.borderColor = '#10b981';
                setTimeout(() => {
                    textarea.style.borderColor = '';
                }, 1000);
                
                console.log(`🔄 Flag modal: Refreshed verse ${this.currentVerseData.index} from database`);
                
            } catch (error) {
                console.error('Error refreshing verse content:', error);
                
                // Show error feedback
                if (textarea) {
                    textarea.style.borderColor = '#dc2626';
                    setTimeout(() => {
                        textarea.style.borderColor = '';
                    }, 2000);
                }
            } finally {
                // Reset button state
                if (refreshButton) {
                    refreshButton.innerHTML = '<i class="fas fa-sync text-xs"></i>';
                    refreshButton.disabled = false;
                }
                
                // Reset placeholder
                if (textarea) {
                    textarea.placeholder = `Edit verse ${this.currentVerseData.verse} or drop text here...`;
                }
            }
        }
    }
    
    showVerseHistory() {
        // Use the same verse history system as text-window.js
        const textId = this.currentTextId.startsWith('text_') ? 
            parseInt(this.currentTextId.replace('text_', '')) : 
            parseInt(this.currentTextId);
        
        if (!window.translationEditor.verseHistory) {
            window.translationEditor.verseHistory = new VerseHistory(window.translationEditor);
        }
        
        window.translationEditor.verseHistory.showHistory(textId, this.currentVerseData.index);
    }
    
    downloadVerseAudio(verseWrapper) {
        // Same logic as text-window.js
        let audioControls = null;
        const allElements = verseWrapper.querySelectorAll('*');
        for (const el of allElements) {
            if (el._audioId) {
                audioControls = el;
                break;
            }
        }
        
        if (!audioControls || !audioControls._audioId) {
            alert('No audio file available for this verse.');
            return;
        }
        
        const projectId = window.location.pathname.split('/')[2];
        const editor = window.translationEditor;
        const book = editor?.currentBook || 'Unknown';
        const chapter = editor?.currentChapter || '1';
        
        const link = document.createElement('a');
        link.href = `/project/${projectId}/verse-audio/${audioControls._audioId}/download`;
        link.download = `${book}_${chapter}_verse_${this.currentVerseData.verse}.mp3`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    
    async handleSparkleClick(e, textarea, sparkleButton) {
        e.preventDefault();
        e.stopPropagation();
        
        // Find source text from other windows (same logic as text-window.js)
        let sourceText = '';
        let sourceWindow = null;
        
        const textWindows = window.translationEditor.textWindows;
        
        for (const [id, textWindow] of textWindows) {
            if (textWindow.id !== this.currentTextId) {
                const sourceTextarea = textWindow.element?.querySelector(`textarea[data-verse="${this.currentVerseData.verse}"]`);
                if (sourceTextarea && sourceTextarea.value?.trim()) {
                    sourceText = sourceTextarea.value.trim();
                    sourceWindow = textWindow;
                    break;
                }
            }
        }
        
        if (!sourceText) {
            sparkleButton.innerHTML = '<i class="fas fa-exclamation-triangle"></i>';
            sparkleButton.style.color = '#dc2626';
            setTimeout(() => {
                sparkleButton.innerHTML = '<i class="fas fa-magic"></i>';
                sparkleButton.style.color = '';
            }, 1000);
            return;
        }
        
        // Use existing translation system
        const dragData = {
            sourceText: sourceText,
            sourceId: sourceWindow.id,
            verse: this.currentVerseData.verse,
            reference: this.currentVerseData.reference,
            sourceType: sourceWindow.type,
            sourceTitle: sourceWindow.title
        };
        
        sparkleButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        sparkleButton.style.color = '#3b82f6';
        
        // Delegate to the main translation system
        if (window.translationEditor.textWindows.get(this.currentTextId)) {
            const textWindow = window.translationEditor.textWindows.get(this.currentTextId);
            // Use the text window's translation system
            // This would need to be implemented to work with the modal context
        }
    }
    
    // Mention system (simplified)
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
        const dropdown = this.elements.mentionDropdown;
        
        if (members.length === 0) {
            this.hideMentionDropdown();
            return;
        }
        
        dropdown.innerHTML = members.map(member => `
            <div class="mention-option px-3 py-2 hover:bg-red-50 cursor-pointer text-sm" 
                 data-name="${member.name}" data-email="${member.email}">
                <div class="font-medium">${this.escapeHtml(member.name)}</div>
                <div class="text-xs text-slate-500">${this.escapeHtml(member.email)}</div>
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
    
    setupCommentCharCounter() {
        if (this.elements.newCommentText && this.elements.commentCharCount) {
            this.elements.newCommentText.addEventListener('input', () => {
                const count = this.elements.newCommentText.value.length;
                this.elements.commentCharCount.textContent = count;
                
                if (count > 4500) {
                    this.elements.commentCharCount.classList.add('text-red-500');
                } else {
                    this.elements.commentCharCount.classList.remove('text-red-500');
                }
            });
        }
    }
    
    getStatusClasses(status) {
        return status === 'open' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700';
    }
    
    updateResolutionButtons(userResolution) {
        // Reset all buttons
        [this.elements.resolutionResolved, this.elements.resolutionUnresolved].forEach(btn => {
            if (btn) {
                btn.classList.remove('bg-green-100', 'text-green-700', 'border-green-200');
                btn.classList.remove('bg-orange-100', 'text-orange-700', 'border-orange-200');
                btn.classList.add('bg-slate-100', 'text-slate-600');
            }
        });
        
        if (userResolution) {
            let activeButton = null;
            let activeClasses = [];
            
            switch (userResolution.status) {
                case 'resolved':
                    activeButton = this.elements.resolutionResolved;
                    activeClasses = ['bg-green-100', 'text-green-700', 'border-green-200'];
                    break;
                case 'unresolved':
                    activeButton = this.elements.resolutionUnresolved;
                    activeClasses = ['bg-orange-100', 'text-orange-700', 'border-orange-200'];
                    break;
            }
            
            if (activeButton) {
                activeButton.classList.remove('bg-slate-100', 'text-slate-600');
                activeButton.classList.add(...activeClasses);
            }
        }
    }
    
    async setResolution(status) {
        if (!this.currentFlagId) return;
        
        try {
            const response = await fetch(`/project/${this.projectId}/flags/${this.currentFlagId}/resolve`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: status })
            });
            
            const data = await response.json();
            if (data.success) {
                // Update the resolution buttons
                this.updateResolutionButtons({ status: status });
                
                // If flag was auto-closed, update the status
                if (data.flag_status === 'closed') {
                    this.elements.flagDetailsStatus.textContent = 'closed';
                    this.elements.flagDetailsStatus.className = 'px-3 py-1.5 rounded-full text-sm font-semibold bg-gray-100 text-gray-700';
                    
                    const flagStatusButton = this.elements.flagStatusToggle;
                    if (flagStatusButton) {
                        flagStatusButton.innerHTML = '<i class="fas fa-crown mr-1"></i>Admin Reopen';
                        flagStatusButton.className = 'px-4 py-2 text-sm font-medium bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors';
                    }
                }
            } else {
                ErrorHandler.show(data.error || 'Failed to update resolution status');
            }
        } catch (error) {
            ErrorHandler.logAndShow('Failed to update resolution status', error);
        }
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

    getUserAvatarColor(name) {
        // Generate consistent colors based on name hash
        const colors = [
            'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 
            'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500',
            'bg-orange-500', 'bg-cyan-500', 'bg-lime-500', 'bg-rose-500'
        ];
        
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        return colors[Math.abs(hash) % colors.length];
    }
    
    getUserInitials(name) {
        return name.split(' ')
            .map(part => part.charAt(0))
            .join('')
            .substring(0, 2)
            .toUpperCase();
    }
    
    formatDiscordTimestamp(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        if (diffMs < 60000) { // Less than 1 minute
            return 'just now';
        } else if (diffMs < 3600000) { // Less than 1 hour
            const minutes = Math.floor(diffMs / 60000);
            return `${minutes}m ago`;
        } else if (diffMs < 86400000) { // Less than 1 day
            const hours = Math.floor(diffMs / 3600000);
            return `${hours}h ago`;
        } else if (diffDays === 1) {
            return 'yesterday';
        } else if (diffDays < 7) {
            return `${diffDays} days ago`;
        } else {
            // Show date in MM/DD/YYYY format
            return date.toLocaleDateString('en-US', {
                month: 'numeric',
                day: 'numeric',
                year: 'numeric'
            });
        }
    }
}

// Module pattern
const FlagManagerModule = (() => {
    let instance;
    
    function getInstance() {
        if (!instance) {
            instance = new FlagManager();
        }
        return instance;
    }
    
    return {
        openFlagDetails: (flagId) => getInstance().openFlagDetails(flagId),
        showNewThreadForm: () => getInstance().showNewThreadForm(),
        addComment: () => getInstance().addComment(),
        toggleFlagStatus: () => getInstance().toggleFlagStatus(),
        setResolution: (status) => getInstance().setResolution(status),
        closeFlagModal: () => getInstance().closeFlagModal(),
        openFlagModal: (verseData, textId) => getInstance().openFlagModal(verseData, textId),
        showFlagModalView: (view) => getInstance().showFlagModalView(view)
    };
})();

// Global functions for template compatibility
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

function setResolution(status) {
    FlagManagerModule.setResolution(status);
}

function closeFlagModal() {
    FlagManagerModule.closeFlagModal();
}

function openFlagModal(verseData, textId) {
    FlagManagerModule.openFlagModal(verseData, textId);
}

function showFlagModalView(view) {
    FlagManagerModule.showFlagModalView(view);
}

// Export for other modules
window.FlagManager = FlagManagerModule;

 