# CodexZero - AI-Powered Bible Translation Platform

## Overview
CodexZero is a Flask web application that provides AI-assisted Bible translation tools. It helps translators work with Biblical texts by providing AI-powered translation suggestions and back-translation quality checks.

## Core Functionality

### Translation Projects
- Users create translation projects specifying target language, audience, and style
- Upload training materials (eBible format files, example texts)
- Define custom language rules for translation guidelines
- Set custom translation instructions (up to 4000 characters) stored directly in the database
- AI generates contextual translation suggestions using Anthropic Claude

### Interactive Translation
- Real-time translation with confidence scoring
- Example-based translation using back-translation data
- Instruction-based translation using custom guidelines without examples
- Support for combined instruction + example-based translation (complementary approaches)
- Unified translation interface with conditional button states based on available methods
- Visual confidence indicators with hover tooltips showing source examples
- Support for varying numbers of translation examples (0-15)

### Back-Translation Analysis
- Batch processing system using Anthropic's API for quality assessment
- Line-by-line back-translation with context preservation
- Asynchronous job processing with status tracking
- Results stored for comparison and quality evaluation
- Back translations automatically saved as project files for unified management
- Both manual uploads and auto-generated back translations appear in project file lists

### Translation Quality Testing
- Automated testing harness to evaluate AI translation performance (**"Benchmark Translation Methods"**)
- Multi-line testing capability (1-50 lines) with statistical averaging
- Random ground truth selection from back-translation data
- Customizable example counts (0-25 examples each, up to 10 different counts)
- Comparative analysis with user-defined example counts across multiple lines
- Interactive charting of average accuracy trends with min/max ranges
- Accuracy scoring using fuzzy string matching (thefuzz library)
- Demonstrates impact of example quantity on translation quality with statistical confidence

## Technical Architecture

### Backend Stack
- **Framework**: Flask 3.0.0 with SQLAlchemy ORM
- **Database**: MySQL with PyMySQL connector
- **AI Integration**: Anthropic Claude API (claude-sonnet-4-20250514)
- **Authentication**: Google OAuth 2.0
- **Storage**: Abstracted system supporting local and DigitalOcean Spaces
- **String Matching**: thefuzz library for translation accuracy scoring

### Key Models
```python
User -> Projects -> [ProjectFiles, LanguageRules, BackTranslationJobs]
ProjectFiles -> paired_with_id (self-referential for back translations)
Project.instructions -> TEXT field for instruction-based translation (max 4000 chars)
```

### AI Modules
- `ai/bot.py` - General purpose chatbot with translation specialization
- `ai/back_translator.py` - Batch back-translation using Anthropic API
- `ai/contextquery.py` - Context-aware example selection and ranking

### USFM Processing
- `utils/usfm_parser.py` - USFM file parser and eBible format converter
- Cross-language text cleaning with Strong's number and markup removal
- Master verse reference mapping for proper Biblical verse ordering

### Storage System
- Pluggable storage architecture (`storage/`)
- Support for local filesystem and cloud storage (DigitalOcean Spaces)
- File management with secure paths and metadata tracking

## Project Structure
```
├── ai/                     # AI functionality modules
├── data/                   # Reference data (vref.txt - 31,170 Bible verses)
├── static/css/js/         # Frontend assets
├── storage/               # File storage abstraction + temp USFM files
├── templates/             # Jinja2 HTML templates (including usfm_import.html)
├── uploads/projects/      # User-uploaded project files
├── utils/                 # Utility modules (usfm_parser.py)
├── app.py                 # Main Flask application
├── models.py              # Database models
├── auth.py                # Google OAuth implementation
├── translation.py         # Translation blueprint with testing
└── config.py              # Configuration management
```

## Key Features

### File Handling
- Unified file importer component across project creation, editing, and dashboard
- Secure file uploads with type validation and automatic file type detection
- Support for multiple file types: eBible format, target text, back translations, and USFM
- Project-specific file organization with visual file type indicators
- File upload via drag-and-drop, file selection, or text paste
- Automatic file metadata extraction and storage management
- Protected file deletion requiring download before deletion is permitted
- Dedicated download endpoints with proper attachment headers for file downloads

### USFM Import System
- Dedicated USFM import page with progressive upload tracking
- Advanced USFM parser removes Strong's numbers, markup, and annotations while preserving cross-language text
- Session-based workflow using temporary server files (not browser sessions)
- Real-time progress visualization with completion percentage and verse counts
- Incremental Bible building - upload books one at a time or in batches
- Smart verse mapping using master vref.txt template (31,170 verses)
- Final eBible creation treated exactly like regular eBible imports with download support

### AI Integration
- Async/sync Anthropic Claude integration
- Batch processing for large translation jobs
- Context-aware translation with audience/style targeting
- Confidence scoring with substring matching algorithms

### Translation Quality Assessment
- Real-time confidence visualization with color-coded segments
- Custom tooltip system with Popper.js for source example display
- Automated testing framework for translation performance evaluation
- Multi-line statistical analysis with Chart.js visualization
- Interactive graphs showing accuracy trends across different example counts
- Statistical analysis of example impact on translation accuracy with confidence intervals

### User Management
- Google OAuth-only authentication
- Project ownership and access control
- Session management with secure cookies

## Development Philosophy
**FAIL FAST AND LOUD** - The codebase explicitly avoids defensive programming patterns, error handling, and input validation. See `CODING_RULES.md` for detailed guidelines on this approach.

## Configuration
- Environment-based configuration via `.env`
- Database URL configuration for flexible deployment
- Google OAuth client credentials
- Anthropic API key integration

## Deployment
- Designed for cloud deployment (PythonAnywhere, DigitalOcean)
- MySQL database requirement
- HTTPS recommended for production
- Environment variable management for secrets 

When in the actual project you see anything that contradicts the readme, please update the readme! When you add a new feature, update the readme. I think keep it concise.