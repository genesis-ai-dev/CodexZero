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
    
    # Project metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    files = db.relationship('ProjectFile', backref='project', lazy=True, cascade='all, delete-orphan')
    language_rules = db.relationship('LanguageRule', backref='project', lazy=True, cascade='all, delete-orphan')
    
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
    
    # Pairing relationship for back translations
    paired_with_id = db.Column(db.Integer, db.ForeignKey('project_files.id'), nullable=True)
    paired_with = db.relationship('ProjectFile', remote_side=[id], backref='back_translations')
    
    # File metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
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

class BackTranslationJob(db.Model):
    __tablename__ = 'back_translation_jobs'
    
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('projects.id'), nullable=False)
    
    # Batch details
    batch_id = db.Column(db.String(100), nullable=False)  # Anthropic batch ID
    status = db.Column(db.String(50), default='in_progress')  # in_progress, completed, failed, expired
    total_lines = db.Column(db.Integer, nullable=False)
    processed_lines = db.Column(db.Integer, default=0)
    
    # Source data
    source_filename = db.Column(db.String(255), nullable=False)
    source_content_path = db.Column(db.String(500))  # Path to source content in storage
    
    # Results
    back_translations = db.Column(db.Text)  # JSON array of results (metadata only)
    results_storage_path = db.Column(db.String(500))  # Path to full results in storage
    project_file_id = db.Column(db.Integer, db.ForeignKey('project_files.id'), nullable=True)  # Link to ProjectFile entry
    error_message = db.Column(db.Text)
    
    # Metadata
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = db.Column(db.DateTime)
    
    def __repr__(self):
        return f'<BackTranslationJob {self.batch_id}>' 