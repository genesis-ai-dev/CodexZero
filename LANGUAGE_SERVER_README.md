# Language Server - Unified Suggestion Framework

## Overview

The CodexZero language server provides real-time text analysis for Bible translation projects using a unified suggestion framework. All language analysis results are returned as "suggestions" with customizable colors and actions, featuring **immediate visual feedback** when users take actions.

## Key Features

### Immediate Visual Feedback
- **Instant Response**: Highlighting disappears immediately when users add words to dictionary or ignore suggestions
- **No Waiting**: Visual changes happen before server confirmation for smooth user experience
- **Error Recovery**: If server actions fail, highlighting is restored to correct state
- **Optimistic Updates**: UI updates immediately with rollback on errors

### Perfect Auto-Save Integration
- **No Interference**: Language server preserves all existing textarea functionality
- **Auto-Save Compatible**: Cell editing and saving works exactly as before
- **Focus Tracking**: Proper focus management for save system
- **Event Forwarding**: All textarea events (input, blur, focus) work normally

### Unified Suggestion System
- All analysis results use the same structure regardless of suggestion type
- Customizable colors per suggestion (no predefined categories)
- Consistent user interaction patterns
- Extensible action system

### Smart Re-Analysis
- **Auto Re-Analysis**: 2-second debounced re-analysis after text changes
- **Action-Triggered**: Immediate re-analysis after dictionary additions or ignores
- **Window-Aware**: Only analyzes in enabled windows, skips disabled ones
- **Current Text Analysis**: Analyzes current unsaved text, not database content

## Architecture

### Backend (Python)

**Core Service**: `utils/language_server.py`
- `LanguageServerService` - Main analysis engine
- Project-specific dictionary management
- Unified suggestion format

**API Endpoints**: `routes/language_server.py`
- `GET /project/<id>/language-server/analyze/<text_id>/<verse_index>` - Analyze verse from database
- `POST /project/<id>/language-server/analyze/<text_id>/<verse_index>` - Analyze current text (not saved)
- `POST /project/<id>/language-server/action` - Execute suggestion actions
- `POST /project/<id>/language-server/dictionary` - Add single word to dictionary
- `POST /project/<id>/language-server/dictionary/bulk` - Add multiple words to dictionary

### Frontend (JavaScript)

**Primary Implementation**: `static/js/language-server-simple.js`
- `AdvancedLanguageServer` class
- Window-based management
- Visual highlighting with contenteditable overlay
- Perfect auto-save integration
- Interactive suggestion modals
- **Immediate feedback on all actions**
- **Smart re-analysis with debouncing**

**Alternative Implementation**: `static/js/language-server.js`
- `LanguageServerManager` class  
- Overlay-based highlighting
- Modal-based interaction
- **Cache-based immediate updates**

## User Experience Flow

### Real-Time Text Analysis
1. User types in verse cell → **2-second debounce timer starts**
2. Timer expires → **Auto re-analysis with current text** (not saved version)
3. New suggestions appear immediately → **Visual highlighting updates**
4. Process repeats on every text change

### Cell Auto-Save
1. User edits text → **Input events work normally**
2. User moves to different cell → **Blur triggers auto-save**
3. Server saves verse → **Success confirmation**
4. All existing save functionality preserved

### Add to Dictionary
1. User clicks suggestion → Modal opens
2. User clicks "Add to Dictionary" → **Highlighting disappears immediately**
3. Server processes request → Success confirmation
4. **Immediate re-analysis** → Updated suggestions appear

### Add All Words to Dictionary
1. User clicks suggestion → Modal opens
2. User clicks "Add All Words to Dictionary" → **All verse highlighting disappears immediately**
3. Server processes all unique words from verse → Success confirmation
4. **Immediate re-analysis** → Updated suggestions appear

### Ignore Suggestion
1. User clicks suggestion → Modal opens  
2. User clicks "Ignore" → **Highlighting disappears immediately**
3. Server logs action → Success confirmation
4. **Immediate re-analysis** → Updated suggestions appear

### Error Handling
- If server request fails → UI reverts highlighting
- If network error → User sees error message + highlighting restored
- Optimistic updates with fallback to server truth

## Suggestion Format

### Unified Structure

All analysis results use this format:

