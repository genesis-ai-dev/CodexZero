# Bible Verse Translation Edit History Implementation Report

## Executive Summary

This report outlines a comprehensive approach to implementing edit histories for Bible verse translations in CodexZero. The system will track who made what changes, when they were made, and provide capabilities for viewing history, comparing versions, and reverting changes.

## Current System Analysis

### Translation Storage Architecture

CodexZero currently uses a **dual-schema approach** for storing Bible verse translations:

1. **Unified Schema (New)**: `Text` + `Verse` tables
   - `Text`: Contains metadata (name, type, progress tracking)
   - `Verse`: Individual verse storage with `text_id`, `verse_index`, `verse_text`

2. **Legacy Schema**: `Translation` + `TranslationVerse` tables
   - Similar structure but being phased out

### Current User Tracking

- **Authentication**: Google OAuth 2.0 with `flask-login`
- **User Model**: Stores `id`, `google_id`, `email`, `name`, login timestamps
- **Project Access**: Role-based system (`owner`, `editor`, `viewer`) via `ProjectMember` table
- **Current Limitation**: No user tracking on individual verse edits

### Edit Flow Analysis

**Current verse save process:**
1. Frontend: User edits verse in textarea
2. JavaScript: `TranslationSave.saveVerse()` sends POST to `/project/{id}/translation/{target_id}/verse/{verse_index}`
3. Backend: `save_verse()` route handler updates `Verse` table directly
4. **Missing**: No audit trail, user attribution, or version history

## Proposed Edit History System

### 1. Database Schema Changes

#### New `verse_edit_history` Table

