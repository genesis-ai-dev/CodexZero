# CodexZero - AI-Powered Bible Translation Platform

## Overview
CodexZero is a Flask web application that provides AI-assisted Bible translation tools. It helps translators work with Biblical texts by providing AI-powered translation suggestions, back-translation quality checks, and OpenAI fine-tuning capabilities.

## Core Functionality

### Translation Projects
- Users create translation projects specifying target language, audience, and style
- Upload training materials (eBible format files, example texts)
- Define custom language rules for translation guidelines
- Set custom translation instructions (up to 4000 characters) stored directly in the database
- AI generates contextual translation suggestions using multiple AI providers

### Interactive Translation
- Real-time translation with confidence scoring
- Example-based translation using back-translation data
- Instruction-based translation using custom guidelines without examples
- Support for combined instruction + example-based translation (complementary approaches)
- Unified translation interface with conditional button states based on available methods
- Visual confidence indicators with hover tooltips showing source examples
- Support for varying numbers of translation examples (0-15)
- Configurable temperature controls and in-context learning toggles

### Fine-Tuning System
- **Regular Fine-Tuning**: Trains on all line-by-line translation pairs from paired files
- **Instruction Fine-Tuning**: Uses context-aware examples with instruction prompts (max 100 examples)
- Support for OpenAI GPT-4o and GPT-4o-mini models
- Progress tracking with background job processing
- Cost estimation and training data preview
- Custom model naming and visibility management
- Local JSONL file generation with fallback when OpenAI upload fails
- Model selection integration - fine-tuned models appear in translation dropdown

### Back-Translation Analysis
- Batch processing system using Anthropic's API for quality assessment
- Line-by-line back-translation with context preservation
- Asynchronous job processing with status tracking
- Results stored for comparison and quality evaluation
- Back translations automatically saved as project files for unified management
- Both manual uploads and auto-generated back translations appear in project file lists

### Translation Quality Testing
- Multi-line testing capability (1-50 lines) with statistical averaging
- Random ground truth selection from back-translation data
- Customizable example counts (0-25 examples each, up to 10 different counts)
- Comparative analysis with user-defined example counts across multiple lines
- Interactive charting of average accuracy trends with min/max ranges
- Accuracy scoring using fuzzy string matching (thefuzz library)
- Demonstrates impact of example quantity on translation quality with statistical confidence

## Technical Architecture

### Backend Stack
- **Framework**: Flask 2.3.3 with SQLAlchemy ORM
- **Database**: MySQL with PyMySQL connector
- **AI Integration**: 
  - **LiteLLM**: Unified interface supporting multiple AI providers
  - **Translation Models**: Claude 3.5 Sonnet + Fine-tuned GPT-4.1 models
  - **Fine-tuning**: GPT-4.1 series models only (gpt-4.1, gpt-4.1-mini, gpt-4.1-nano)
  - Anthropic Claude API for back-translation and quality assessment
- **Authentication**: Google OAuth 2.0
- **Storage**: Abstracted system supporting local and DigitalOcean Spaces
- **String Matching**: thefuzz library for translation accuracy scoring

### Key Models
```python
User -> Projects -> [ProjectFiles, LanguageRules, FineTuningJobs, Translations]
ProjectFiles -> paired_with_id (self-referential for back translations)
Project.instructions -> TEXT field for instruction-based translation (max 4000 chars)
Project.translation_model -> VARCHAR(255) for selected translation model
FineTuningJob -> tracks OpenAI fine-tuning with local JSONL backup
```

### AI Modules
- `ai/bot.py` - **LiteLLM-powered chatbot** with async/sync translation capabilities supporting multiple AI providers
- `ai/back_translator.py` - Batch back-translation using Anthropic API
- `ai/contextquery.py` - Context-aware example selection and ranking
- `ai/fine_tuning.py` - OpenAI fine-tuning service with progress tracking
- `ai/example_usage.py` - Example script demonstrating multi-provider usage

