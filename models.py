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
    
    # Legacy relationship to projects (will be deprecated)
    projects = db.relationship('Project', foreign_keys='Project.user_id', overlaps="user,legacy_owner")
    
    def get_accessible_projects(self):
        """Get all projects user has access to (any role)"""
        from utils.project_access import ProjectAccess
        project_ids = ProjectAccess.get_accessible_projects(self.id)
        return Project.query.filter(Project.id.in_(project_ids)).order_by(Project.updated_at.desc()).all()
    
    def get_owned_projects(self):
        """Get projects where user is an owner"""
        from utils.project_access import ProjectAccess
        project_ids = ProjectAccess.get_projects_with_role(self.id, 'owner')
        return Project.query.filter(Project.id.in_(project_ids)).order_by(Project.updated_at.desc()).all()
    
    def __repr__(self):
        return f'<User {self.email}>'

class Project(db.Model):
    __tablename__ = 'projects'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)  # Legacy owner field
    created_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)  # Original creator
    
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
    texts = db.relationship('Text', backref='project', lazy=True, cascade='all, delete-orphan')
    language_rules = db.relationship('LanguageRule', backref='project', lazy=True, cascade='all, delete-orphan')
    fine_tuning_jobs = db.relationship('FineTuningJob', backref='project', lazy=True, cascade='all, delete-orphan')
    verse_audio = db.relationship('VerseAudio', backref='project', lazy=True, cascade='all, delete-orphan')
    members = db.relationship('ProjectMember', backref='project', lazy=True, cascade='all, delete-orphan')
    
    # Relationships with proper overlaps handling
    user = db.relationship('User', foreign_keys=[user_id], overlaps="legacy_owner,projects")
    creator = db.relationship('User', foreign_keys=[created_by], overlaps="created_projects")
    
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
    
    def has_member_access(self, user_id: int, required_role: str = 'viewer') -> bool:
        """Check if user has required access to this project"""
        from utils.project_access import ProjectAccess
        return ProjectAccess.has_permission(self.id, user_id, required_role)
    
    def get_user_role(self, user_id: int) -> str:
        """Get user's role in this project"""
        from utils.project_access import ProjectAccess
        return ProjectAccess.get_user_role(self.id, user_id)
    
    def get_members(self):
        """Get all members with their user details"""
        from utils.project_access import ProjectAccess
        return ProjectAccess.get_project_members(self.id)
    
    def __repr__(self):
        return f'<Project {self.target_language}>'


class ProjectMember(db.Model):
    __tablename__ = 'project_members'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    role = db.Column(db.Enum('owner', 'editor', 'viewer'), nullable=False, default='viewer')
    
    # Invitation tracking
    invited_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    invited_at = db.Column(db.DateTime, default=datetime.utcnow)
    accepted_at = db.Column(db.DateTime, nullable=True)
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    user = db.relationship('User', foreign_keys=[user_id], backref='project_memberships')
    inviter = db.relationship('User', foreign_keys=[invited_by], backref='sent_invitations')
    
    __table_args__ = (
        db.UniqueConstraint('project_id', 'user_id', name='unique_project_user'),
        db.Index('idx_project_members_project', 'project_id'),
        db.Index('idx_project_members_user', 'user_id'),
    )
    
    @property
    def is_accepted(self) -> bool:
        """Check if membership is accepted"""
        return self.accepted_at is not None
    
    def __repr__(self):
        return f'<ProjectMember {self.user_id}:{self.project_id} ({self.role})>'

class Text(db.Model):
    """Unified model for all Bible text sources - replaces ProjectFile and Translation"""
    __tablename__ = 'texts'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    name = db.Column(db.String(255), nullable=False)
    text_type = db.Column(db.Enum('source', 'draft', 'back_translation'), nullable=False)
    description = db.Column(db.Text)
    
    # Progress tracking
    total_verses = db.Column(db.Integer, default=41899)
    non_empty_verses = db.Column(db.Integer, default=0)
    progress_percentage = db.Column(db.Float, default=0.0)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    verses = db.relationship('Verse', backref='text', lazy='dynamic', cascade='all, delete-orphan')
    
    __table_args__ = (
        db.Index('idx_project_texts', 'project_id', 'text_type'),
    )
    
    def __repr__(self):
        return f'<Text {self.name} ({self.text_type})>'