```sql
CREATE TABLE verse_edit_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- Verse identification
    text_id INT NOT NULL,
    verse_index INT NOT NULL,
    
    -- Content tracking
    previous_text TEXT,
    new_text TEXT NOT NULL,
    
    -- User and timing
    edited_by INT NOT NULL,
    edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Edit metadata
    edit_type ENUM('create', 'update', 'delete', 'revert') NOT NULL DEFAULT 'update',
    edit_source ENUM('manual', 'ai_translation', 'import', 'bulk_operation') NOT NULL DEFAULT 'manual',
    
    -- Optional context
    edit_comment TEXT,
    confidence_score DECIMAL(3,2),  -- For AI translations
    
    -- Relationships
    FOREIGN KEY (text_id) REFERENCES texts(id) ON DELETE CASCADE,
    FOREIGN KEY (edited_by) REFERENCES users(id) ON DELETE SET NULL,
    
    -- Indexes for performance
    INDEX idx_verse_history (text_id, verse_index, edited_at),
    INDEX idx_user_edits (edited_by, edited_at),
    INDEX idx_text_recent (text_id, edited_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Enhanced `verses` Table

```sql
-- Add tracking columns to existing verses table
ALTER TABLE verses ADD COLUMN (
    last_edited_by INT,
    last_edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    edit_count INT DEFAULT 0,
    
    FOREIGN KEY (last_edited_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_verse_last_edited (last_edited_by, last_edited_at)
);
```

### 2. Model Updates

#### New `VerseEditHistory` Model

```python
class VerseEditHistory(db.Model):
    __tablename__ = 'verse_edit_history'
    
    id = db.Column(db.Integer, primary_key=True)
    text_id = db.Column(db.Integer, db.ForeignKey('texts.id'), nullable=False)
    verse_index = db.Column(db.Integer, nullable=False)
    
    previous_text = db.Column(db.Text)
    new_text = db.Column(db.Text, nullable=False)
    
    edited_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    edited_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    edit_type = db.Column(db.Enum('create', 'update', 'delete', 'revert'), 
                         nullable=False, default='update')
    edit_source = db.Column(db.Enum('manual', 'ai_translation', 'import', 'bulk_operation'), 
                           nullable=False, default='manual')
    
    edit_comment = db.Column(db.Text)
    confidence_score = db.Column(db.Numeric(3, 2))
    
    # Relationships
    text = db.relationship('Text', backref='edit_history')
    editor = db.relationship('User', backref='verse_edits')
    
    def __repr__(self):
        return f'<VerseEditHistory {self.text_id}:{self.verse_index} by {self.edited_by}>'
```

#### Updated `Verse` Model

```python
class Verse(db.Model):
    # ... existing fields ...
    
    # New tracking fields
    last_edited_by = db.Column(db.Integer, db.ForeignKey('users.id'))
    last_edited_at = db.Column(db.DateTime, default=datetime.utcnow, 
                              onupdate=datetime.utcnow)
    edit_count = db.Column(db.Integer, default=0)
    
    # Relationships
    last_editor = db.relationship('User', backref='last_edited_verses')
    
    def get_edit_history(self, limit=50):
        """Get edit history for this verse"""
        return VerseEditHistory.query.filter_by(
            text_id=self.text_id,
            verse_index=self.verse_index
        ).order_by(VerseEditHistory.edited_at.desc()).limit(limit).all()
```

### 3. Service Layer Implementation

#### `VerseEditHistoryService` Class

```python
class VerseEditHistoryService:
    """Service for managing verse edit history"""
    
    @staticmethod
    def record_edit(text_id: int, verse_index: int, previous_text: str, 
                   new_text: str, user_id: int, edit_type: str = 'update',
                   edit_source: str = 'manual', comment: str = None,
                   confidence_score: float = None) -> VerseEditHistory:
        """Record a verse edit in history"""
        
        edit_record = VerseEditHistory(
            text_id=text_id,
            verse_index=verse_index,
            previous_text=previous_text,
            new_text=new_text,
            edited_by=user_id,
            edit_type=edit_type,
            edit_source=edit_source,
            edit_comment=comment,
            confidence_score=confidence_score
        )
        
        db.session.add(edit_record)
        
        # Update verse tracking
        verse = Verse.query.filter_by(
            text_id=text_id, 
            verse_index=verse_index
        ).first()
        
        if verse:
            verse.last_edited_by = user_id
            verse.last_edited_at = datetime.utcnow()
            verse.edit_count = (verse.edit_count or 0) + 1
        
        db.session.commit()
        return edit_record
    
    @staticmethod
    def get_verse_history(text_id: int, verse_index: int, limit: int = 50) -> List[VerseEditHistory]:
        """Get edit history for a specific verse"""
        return VerseEditHistory.query.filter_by(
            text_id=text_id,
            verse_index=verse_index
        ).order_by(VerseEditHistory.edited_at.desc()).limit(limit).all()
    
    @staticmethod
    def get_user_recent_edits(user_id: int, limit: int = 100) -> List[VerseEditHistory]:
        """Get recent edits by a user"""
        return VerseEditHistory.query.filter_by(
            edited_by=user_id
        ).order_by(VerseEditHistory.edited_at.desc()).limit(limit).all()
    
    @staticmethod
    def get_text_recent_activity(text_id: int, limit: int = 100) -> List[VerseEditHistory]:
        """Get recent activity for a text"""
        return VerseEditHistory.query.filter_by(
            text_id=text_id
        ).order_by(VerseEditHistory.edited_at.desc()).limit(limit).all()
    
    @staticmethod
    def revert_verse(text_id: int, verse_index: int, target_edit_id: int, 
                    user_id: int) -> bool:
        """Revert a verse to a previous version"""
        
        # Get the target edit
        target_edit = VerseEditHistory.query.get(target_edit_id)
        if not target_edit or target_edit.text_id != text_id or target_edit.verse_index != verse_index:
            return False
        
        # Get current verse
        current_verse = Verse.query.filter_by(
            text_id=text_id,
            verse_index=verse_index
        ).first()
        
        if not current_verse:
            return False
        
        # Record the revert action
        VerseEditHistoryService.record_edit(
            text_id=text_id,
            verse_index=verse_index,
            previous_text=current_verse.verse_text,
            new_text=target_edit.new_text,
            user_id=user_id,
            edit_type='revert',
            comment=f'Reverted to version from {target_edit.edited_at}'
        )
        
        # Update the verse
        current_verse.verse_text = target_edit.new_text
        db.session.commit()
        
        return True
```

### 4. API Endpoint Updates

#### Updated `save_verse` Route

```python
@translation.route('/project/<int:project_id>/translation/<target_id>/verse/<int:verse_index>', methods=['POST'])
@login_required
def save_verse(project_id, target_id, verse_index):
    """Save a single verse with edit history tracking"""
    require_project_access(project_id, "editor")
    
    data = request.get_json()
    if not data or 'text' not in data:
        return jsonify({'error': 'Verse text is required'}), 400
    
    verse_text = data['text']
    edit_comment = data.get('comment')  # Optional comment
    edit_source = data.get('source', 'manual')  # manual, ai_translation, etc.
    confidence_score = data.get('confidence')  # For AI translations
    
    # Strip newlines to maintain line alignment
    verse_text = ' '.join(verse_text.split())
    
    try:
        if target_id.startswith('text_'):
            text_id = int(target_id.replace('text_', ''))
            
            # Get current verse for history
            current_verse = Verse.query.filter_by(
                text_id=text_id,
                verse_index=verse_index
            ).first()
            
            previous_text = current_verse.verse_text if current_verse else ''
            
            # Save the verse (existing logic)
            text_manager = TextManager(text_id)
            success = text_manager.save_verse(verse_index, verse_text)
            
            if success:
                # Record edit history
                VerseEditHistoryService.record_edit(
                    text_id=text_id,
                    verse_index=verse_index,
                    previous_text=previous_text,
                    new_text=verse_text,
                    user_id=current_user.id,
                    edit_type='create' if not previous_text else 'update',
                    edit_source=edit_source,
                    comment=edit_comment,
                    confidence_score=confidence_score
                )
                
                return jsonify({
                    'success': True,
                    'edit_recorded': True,
                    'editor': current_user.name
                })
            else:
                return jsonify({'error': 'Failed to save verse'}), 500
                
        # Handle other target types (legacy support)...
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Save failed: {str(e)}'}), 500
```

#### New History API Endpoints

```python
@translation.route('/project/<int:project_id>/verse/<int:text_id>/<int:verse_index>/history')
@login_required
def get_verse_history(project_id, text_id, verse_index):
    """Get edit history for a specific verse"""
    require_project_access(project_id, "viewer")
    
    history = VerseEditHistoryService.get_verse_history(text_id, verse_index)
    
    return jsonify({
        'history': [{
            'id': edit.id,
            'previous_text': edit.previous_text,
            'new_text': edit.new_text,
            'edited_by': edit.editor.name,
            'edited_by_email': edit.editor.email,
            'edited_at': edit.edited_at.isoformat(),
            'edit_type': edit.edit_type,
            'edit_source': edit.edit_source,
            'comment': edit.edit_comment,
            'confidence_score': float(edit.confidence_score) if edit.confidence_score else None
        } for edit in history]
    })

@translation.route('/project/<int:project_id>/verse/<int:text_id>/<int:verse_index>/revert', methods=['POST'])
@login_required
def revert_verse(project_id, text_id, verse_index):
    """Revert a verse to a previous version"""
    require_project_access(project_id, "editor")
    
    data = request.get_json()
    target_edit_id = data.get('edit_id')
    
    if not target_edit_id:
        return jsonify({'error': 'Edit ID required'}), 400
    
    success = VerseEditHistoryService.revert_verse(
        text_id, verse_index, target_edit_id, current_user.id
    )
    
    if success:
        return jsonify({'success': True, 'message': 'Verse reverted successfully'})
    else:
        return jsonify({'error': 'Failed to revert verse'}), 500

@translation.route('/project/<int:project_id>/activity')
@login_required
def get_project_activity(project_id):
    """Get recent activity for a project"""
    require_project_access(project_id, "viewer")
    
    # Get all texts in project
    texts = Text.query.filter_by(project_id=project_id).all()
    text_ids = [text.id for text in texts]
    
    # Get recent edits across all texts
    recent_edits = VerseEditHistory.query.filter(
        VerseEditHistory.text_id.in_(text_ids)
    ).order_by(VerseEditHistory.edited_at.desc()).limit(50).all()
    
    return jsonify({
        'activity': [{
            'id': edit.id,
            'text_name': edit.text.name,
            'verse_index': edit.verse_index,
            'verse_reference': get_verse_reference(edit.verse_index),  # Helper function
            'edited_by': edit.editor.name,
            'edited_at': edit.edited_at.isoformat(),
            'edit_type': edit.edit_type,
            'edit_source': edit.edit_source,
            'comment': edit.edit_comment
        } for edit in recent_edits]
    })
```

### 5. Frontend Implementation

#### Verse History Modal Component

```javascript
class VerseHistoryModal {
    constructor(translationEditor) {
        this.editor = translationEditor;
        this.currentTextId = null;
        this.currentVerseIndex = null;
        this.historyData = [];
    }
    
    async showHistory(textId, verseIndex) {
        this.currentTextId = textId;
        this.currentVerseIndex = verseIndex;
        
        // Fetch history data
        const response = await fetch(
            `/project/${this.editor.projectId}/verse/${textId}/${verseIndex}/history`
        );
        const data = await response.json();
        this.historyData = data.history;
        
        // Create and show modal
        this.createModal();
    }
    
    createModal() {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-xl font-bold">Edit History - ${this.getVerseReference()}</h2>
                    <button class="close-btn text-gray-500 hover:text-gray-700">×</button>
                </div>
                
                <div class="space-y-4">
                    ${this.historyData.map(edit => this.renderHistoryItem(edit)).join('')}
                </div>
            </div>
        `;
        
        // Event listeners
        modal.querySelector('.close-btn').addEventListener('click', () => {
            modal.remove();
        });
        
        document.body.appendChild(modal);
    }
    
    renderHistoryItem(edit) {
        const editDate = new Date(edit.edited_at).toLocaleString();
        const isRevert = edit.edit_type === 'revert';
        const isAI = edit.edit_source === 'ai_translation';
        
        return `
            <div class="border rounded-lg p-4 ${isRevert ? 'bg-yellow-50' : 'bg-gray-50'}">
                <div class="flex justify-between items-start mb-2">
                    <div class="flex items-center gap-2">
                        <span class="font-medium">${edit.edited_by}</span>
                        <span class="text-sm text-gray-500">${editDate}</span>
                        ${isAI ? '<span class="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">AI</span>' : ''}
                        ${isRevert ? '<span class="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">REVERT</span>' : ''}
                    </div>
                    <button class="revert-btn text-sm text-blue-600 hover:text-blue-800" 
                            data-edit-id="${edit.id}">
                        Revert to this
                    </button>
                </div>
                
                ${edit.comment ? `<div class="text-sm text-gray-600 mb-2">${edit.comment}</div>` : ''}
                
                <div class="space-y-2">
                    ${edit.previous_text ? `
                        <div>
                            <div class="text-xs font-medium text-red-600 mb-1">Previous:</div>
                            <div class="text-sm text-red-700 bg-red-50 p-2 rounded">${edit.previous_text}</div>
                        </div>
                    ` : ''}
                    
                    <div>
                        <div class="text-xs font-medium text-green-600 mb-1">New:</div>
                        <div class="text-sm text-green-700 bg-green-50 p-2 rounded">${edit.new_text}</div>
                    </div>
                </div>
                
                ${edit.confidence_score ? `
                    <div class="text-xs text-gray-500 mt-2">
                        Confidence: ${(edit.confidence_score * 100).toFixed(1)}%
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    async revertToVersion(editId) {
        if (!confirm('Are you sure you want to revert to this version?')) {
            return;
        }
        
        const response = await fetch(
            `/project/${this.editor.projectId}/verse/${this.currentTextId}/${this.currentVerseIndex}/revert`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ edit_id: editId })
            }
        );
        
        const data = await response.json();
        if (data.success) {
            // Refresh the verse in the editor
            this.editor.refreshVerse(this.currentVerseIndex);
            // Close modal
            document.querySelector('.fixed.inset-0').remove();
            // Show success message
            this.editor.showMessage('Verse reverted successfully', 'success');
        } else {
            this.editor.showMessage(data.error || 'Failed to revert verse', 'error');
        }
    }
    
    getVerseReference() {
        // Helper to convert verse index to readable reference
        // This would use the existing verse reference system
        return `Verse ${this.currentVerseIndex}`;
    }
}
```

#### Updated Translation Editor

```javascript
class TranslationEditor {
    constructor() {
        // ... existing code ...
        this.historyModal = new VerseHistoryModal(this);
    }
    
    setupEventListeners() {
        // ... existing code ...
        
        // Add history button to verse cells
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('verse-history-btn')) {
                const textarea = e.target.closest('.verse-cell').querySelector('textarea');
                const verseIndex = parseInt(textarea.dataset.verseIndex);
                const textId = this.currentTranslation.replace('text_', '');
                
                this.historyModal.showHistory(textId, verseIndex);
            }
        });
    }
    
    // Add history button to verse cell HTML
    createVerseCell(verse, verseText) {
        return `
            <div class="verse-cell border rounded p-2 mb-2">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-sm font-medium">${verse.reference}</span>
                    <div class="flex gap-1">
                        <button class="verse-history-btn text-xs text-blue-600 hover:text-blue-800">
                            History
                        </button>
                        <button class="translate-btn text-xs text-green-600 hover:text-green-800">
                            Translate
                        </button>
                    </div>
                </div>
                <textarea 
                    data-verse-index="${verse.index}"
                    class="w-full p-2 border rounded resize-none"
                    rows="2"
                    placeholder="Enter translation..."
                >${verseText}</textarea>
            </div>
        `;
    }
}
```

### 6. User Interface Enhancements

#### Activity Dashboard

Create a new activity dashboard showing:
- Recent edits across all project texts
- User contribution statistics
- Most active verses/chapters
- AI vs manual edit ratios

#### Verse Cell Indicators

Add visual indicators to verse cells:
- **Edit count badge**: Shows number of edits
- **Last editor**: Shows who last edited
- **Recent activity**: Highlight recently edited verses
- **Collaboration indicators**: Show when multiple users have edited

#### Diff Viewer

Implement a side-by-side diff viewer for comparing versions:
- Word-level highlighting
- Character-level diffs for precise changes
- Timeline scrubber for navigating through versions

### 7. Performance Considerations

#### Database Optimization

1. **Indexing Strategy**:
   - Primary index on `(text_id, verse_index, edited_at)`
   - Secondary index on `(edited_by, edited_at)`
   - Composite index on `(text_id, edited_at DESC)` for recent activity

2. **Pagination**:
   - Limit history queries to 50 records by default
   - Implement pagination for longer histories
   - Use cursor-based pagination for better performance

3. **Archival Strategy**:
   - Archive old edit records after 2 years
   - Maintain summary statistics
   - Compress historical data

#### Frontend Optimization

1. **Lazy Loading**: Load history only when requested
2. **Caching**: Cache recent history data in browser
3. **Debouncing**: Debounce rapid edits to reduce history noise
4. **Batch Operations**: Group rapid sequential edits

### 8. Migration Strategy

#### Phase 1: Schema and Backend
1. Create `verse_edit_history` table
2. Update `Verse` model with tracking fields
3. Implement `VerseEditHistoryService`
4. Update save endpoints to record history

#### Phase 2: API Endpoints
1. Add history retrieval endpoints
2. Implement revert functionality
3. Add activity dashboard endpoints

#### Phase 3: Frontend Integration
1. Add history modal component
2. Update verse cells with history buttons
3. Implement activity dashboard
4. Add diff viewer

#### Phase 4: Advanced Features
1. Bulk operations tracking
2. Comment system
3. Advanced filtering and search
4. Export capabilities

### 9. Security Considerations

#### Access Control
- History viewing requires `viewer` role
- Reverting requires `editor` role
- Sensitive operations logged

#### Data Protection
- Edit history contains potentially sensitive translation work
- Implement proper access controls
- Consider data retention policies

#### Audit Trail
- Track who accesses history
- Log revert operations
- Monitor for suspicious activity

### 10. Testing Strategy

#### Unit Tests
- `VerseEditHistoryService` methods
- Model relationships and constraints
- API endpoint functionality

#### Integration Tests
- End-to-end edit tracking
- Revert functionality
- History retrieval with permissions

#### Performance Tests
- History queries with large datasets
- Concurrent edit scenarios
- Database index effectiveness

## Implementation Timeline

**Week 1-2**: Database schema changes and model updates
**Week 3-4**: Backend service implementation and API endpoints
**Week 5-6**: Frontend components and UI integration
**Week 7-8**: Testing, optimization, and deployment

## Conclusion

This edit history system will provide comprehensive tracking of Bible verse translations, enabling collaboration, accountability, and quality control. The implementation balances functionality with performance, ensuring the system scales well with project growth.

The phased approach allows for gradual rollout while maintaining system stability. The focus on user experience ensures that the history features enhance rather than complicate the translation workflow. 