### USFM Processing
- `utils/usfm_parser.py` - USFM file parser and eBible format converter
- Cross-language text cleaning with Strong's number and markup removal
- Master verse reference mapping for proper Biblical verse ordering

### Storage System
- Pluggable storage architecture (`storage/`)
- Support for local filesystem and DigitalOcean Spaces
- File management with secure paths and metadata tracking

## Project Structure
```
├── ai/                     # AI functionality modules
├── Corpus/                 # Pre-existing eBible translations for import
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
├── config.py              # Configuration management
├── migrate_fine_tuning.py # Database migration script
└── FINE_TUNING_GUIDE.md   # Fine-tuning documentation
```

## Key Features

### File Handling
- Unified file importer component across project creation, editing, and dashboard
- Secure file uploads with type validation and automatic file type detection
- Support for multiple file types: eBible format, target text, back translations, USFM, and training data
- **Corpus Import System**: Pre-existing eBible translations available for import from `/Corpus` directory
- Project-specific file organization with visual file type indicators
- File upload via drag-and-drop, file selection, or text paste
- Automatic file metadata extraction and storage management
- File pairing system for parallel texts
- Protected file deletion with cascade handling for relationships
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
- **LiteLLM Multi-Provider Support**: Unified interface for OpenAI and Anthropic providers
- **Simplified Model Selection**: Claude 3.5 Sonnet for base translation + custom fine-tuned GPT-4.1 models
- **Focused Fine-tuning**: GPT-4.1 series models only for specialized translation tasks
- Async/sync operation modes
- Batch processing for large translation jobs
- Context-aware translation with audience/style targeting
- Confidence scoring with substring matching algorithms
- Fine-tuned model integration with automatic model discovery

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

### Modern Dashboard Interface
- Clean, full-width dashboard design without card-based layouts
- Marker pen aesthetic with black borders and minimal color palette
- Icon-only header navigation for streamlined user experience
- Focused information display eliminating redundant metrics
- Consistent styling across all interactive elements

## Development Philosophy
**FAIL FAST AND LOUD** - The codebase explicitly avoids defensive programming patterns, error handling, and input validation. See `CODING_RULES.md` for detailed guidelines on this approach.

## UI/UX Design Philosophy
**MARKER ON OFF-WHITE** - The interface uses a clean, marker pen aesthetic with black borders and minimal colors (primarily black and green). Design principles include:
- Full-width dashboard layouts without card styling
- Consistent rounded corners (≈5px) and black borders on all interactive elements
- Icon-only buttons in headers for clean navigation
- Elimination of redundant information displays
- Focus on essential functionality over decorative metrics

## Configuration
- Environment-based configuration via `.env`
- Database URL configuration for flexible deployment
- Google OAuth client credentials
- Anthropic API key integration (`ANTHROPIC_API_KEY`)
- OpenAI API key integration (`OPENAI_API_KEY`)
- Storage configuration (local vs DigitalOcean Spaces)

## Required Dependencies
```
Flask==2.3.3
Flask-SQLAlchemy==3.0.5
Werkzeug==2.3.7
openai>=1.55.3
anthropic>=0.25.0
litellm>=1.0.0
python-dotenv==1.0.0
Flask-Login==0.6.3
bcrypt==4.0.1
Jinja2==3.1.2
gunicorn==21.2.0
requests==2.31.0
google-auth-oauthlib
google-auth
pymysql
thefuzz
vref-utils==0.0.10
boto3
```

## Deployment
- Designed for cloud deployment (PythonAnywhere, DigitalOcean)
- **Digital Ocean**: See `DIGITAL_OCEAN_DEPLOY.md` for complete step-by-step guide
- MySQL database requirement with migration script support
- HTTPS recommended for production
- Environment variable management for secrets
- Debug mode must be disabled for production
- Requires both OpenAI and Anthropic API keys for full functionality

## Database Migrations
Run `python migrate_fine_tuning.py` to update database schema for fine-tuning features.

When in the actual project you see anything that contradicts the readme, please update the readme! When you add a new feature, update the readme. Keep it concise.