# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development

**Run the application:**
```bash
python app.py
```

**Run tests:**
```bash
python run_tests.py
```

**Run specific test files:**
```bash
python -m pytest tests/test_utils.py -v
python -m pytest tests/test_project_access.py -v
```

**Apply database migrations:**
```bash
python migrations/add_language_server_tables.py
python migrations/add_refinement_prompt.py
```

## Architecture

### High-Level Overview

CodexZero is a Flask web application for AI-powered Bible translation with collaborative features. The architecture follows a modular blueprint pattern with clear separation of concerns.

### Core Components

**Authentication & Authorization:**
- Google OAuth integration for user authentication
- Role-based access control (Owner > Editor > Viewer)
- Project membership system with invitation workflow
- Development mode with simplified login for testing

**Translation Engine:**
- Primary: Claude 3.5 Sonnet for translation
- Fine-tuning support with OpenAI GPT models  
- Instruction-based translation with project-specific prompts
- Confidence scoring and back-translation validation
- Real-time verse-by-verse translation workflow

**Language Server:**
- Real-time text analysis with Unicode support (50+ writing systems)
- Project-specific dictionaries with bulk word management
- Spell checking with similarity-based suggestions
- Immediate visual feedback system with optimistic updates
- Auto-save compatible with 2-second debounced re-analysis

**Storage Architecture:**
- Dual storage system: local filesystem (dev) or DigitalOcean Spaces (production)
- Organized directory structure: `/uploads/projects/{id}/` for project files
- File types: USFM imports, eBible format, back translations, fine-tuning datasets
- Audio files: TTS generation with iteration tracking

**Database Design:**
- MySQL with UTF-8mb4 support for Biblical languages
- Key models: User, Project, ProjectMember, Text, TranslationVerse
- Project dictionaries for language server
- Fine-tuning job tracking with status management

### Key Patterns

**Request Flow:**
1. Route handlers in `/routes/*.py` receive requests
2. Utils modules handle business logic
3. Models provide data access layer
4. Templates render UI with Tailwind CSS
5. JavaScript handles real-time interactions

**Project Access Control:**
- `ProjectAccess` utility centralizes permission checks
- Decorators enforce role requirements on routes
- Membership table tracks user-project relationships
- Legacy owner field maintained for backward compatibility

**Translation Workflow:**
1. User uploads USFM or text files
2. System parses into verse structure
3. AI translates verse-by-verse with context
4. Users refine with confidence indicators
5. Export to various formats

### Frontend Architecture

**Key JavaScript Modules:**
- `translation-*.js`: Modular translation interface components
- `language-server-simple.js`: Advanced language analysis with overlay
- `virtual-scroll-manager.js`: Performance optimization for large texts
- `audio-manager.js`: TTS generation and playback
- `verse-history.js`: Translation version tracking

**UI Components:**
- Three-column layout: Source, Translation, Back-translation
- Modal-based interactions for flags, audio tuning
- Real-time save indicators and confidence tooltips
- Responsive design with mobile support

### Integration Points

**External Services:**
- OpenAI API: Fine-tuning and GPT models
- Anthropic API: Claude models for translation
- Google OAuth: Authentication
- DigitalOcean Spaces: Cloud storage

**File Format Support:**
- USFM: Standard Bible format import/export
- eBible: Internal verse storage format
- JSONL: Fine-tuning datasets
- RTF/TXT: General text imports