class Verse(db.Model):
    """Unified verse storage - replaces ProjectFileVerse and TranslationVerse"""
    __tablename__ = 'verses'
    
    id = db.Column(db.Integer, primary_key=True)
    text_id = db.Column(db.Integer, db.ForeignKey('texts.id'), nullable=False)
    verse_index = db.Column(db.Integer, nullable=False)  # 0-31169
    verse_text = db.Column(db.Text, nullable=False)
    
    # Edit tracking fields
    last_edited_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)
    last_edited_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    edit_count = db.Column(db.Integer, default=0)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    last_editor = db.relationship('User', foreign_keys=[last_edited_by], backref='last_edited_verses')
    
    __table_args__ = (
        db.UniqueConstraint('text_id', 'verse_index', name='unique_text_verse'),
        db.Index('idx_verse_lookup', 'text_id', 'verse_index'),
        db.Index('idx_verse_last_edited', 'last_edited_by', 'last_edited_at'),
    )
    
    def get_edit_history(self, limit=50):
        """Get edit history for this verse"""
        return VerseEditHistory.query.filter_by(
            text_id=self.text_id,
            verse_index=self.verse_index
        ).order_by(VerseEditHistory.edited_at.desc()).limit(limit).all()
    
    def __repr__(self):
        return f'<Verse {self.text_id}:{self.verse_index}>'


class VerseEditHistory(db.Model):
    """Track all edits made to verses"""
    __tablename__ = 'verse_edit_history'
    
    id = db.Column(db.Integer, primary_key=True)
    text_id = db.Column(db.Integer, db.ForeignKey('texts.id'), nullable=False)
    verse_index = db.Column(db.Integer, nullable=False)
    
    # Content tracking
    previous_text = db.Column(db.Text)
    new_text = db.Column(db.Text, nullable=False)
    
    # User and timing
    edited_by = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    edited_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    # Edit metadata
    edit_type = db.Column(db.Enum('create', 'update', 'delete', 'revert'), nullable=False, default='update')
    edit_source = db.Column(db.Enum('manual', 'ai_translation', 'import', 'bulk_operation'), nullable=False, default='manual')
    
    # Optional context
    edit_comment = db.Column(db.Text)
    confidence_score = db.Column(db.Numeric(3, 2))
    
    # Relationships
    text = db.relationship('Text', backref='edit_history')
    editor = db.relationship('User', backref='verse_edits')
    
    __table_args__ = (
        db.Index('idx_verse_history', 'text_id', 'verse_index', 'edited_at'),
        db.Index('idx_user_edits', 'edited_by', 'edited_at'),
        db.Index('idx_text_recent', 'text_id', 'edited_at'),
    )
    
    def __repr__(self):
        return f'<VerseEditHistory {self.text_id}:{self.verse_index} by {self.edited_by}>'


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




class VerseAudio(db.Model):
    __tablename__ = 'verse_audio'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    
    # Reference to the text (file or translation)
    text_id = db.Column(db.String(100), nullable=False)  # Extended for iterations and future use
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
        if self.text_id.startswith('text_'):
            return 'text'
        return 'unknown'
    
    def get_text_name(self):
        """Get the name of the associated text"""
        if self.text_id.startswith('text_'):
            text_id = int(self.text_id.replace('text_', ''))
            text = Text.query.get(text_id)
            return text.name if text else 'Unknown Text'
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
    
    # Source texts for training (using unified Text model)
    source_text_id = db.Column(db.Integer, db.ForeignKey('texts.id'), nullable=False)
    target_text_id = db.Column(db.Integer, db.ForeignKey('texts.id'), nullable=False)
    
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
    source_text = db.relationship('Text', foreign_keys=[source_text_id])
    target_text = db.relationship('Text', foreign_keys=[target_text_id])
    
    def get_display_name(self):
        """Get the display name for the model"""
        return self.display_name or f"Unnamed Model {self.id}"
    
    def __repr__(self):
        return f'<FineTuningJob {self.id} ({self.status})>'


# Legacy models - still in use by the application
