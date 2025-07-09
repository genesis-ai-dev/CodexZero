# Simplified Database Schema Design

## Core Philosophy
- **Single responsibility**: One table stores all Bible text data (verses)
- **No file storage**: Everything in database only
- **Unified interface**: Same methods work for all text types
- **Dramatically reduced code**: Eliminate dual storage, managers, etc.

## New Simplified Schema

### Single `texts` Table
```sql
CREATE TABLE texts (
    id INT PRIMARY KEY AUTO_INCREMENT,
    project_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    text_type ENUM('source', 'draft', 'back_translation') NOT NULL,
    description TEXT,
    
    -- Progress tracking
    total_verses INT DEFAULT 41899,
    non_empty_verses INT DEFAULT 0,
    progress_percentage DECIMAL(5,2) DEFAULT 0.0,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_project_texts (project_id, text_type)
);
```

### Single `verses` Table  
```sql
CREATE TABLE verses (
    id INT PRIMARY KEY AUTO_INCREMENT,
    text_id INT NOT NULL,
    verse_index INT NOT NULL, -- 0-31169
    verse_text TEXT NOT NULL DEFAULT '',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (text_id) REFERENCES texts(id) ON DELETE CASCADE,
    UNIQUE KEY unique_text_verse (text_id, verse_index),
    INDEX idx_verse_lookup (text_id, verse_index)
);
```

## Benefits of Simplified Structure

### Code Reduction
- **Eliminate**: ProjectFile, ProjectFileVerse, Translation, TranslationVerse models
- **Eliminate**: TranslationFileManager, TranslationDatabaseManager classes  
- **Eliminate**: Dual storage logic throughout translation.py
- **Eliminate**: storage_type, storage_path fields and related complexity
- **Eliminate**: File upload/storage for text data

### Unified Interface
```python
# ONE class handles everything
class TextManager:
    def get_verses(self, text_id: int, verse_indices: List[int]) -> List[str]
    def save_verse(self, text_id: int, verse_index: int, text: str) -> bool
    def create_text(self, project_id: int, name: str, text_type: str) -> int
    def import_verses(self, text_id: int, content: str) -> bool
```

### API Simplification
- All text sources use same ID format: just `text_123` (no more `file_123` vs `translation_456`)
- Same endpoints work for all text types
- Same progress tracking for all text types

## Migration Strategy

1. **Create new tables** (texts, verses)
2. **Migrate existing data**:
   - ProjectFile + ProjectFileVerse → texts + verses (text_type='source')
   - Translation + TranslationVerse → texts + verses (text_type='draft') 
3. **Update all code** to use unified interface
4. **Drop old tables** (project_files, project_file_verses, translations, translation_verses)

## Estimated Code Reduction
- **Remove ~800 lines** from models.py, translation.py, utils/
- **Remove 3 entire files**: TranslationFileManager, DatabaseStorage, file_verse_cache
- **Simplify 5+ files** by removing dual storage logic
- **Net result**: ~40% reduction in codebase size for translation system 