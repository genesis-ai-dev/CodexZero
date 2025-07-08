from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin
from datetime import datetime

db = SQLAlchemy()

class User(UserMixin, db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    google_id = db.Column(db.String(100), unique=True, nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    name = db.Column(db.String(100), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    last_login = db.Column(db.DateTime)
    
    # Relationship to projects
    projects = db.relationship('Project', backref='user', lazy=True, cascade='all, delete-orphan')
    
    def __repr__(self):
        return f'<User {self.email}>'

class Project(db.Model):
    __tablename__ = 'projects'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    
    # Project details
    target_language = db.Column(db.String(100), nullable=False)
    audience = db.Column(db.String(200), nullable=False)
    style = db.Column(db.String(200), nullable=False)
    
    # Instruction-based translation
    instructions = db.Column(db.Text, nullable=True)
    
    # Translation model selection
    translation_model = db.Column(db.String(255), nullable=True)  # Selected model for translations
    
    # Project metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    files = db.relationship('ProjectFile', backref='project', lazy=True, cascade='all, delete-orphan')
    language_rules = db.relationship('LanguageRule', backref='project', lazy=True, cascade='all, delete-orphan')
    translations = db.relationship('Translation', backref='project', lazy=True, cascade='all, delete-orphan')
    fine_tuning_jobs = db.relationship('FineTuningJob', backref='project', lazy=True, cascade='all, delete-orphan')
    verse_audio = db.relationship('VerseAudio', backref='project', lazy=True, cascade='all, delete-orphan')
    
    def get_available_translation_models(self):
        """Get available translation models including fine-tuned ones"""
        from ai.fine_tuning import FineTuningService
        
        ft_service = FineTuningService()
        return ft_service.get_all_models()
    
    def get_default_translation_model(self):
        """Get the default translation model (most recent fine-tuned or fallback to Claude 3.5 Sonnet)"""
        # Check for most recent completed fine-tuned model
        latest_job = FineTuningJob.query.filter_by(
            project_id=self.id,
            status='completed'
        ).filter(FineTuningJob.model_name.isnot(None)).order_by(
            FineTuningJob.completed_at.desc()
        ).first()
        
        if latest_job and latest_job.model_name:
            return latest_job.model_name
        
        # Fallback to Claude 3.5 Sonnet
        return 'claude-3-5-sonnet-20241022'
    
    def get_current_translation_model(self):
        """Get the currently selected translation model or default"""
        return self.translation_model or self.get_default_translation_model()
    
    def __repr__(self):
        return f'<Project {self.target_language}>'

class ProjectFile(db.Model):
    __tablename__ = 'project_files'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    
    # File details
    original_filename = db.Column(db.String(255), nullable=False)
    storage_path = db.Column(db.String(500), nullable=False)
    file_type = db.Column(db.String(50), nullable=False)  # 'ebible', 'text', 'usfm', 'back_translation', etc.
    content_type = db.Column(db.String(100), nullable=False)
    file_size = db.Column(db.BigInteger, nullable=False)
    line_count = db.Column(db.Integer, nullable=False, default=0)
    
    # File purpose system (replaces pairing)
    purpose_description = db.Column(db.Text, nullable=True)  # e.g., "Modern English reference translation"
    file_purpose = db.Column(db.String(100), nullable=True)  # e.g., "reference", "target", "style_guide"
    
    # Legacy pairing relationship for back translations (deprecated)
    paired_with_id = db.Column(db.Integer, db.ForeignKey('project_files.id'), nullable=True)
    paired_with = db.relationship('ProjectFile', remote_side=[id], backref='back_translations')
    
    # File metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    def get_line_count(self):
        """Get the cached line count from database"""
        return self.line_count
    
    def get_purpose_display(self):
        """Get a display-friendly purpose description"""
        if self.purpose_description:
            return self.purpose_description
        elif self.file_purpose:
            return self.file_purpose.replace('_', ' ').title()
        else:
            return "Reference text"
    
    def __repr__(self):
        return f'<ProjectFile {self.original_filename}>'



class LanguageRule(db.Model):
    __tablename__ = 'language_rules'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    
    # Rule details
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text, nullable=False)
    order_index = db.Column(db.Integer, nullable=False, default=0)
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f'<LanguageRule {self.title}>'

class Translation(db.Model):
    __tablename__ = 'translations'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    
    # Translation details
    name = db.Column(db.String(255), nullable=False)
    storage_path = db.Column(db.String(500), nullable=False)
    
    # Type and source information
    translation_type = db.Column(db.String(50), default='draft')  # 'draft', 'source', 'back_translation'
    source_language = db.Column(db.String(100))  # Language code or name
    target_language = db.Column(db.String(100))  # Language code or name
    is_complete = db.Column(db.Boolean, default=False)  # Whether this translation is complete
    
    # Progress tracking
    total_verses = db.Column(db.Integer, default=31170)  # Total verses in Bible
    translated_verses = db.Column(db.Integer, default=0)
    progress_percentage = db.Column(db.Float, default=0.0)
    
    # Metadata
    description = db.Column(db.Text)  # Optional description
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f'<Translation {self.name} ({self.translation_type})>'


class VerseAudio(db.Model):
    __tablename__ = 'verse_audio'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    
    # Reference to the text (file or translation)
    text_id = db.Column(db.String(50), nullable=False)  # 'file_123' or 'translation_456'
    verse_index = db.Column(db.Integer, nullable=False)  # 0-based line number
    
    # Audio file details
    original_filename = db.Column(db.String(255), nullable=False)
    storage_path = db.Column(db.String(500), nullable=False)
    content_type = db.Column(db.String(100), nullable=False)  # audio/mpeg, audio/wav, etc.
    file_size = db.Column(db.BigInteger, nullable=False)
    
    # Audio metadata (optional)
    duration_seconds = db.Column(db.Float, nullable=True)  # Audio duration in seconds
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Constraints: one audio file per verse per text
    __table_args__ = (
        db.UniqueConstraint('project_id', 'text_id', 'verse_index', name='unique_verse_audio'),
    )
    
    def get_text_type(self):
        """Get the type of text this audio is associated with"""
        if self.text_id.startswith('file_'):
            return 'file'
        elif self.text_id.startswith('translation_'):
            return 'translation'
        return 'unknown'
    
    def get_text_name(self):
        """Get the name of the associated text"""
        if self.text_id.startswith('file_'):
            file_id = int(self.text_id.replace('file_', ''))
            project_file = ProjectFile.query.get(file_id)
            return project_file.original_filename if project_file else 'Unknown File'
        elif self.text_id.startswith('translation_'):
            translation_id = int(self.text_id.replace('translation_', ''))
            translation = Translation.query.get(translation_id)
            return translation.name if translation else 'Unknown Translation'
        return 'Unknown'
    
    def __repr__(self):
        return f'<VerseAudio {self.text_id}:{self.verse_index}>'

class FineTuningJob(db.Model):
    __tablename__ = 'fine_tuning_jobs'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    
    # Job identification
    openai_job_id = db.Column(db.String(100), nullable=True)  # OpenAI's job ID
    model_name = db.Column(db.String(255), nullable=True)  # Custom model name when complete
    display_name = db.Column(db.String(255), nullable=True)  # User-friendly display name
    hidden = db.Column(db.Boolean, default=False)  # Whether this model is hidden from selection dropdown
    
    # Source files for training
    source_file_id = db.Column(db.Integer, db.ForeignKey('project_files.id'), nullable=False)
    target_file_id = db.Column(db.Integer, db.ForeignKey('project_files.id'), nullable=False)
    
    # Training data
    training_file_path = db.Column(db.String(500), nullable=True)  # Local JSONL file path
    openai_file_id = db.Column(db.String(100), nullable=True)  # OpenAI uploaded file ID
    
    # Job status and progress
    status = db.Column(db.String(50), default='preparing')  # preparing, uploading, training, completed, failed
    progress_message = db.Column(db.Text, nullable=True)
    error_message = db.Column(db.Text, nullable=True)
    
    # Training parameters
    base_model = db.Column(db.String(100), default='gpt-4o-mini')
    training_examples = db.Column(db.Integer, nullable=True)  # Number of training examples generated
    
    # Instruction fine-tuning specific fields
    is_instruction_tuning = db.Column(db.Boolean, default=False)  # Whether this is instruction fine-tuning
    query_text = db.Column(db.Text, nullable=True)  # The instruction query text used
    max_examples = db.Column(db.Integer, nullable=True)  # Max examples limit for instruction tuning
    
    # Costs and usage
    estimated_cost = db.Column(db.Float, nullable=True)
    actual_cost = db.Column(db.Float, nullable=True)
    trained_tokens = db.Column(db.Integer, nullable=True)
    
    # Timestamps
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    started_at = db.Column(db.DateTime, nullable=True)
    completed_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    source_file = db.relationship('ProjectFile', foreign_keys=[source_file_id])
    target_file = db.relationship('ProjectFile', foreign_keys=[target_file_id])
    
    def get_display_name(self):
        """Get the display name for the model"""
        return self.display_name or f"Unnamed Model {self.id}"
    
    def __repr__(self):
        return f'<FineTuningJob {self.id} ({self.status})>' 