```json
{
  "suggestions": [
    {
      "substring": "word",
      "start": 0,
      "end": 4,
      "color": "#ff6b6b",
      "message": "'word' not in dictionary",
      "actions": ["add_to_dictionary"]
    }
  ]
}
```

### Suggestion Properties

- **substring**: The text that triggered the suggestion
- **start/end**: Character positions in the original text
- **color**: Hex color for visual highlighting (customizable per suggestion)
- **message**: Human-readable description
- **actions**: Array of available actions (e.g., "add_to_dictionary", "ignore")

### Color Customization

Each suggestion can specify its own color:
- Dictionary suggestions: `#ff6b6b` (red)
- Future suggestion types can use any hex color
- Fallback: `#ff6b6b` if no color specified

## Available Actions

### add_to_dictionary
- Adds word to project-specific dictionary
- **Immediate visual feedback**: Highlighting removed instantly
- Automatically refreshes analysis on server
- Permanent approval for the project

### add_all_to_dictionary (bulk)
- Adds all unique words (3+ characters) from current verse to dictionary
- **Immediate visual feedback**: All highlighting removed instantly  
- Uses efficient bulk database operations
- Permanent approval for all words in the project

### ignore
- Dismisses suggestion without adding to dictionary
- **Immediate visual feedback**: Highlighting removed instantly
- Server logs action for analytics
- Temporary dismissal (until page refresh)

## Database Schema

### ProjectDictionary Table
```sql
CREATE TABLE project_dictionaries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    word VARCHAR(255) NOT NULL,
    approved BOOLEAN DEFAULT TRUE,
    category VARCHAR(50) DEFAULT 'user',
    definition TEXT,
    alternatives TEXT,
    added_by INT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE CASCADE,
    
    UNIQUE KEY unique_project_word (project_id, word)
);
```

## Integration Points

### Translation Editor
- Automatic analysis during verse saving
- Analysis results included in save responses
- Real-time visual feedback in text areas
- **Immediate response to user actions**

### Window Management
- Per-window enable/disable controls
- Primary windows enabled by default
- Reference windows disabled by default (but still editable)
- Settings persist across sessions
- Smart window detection for re-analysis

## Performance Features

### Frontend Optimizations
- **Immediate UI updates**: No waiting for server responses
- **Optimistic updates**: Assume success, rollback on failure
- **Perfect auto-save compatibility**: No interference with existing functionality
- **Smart re-analysis**: Debounced for performance, immediate for actions
- **Event forwarding**: Proper textarea event handling
- **Error recovery**: Automatic state restoration on failures

### Backend Optimizations
- Lazy dictionary loading
- Analysis result caching
- Efficient database queries
- Minimal DOM manipulation

## Extension Framework

### Adding New Suggestion Types

1. **Backend**: Extend `LanguageServerService.analyze_verse()`
```python
suggestions.append({
    "substring": text,
    "start": start,
    "end": end,
    "color": "#your-color",  # Custom color
    "message": "Your suggestion message",
    "actions": ["your_action"]
})
```

2. **Frontend**: No changes needed - unified handling with immediate feedback

3. **Actions**: Add new action handlers in `/language-server/action` endpoint

### Color Schemes
- No predefined color categories
- Each suggestion specifies its own color
- Consistent visual theming through color choice
- Supports any hex color value

## Current Implementation

### Dictionary Checking
- Analyzes words 3+ characters
- Compares against project dictionary
- Flags unknown words for review
- **One-click dictionary addition with immediate feedback**
- **Real-time analysis of current text** (not just saved content)
- **Auto re-analysis after 2 seconds of no typing**

## Future Opportunities

1. **Grammar Analysis**: Add grammatical suggestion types with custom colors
2. **Style Consistency**: Check translation style patterns  
3. **Terminology Management**: Ensure consistent term usage
4. **AI Integration**: Context-aware suggestions
5. **Batch Operations**: ✅ Multi-word dictionary management (completed)
6. **User Preferences**: Customizable color schemes per user
7. **Visual Highlighting Improvements**: Better overlay techniques for more complex highlighting
8. **Persistent Ignore**: Save ignored words per user/project
9. **Undo Actions**: Allow users to undo dictionary additions
10. **Performance Optimization**: Further optimize re-analysis frequency and timing 