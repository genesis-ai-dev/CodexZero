import os
import asyncio
import uuid
import io
import json
import threading
import traceback
from werkzeug.utils import secure_filename
from flask import Flask, render_template, flash, get_flashed_messages, request, redirect, url_for, jsonify, send_file, session
from flask_login import LoginManager, current_user, login_required
from datetime import datetime

from config import Config
from models import db, User, Project, ProjectFile, LanguageRule, Translation, FilePair, FineTuningJob
from auth import auth
from translation import translation
from ai.bot import Chatbot
from ai.fine_tuning import FineTuningService
from storage import get_storage


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Initialize extensions
    db.init_app(app)
    
    # Setup Login Manager
    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Please log in to access this page.'
    login_manager.login_message_category = 'info'
    
    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))
    
    # Register blueprints
    app.register_blueprint(auth, url_prefix='/auth')
    app.register_blueprint(translation)
    
    # Create database tables (only if database is accessible)
    with app.app_context():
        try:
            db.create_all()
            print("Database tables created successfully")
        except Exception as e:
            print(f"Database connection failed during startup: {e}")
            print("App will start without database initialization")
    
    return app

app = create_app()

def save_project_file(project_id: int, file_data, filename: str, file_type: str, content_type: str):
    """Helper to save any type of project file"""
    storage = get_storage()
    file_id = str(uuid.uuid4())
    storage_path = f"projects/{project_id}/{file_type}/{file_id}_{filename}"
    
    # Handle both uploaded files and text data
    if isinstance(file_data, str):
        # Text data - convert to BytesIO
        file_obj = io.BytesIO(file_data.encode('utf-8'))
        file_size = len(file_data.encode('utf-8'))
        line_count = len(file_data.splitlines())
    else:
        # File upload - read content for size and line count
        content = file_data.read()
        file_size = len(content)
        line_count = len(content.decode('utf-8').splitlines())
        file_data.seek(0)
        file_obj = file_data
    
    # Try to store file with error handling for storage connection issues
    try:
        storage.store_file(file_obj, storage_path)
    except Exception as e:
        print(f"Storage connection failed: {e}")
        # Log the full error for debugging
        import traceback
        print(f"Full storage error: {traceback.format_exc()}")
        raise Exception(f"File storage unavailable. Please check storage configuration or contact support. Error: {str(e)}")
    
    project_file = ProjectFile(
        project_id=project_id,
        original_filename=filename,
        storage_path=storage_path,
        file_type=file_type,
        content_type=content_type,
        file_size=file_size,
        line_count=line_count
    )
    db.session.add(project_file)
    return project_file

def save_language_rules(project_id: int, rules_json: str):
    """Helper to save language rules for a project"""
    
    if not rules_json:
        return
    
    try:
        rules_data = json.loads(rules_json)
    except (json.JSONDecodeError, TypeError):
        return
    
    # Get existing rules for this project
    existing_rules = {rule.id: rule for rule in LanguageRule.query.filter_by(project_id=project_id).all()}
    processed_rule_ids = set()
    
    for rule_data in rules_data:
        title = rule_data.get('title', '').strip()
        description = rule_data.get('description', '').strip()
        order_index = rule_data.get('order_index', 0)
        rule_id = rule_data.get('id')
        
        if not title and not description:
            continue
        
        if rule_id and rule_id in existing_rules:
            # Update existing rule
            rule = existing_rules[rule_id]
            rule.title = title
            rule.description = description
            rule.order_index = order_index
            processed_rule_ids.add(rule_id)
        else:
            # Create new rule
            rule = LanguageRule(
                project_id=project_id,
                title=title,
                description=description,
                order_index=order_index
            )
            db.session.add(rule)
    
    # Remove rules that weren't included in the update
    for rule_id, rule in existing_rules.items():
        if rule_id not in processed_rule_ids:
            db.session.delete(rule)

def import_ulb_automatically(project_id: int):
    """Automatically import the ULB (Unlocked Literal Bible) into a new project"""
    corpus_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Corpus')
    ulb_filename = 'eng-engULB.txt'
    ulb_file_path = os.path.join(corpus_dir, ulb_filename)
    
    # Check if ULB file exists
    if not os.path.exists(ulb_file_path):
        print(f"ULB file not found at {ulb_file_path}")
        return
    
    # Check if project already has a ULB file to avoid duplicates
    existing_ulb = ProjectFile.query.filter(
        ProjectFile.project_id == project_id,
        ProjectFile.original_filename.contains('ULB')
    ).first()
    
    if existing_ulb:
        print(f"Project {project_id} already has a ULB file")
        return
    
    try:
        # Read the ULB file content
        with open(ulb_file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()
        
        # Generate a descriptive filename
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        project_filename = f"English_ULB_auto_imported_{timestamp}.txt"
        
        # Save as project file
        save_project_file(
            project_id,
            file_content,
            project_filename,
            'ebible',  # ULB is in eBible format
            'text/plain'
        )
        
        print(f"Successfully auto-imported ULB for project {project_id}")
        
    except Exception as e:
        print(f"Error auto-importing ULB for project {project_id}: {e}")
        raise

@app.route('/')
def index():
    # In development mode, if user is not authenticated, redirect to dev login
    if app.config.get('DEVELOPMENT_MODE') and not current_user.is_authenticated:
        return redirect(url_for('auth.dev_login'))
    return render_template('index.html')

@app.route('/dev')
def dev_shortcut():
    """Quick development login shortcut"""
    if not app.config.get('DEVELOPMENT_MODE'):
        flash('Development shortcuts not available in production', 'error')
        return redirect(url_for('index'))
    return redirect(url_for('auth.dev_login'))

@app.route('/health')
def health():
    """Simple health check endpoint"""
    try:
        # Test database connection with proper SQLAlchemy syntax
        from sqlalchemy import text
        db.session.execute(text('SELECT 1'))
        db_status = "OK"
    except Exception as e:
        db_status = f"ERROR: {str(e)}"
    
    return {
        "status": "OK" if db_status == "OK" else "DEGRADED",
        "database": db_status,
        "database_url": os.environ.get('DATABASE_URL', 'Not set')[:50] + "..." if os.environ.get('DATABASE_URL') else 'Not set',
        "storage_type": os.environ.get('STORAGE_TYPE', 'Not set')
    }

@app.route('/dashboard')
@login_required
def dashboard():
    """User dashboard showing their projects"""
    projects = Project.query.filter_by(user_id=current_user.id).order_by(Project.updated_at.desc()).all()
    return render_template('dashboard.html', projects=projects)

@app.route('/project/new')
@login_required
def new_project():
    """Show new project creation form"""
    return render_template('new_project.html')

@app.route('/project', methods=['POST'])
@login_required
def create_project():
    """Create a new project with optional file upload"""
    target_language = request.form.get('target_language', '').strip()
    audience = request.form.get('audience', '').strip()
    style = request.form.get('style', '').strip()
    
    # Create project
    project = Project(
        user_id=current_user.id,
        target_language=target_language,
        audience=audience,
        style=style
    )
    
    db.session.add(project)
    db.session.flush()
    
    # Handle language rules
    language_rules = request.form.get('language_rules', '')
    save_language_rules(project.id, language_rules)
    
    # Handle file uploads with unified importer
    file_type = request.form.get('file_type', '')
    upload_method = request.form.get('upload_method', '')
    
    if file_type and upload_method:
        project_file = None
        
        if upload_method == 'file' and 'text_file' in request.files:
            file = request.files['text_file']
            if file.filename:
                project_file = save_project_file(
                    project.id, 
                    file, 
                    secure_filename(file.filename), 
                    file_type, 
                    file.content_type
                )
        elif upload_method == 'text':
            text_content = request.form.get('text_content', '').strip()
            if text_content:
                timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                project_file = save_project_file(
                    project.id, 
                    text_content, 
                    f"text_{timestamp}.txt", 
                    file_type, 
                    'text/plain'
                )
        
        # Handle pairing for back translations
        if project_file and file_type == 'back_translation':
            paired_with_id = request.form.get('paired_with_id')
            if paired_with_id:
                project_file.paired_with_id = int(paired_with_id)
    
    # Legacy: Handle separate field uploads (for backwards compatibility)
    if 'ebible_file' in request.files:
        file = request.files['ebible_file']
        if file.filename:
            save_project_file(
                project.id, 
                file, 
                secure_filename(file.filename), 
                'ebible', 
                file.content_type
            )
    
    # Legacy: Handle example text (for backwards compatibility)
    example_text = request.form.get('example_text', '').strip()
    if example_text:
        save_project_file(
            project.id, 
            example_text, 
            "example_text.txt", 
            'text', 
            'text/plain'
        )
    
    # Automatically import ULB (Unlocked Literal Bible) if available
    try:
        import_ulb_automatically(project.id)
    except Exception as e:
        print(f"Warning: Could not auto-import ULB for project {project.id}: {e}")
    
    db.session.commit()
    flash('Project created successfully!', 'success')
    return redirect(url_for('dashboard'))

@app.route('/project/<int:project_id>')
@login_required
def view_project(project_id):
    """View a specific project"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    # Get available text files for back translation with line counts
    text_files = []
    total_available_lines = 0
    
    for file in project.files:
        if file.file_type in ['ebible', 'text']:
            file_data = {
                'id': file.id,
                'original_filename': file.original_filename,
                'file_type': file.file_type,
                'file_size': file.file_size,
                'storage_path': file.storage_path,
                'line_count': 0
            }
            
            try:
                storage = get_storage()
                file_content_bytes = storage.get_file(file.storage_path)
                file_content = safe_decode_content(file_content_bytes)
                all_lines = file_content.split('\n')
                file_data['line_count'] = len(all_lines)
                
                # Use the first file's line count as total for backward compatibility
                if not text_files:  # First file
                    total_available_lines = len(all_lines)
                    
            except Exception as e:
                print(f"Error calculating line count for {file.original_filename}: {e}")
                file_data['line_count'] = 0
            
            text_files.append(file_data)
    
    return render_template('project.html', 
                         project=project, 
                         total_available_lines=total_available_lines, 
                         text_files=text_files)

@app.route('/project/<int:project_id>/edit')
@login_required
def edit_project(project_id):
    """Show edit project form"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    return render_template('edit_project.html', project=project)

@app.route('/project/<int:project_id>/update', methods=['POST'])
@login_required
def update_project(project_id):
    """Update an existing project"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first()
    
    project.target_language = request.form.get('target_language', project.target_language).strip()
    project.audience = request.form.get('audience', project.audience).strip()
    project.style = request.form.get('style', project.style).strip()
    project.updated_at = datetime.utcnow()
    
    # Handle language rules
    language_rules = request.form.get('language_rules', '')
    save_language_rules(project.id, language_rules)
    
    # Handle new file uploads with unified importer
    # eBible file upload
    if 'ebible_file' in request.files:
        file = request.files['ebible_file']
        if file.filename:
            save_project_file(
                project.id, 
                file, 
                secure_filename(file.filename), 
                'ebible', 
                file.content_type
            )
    
    # Target text (file or paste)
    upload_method = request.form.get('upload_method', '')
    if upload_method == 'file' and 'target_text_file' in request.files:
        file = request.files['target_text_file']
        if file.filename:
            save_project_file(
                project.id, 
                file, 
                secure_filename(file.filename), 
                'text', 
                file.content_type
            )
    elif upload_method == 'text':
        target_text_content = request.form.get('target_text_content', '').strip()
        if target_text_content:
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            save_project_file(
                project.id, 
                target_text_content, 
                f"target_text_{timestamp}.txt", 
                'text', 
                'text/plain'
            )
    
    # Back translation file upload
    if 'back_translation_file' in request.files:
        file = request.files['back_translation_file']
        if file.filename:
            save_project_file(
                project.id, 
                file, 
                secure_filename(file.filename), 
                'back_translation', 
                file.content_type
            )
    
    # Legacy: Handle example text (for backwards compatibility)
    example_text = request.form.get('example_text', '').strip()
    if example_text:
        save_project_file(
            project.id, 
            example_text, 
            "example_text.txt", 
            'text', 
            'text/plain'
        )
    
    db.session.commit()
    flash('Project updated successfully!', 'success')
    return redirect(url_for('view_project', project_id=project.id))

@app.route('/project/<int:project_id>/update-instructions', methods=['POST'])
@login_required
def update_instructions(project_id):
    """Update project instructions via AJAX"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    instructions = data.get('instructions', '').strip()
    
    if len(instructions) > 4000:
        return jsonify({'error': 'Instructions must be 4000 characters or less'}), 400
    
    project.instructions = instructions if instructions else None
    project.updated_at = datetime.utcnow()
    
    db.session.commit()
    
    return jsonify({'success': True})

@app.route('/project/<int:project_id>/files/<int:file_id>', methods=['DELETE'])
@login_required
def delete_project_file(project_id, file_id):
    """Delete a project file and associated relationships"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    project_file = ProjectFile.query.filter_by(id=file_id, project_id=project.id).first_or_404()
    
    # Delete any FilePair relationships involving this file
    file_pairs = FilePair.query.filter(
        db.or_(
            FilePair.file1_id == file_id,
            FilePair.file2_id == file_id
        ),
        FilePair.project_id == project_id
    ).all()
    
    for pair in file_pairs:
        db.session.delete(pair)
    
    # Delete any fine-tuning jobs involving this file
    fine_tuning_jobs = FineTuningJob.query.filter(
        db.or_(
            FineTuningJob.source_file_id == file_id,
            FineTuningJob.target_file_id == file_id
        ),
        FineTuningJob.project_id == project_id
    ).all()
    
    for job in fine_tuning_jobs:
        db.session.delete(job)
    
    # Delete from storage (if file exists)
    storage = get_storage()
    try:
        storage.delete_file(project_file.storage_path)
    except Exception as e:
        # Log the error but continue with database deletion
        print(f"Warning: Could not delete file from storage: {e}")
        # This is not a fatal error - the file might already be deleted
    
    # Delete file from database
    db.session.delete(project_file)
    db.session.commit()
    
    return '', 204  # No content response

@app.route('/project/<int:project_id>/upload-file', methods=['POST'])
@login_required
def upload_file_unified(project_id):
    """Unified file upload endpoint for all file types with pairing support"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    upload_type = request.form.get('upload_type', 'regular')
    
    try:
        if upload_type == 'usfm':
            # Handle USFM file upload
            return handle_usfm_upload(project_id, project)
        else:
            # Handle regular file upload (existing logic)
            return handle_regular_upload(project_id, project)
            
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

def handle_usfm_upload(project_id, project):
    """Handle USFM file upload and conversion to eBible format"""
    from utils.usfm_parser import USFMParser, EBibleBuilder
    
    if 'usfm_files' not in request.files:
        return jsonify({'error': 'No USFM files provided'}), 400
    
    files = request.files.getlist('usfm_files')
    if not files or len(files) == 0:
        return jsonify({'error': 'No USFM files selected'}), 400
    
    # Validate file types
    for file in files:
        if not file.filename:
            return jsonify({'error': 'Empty filename in upload'}), 400
        
        extension = file.filename.lower().split('.')[-1]
        if extension not in ['usfm', 'sfm', 'txt']:
            return jsonify({'error': f'Invalid file type: {file.filename}. Only .usfm, .sfm, and .txt files are allowed'}), 400
    
    # Initialize USFM parser and eBible builder
    parser = USFMParser()
    vref_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'vref.txt')
    builder = EBibleBuilder(vref_path)
    
    # Check if there's already a USFM-generated eBible file
    existing_ebible = ProjectFile.query.filter_by(
        project_id=project_id,
        file_type='usfm_ebible'
    ).first()
    
    existing_ebible_lines = None
    if existing_ebible:
        # Load existing eBible content
        with open(existing_ebible.storage_path, 'r', encoding='utf-8') as f:
            existing_ebible_lines = [line.rstrip('\n') for line in f.readlines()]
    
    # Parse all uploaded USFM files
    all_verses = {}
    processed_books = []
    
    for file in files:
        try:
            content = file.read().decode('utf-8')
            file_verses = parser.parse_file(content)
            all_verses.update(file_verses)
            
            # Track which books were processed
            if parser.current_book:
                processed_books.append(parser.current_book)
                
        except Exception as e:
            return jsonify({'error': f'Error parsing {file.filename}: {str(e)}'}), 400
    
    if not all_verses:
        return jsonify({'error': 'No verses found in the uploaded files'}), 400
    
    # Create or update eBible format
    ebible_lines = builder.create_ebible_from_usfm_verses(all_verses, existing_ebible_lines)
    
    # Get statistics
    stats = builder.get_completion_stats(ebible_lines)
    
    # Save the eBible file
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    if existing_ebible:
        # Update existing file
        with open(existing_ebible.storage_path, 'w', encoding='utf-8') as f:
            for line in ebible_lines:
                f.write(line + '\n')
        
        # Update file size
        existing_ebible.file_size = os.path.getsize(existing_ebible.storage_path)
        existing_ebible.created_at = datetime.utcnow()  # Update timestamp
        db.session.commit()
        
        message = f'USFM files processed and merged into existing eBible. Added/updated {len(all_verses)} verses.'
        project_file = existing_ebible
        
    else:
        # Create new eBible file
        filename = f"ebible_from_usfm_{timestamp}.txt"
        ebible_content = '\n'.join(ebible_lines)
        
        project_file = save_project_file(
            project_id,
            ebible_content,
            filename,
            'usfm_ebible',
            'text/plain'
        )
        
        db.session.commit()
        
        message = f'USFM files converted to eBible format. Processed {len(all_verses)} verses.'
    
    # Generate detailed response
    processed_books_str = ', '.join(set(processed_books)) if processed_books else 'Multiple books'
    
    return jsonify({
        'success': True,
        'message': f'{message} Books processed: {processed_books_str}',
        'file_id': project_file.id,
        'stats': stats,
        'processed_books': processed_books,
        'verses_added': len(all_verses)
    })

def handle_regular_upload(project_id, project):
    """Handle regular file upload (non-USFM)"""
    file_type = request.form.get('file_type', '')
    upload_method = request.form.get('upload_method', 'file')
    
    # Handle file content
    if upload_method == 'file':
        if 'text_file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['text_file']
        if not file.filename:
            return jsonify({'error': 'No file selected'}), 400
        
        if not file.filename.lower().endswith('.txt'):
            return jsonify({'error': 'Only .txt files are allowed'}), 400
        
        filename = secure_filename(file.filename)
        file_content = file
        
    elif upload_method == 'text':
        text_content = request.form.get('text_content', '').strip()
        if not text_content:
            return jsonify({'error': 'No text content provided'}), 400
        
        if len(text_content) > 16000:
            return jsonify({'error': 'Text content exceeds 16,000 character limit'}), 400
        
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        filename = f"text_{timestamp}.txt"
        file_content = text_content
        
    else:
        return jsonify({'error': 'Invalid upload method'}), 400
    
    # Handle pairing for back translations
    paired_with_id = None
    if file_type == 'back_translation':
        paired_with_id = request.form.get('paired_with_id')
        if not paired_with_id:
            return jsonify({'error': 'Back translations must be paired with a forward translation'}), 400
        
        # Verify the paired file exists and belongs to this project
        paired_file = ProjectFile.query.filter_by(
            id=paired_with_id, 
            project_id=project_id
        ).first()
        
        if not paired_file:
            return jsonify({'error': 'Selected forward translation not found'}), 400
        
        if paired_file.file_type not in ['ebible', 'text']:
            return jsonify({'error': 'Can only pair with eBible or text files'}), 400
    
    # Save the file
    project_file = save_project_file(
        project_id,
        file_content,
        filename,
        file_type,
        'text/plain'
    )
    
    # Set pairing if this is a back translation
    if paired_with_id:
        project_file.paired_with_id = int(paired_with_id)
    
    db.session.commit()
    
    # Generate success message
    if file_type == 'back_translation':
        paired_file = ProjectFile.query.get(paired_with_id)
        message = f'Back translation "{filename}" uploaded and paired with "{paired_file.original_filename}"'
    else:
        file_type_label = {
            'ebible': 'eBible',
            'text': 'Text',
            'back_translation': 'Back translation'
        }.get(file_type, file_type.title())
        
        if upload_method == 'text':
            message = f'{file_type_label} uploaded successfully ({len(text_content)} characters)'
        else:
            message = f'{file_type_label} file "{filename}" uploaded successfully'
    
    return jsonify({
        'success': True,
        'message': message,
        'file_id': project_file.id
    })

@app.route('/project/<int:project_id>/usfm-import')
@login_required
def usfm_import(project_id):
    """USFM import page"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    return render_template('usfm_import.html', project=project)

@app.route('/project/<int:project_id>/usfm-upload', methods=['POST'])
@login_required
def usfm_upload(project_id):
    """Handle USFM file uploads for the dedicated import page"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    try:
        from utils.usfm_parser import USFMParser, EBibleBuilder
        
        if 'usfm_files' not in request.files:
            return jsonify({'error': 'No USFM files provided'}), 400
        
        files = request.files.getlist('usfm_files')
        if not files or len(files) == 0:
            return jsonify({'error': 'No USFM files selected'}), 400
        
        # Validate file types
        for file in files:
            if not file.filename:
                return jsonify({'error': 'Empty filename in upload'}), 400
            
            extension = file.filename.lower().split('.')[-1]
            if extension not in ['usfm', 'sfm', 'txt']:
                return jsonify({'error': f'Invalid file type: {file.filename}. Only .usfm, .sfm, and .txt files are allowed'}), 400
        
        # Initialize USFM parser and eBible builder
        parser = USFMParser()
        vref_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'vref.txt')
        builder = EBibleBuilder(vref_path)
        
        # Use temporary files instead of session for large data
        temp_dir = os.path.join('storage', 'temp_usfm')
        os.makedirs(temp_dir, exist_ok=True)
        
        session_file_path = os.path.join(temp_dir, f'session_{project_id}_{current_user.id}.json')
        ebible_file_path = os.path.join(temp_dir, f'ebible_{project_id}_{current_user.id}.txt')
        
        # Load existing session data
        if os.path.exists(session_file_path):
            with open(session_file_path, 'r', encoding='utf-8') as f:
                usfm_session = json.load(f)
        else:
            usfm_session = {'uploaded_files': []}
        
        # Load existing eBible lines
        if os.path.exists(ebible_file_path):
            with open(ebible_file_path, 'r', encoding='utf-8') as f:
                existing_ebible_lines = [line.rstrip('\n') for line in f.readlines()]
        else:
            existing_ebible_lines = [''] * 31170  # Initialize empty eBible
        
        # Parse all uploaded USFM files
        all_verses = {}
        uploaded_file_info = []
        
        for file in files:
            try:
                content = file.read().decode('utf-8')
                file_verses = parser.parse_file(content)
                all_verses.update(file_verses)
                
                # Track file info
                file_info = {
                    'filename': file.filename,
                    'verses_count': len(file_verses),
                    'books': [parser.current_book] if parser.current_book else []
                }
                uploaded_file_info.append(file_info)
                usfm_session['uploaded_files'].append(file_info)
                
            except Exception as e:
                return jsonify({'error': f'Error parsing {file.filename}: {str(e)}'}), 400
        
        if not all_verses:
            return jsonify({'error': 'No verses found in the uploaded files'}), 400
        
        # Update eBible lines with new verses
        updated_ebible_lines = builder.create_ebible_from_usfm_verses(
            all_verses, 
            existing_ebible_lines
        )
        
        # Get statistics
        stats = builder.get_completion_stats(updated_ebible_lines)
        
        # Save session data to file
        with open(session_file_path, 'w', encoding='utf-8') as f:
            json.dump(usfm_session, f)
        
        # Save eBible lines to file
        with open(ebible_file_path, 'w', encoding='utf-8') as f:
            for line in updated_ebible_lines:
                f.write(line + '\n')
        
        processed_books = list(set([book for file_info in uploaded_file_info for book in file_info['books']]))
        
        return jsonify({
            'success': True,
            'message': f'Successfully uploaded {len(files)} USFM file(s)',
            'uploaded_files': uploaded_file_info,
            'stats': stats,
            'processed_books': processed_books,
            'verses_added': len(all_verses)
        })
        
    except Exception as e:
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

@app.route('/project/<int:project_id>/usfm-status')
@login_required
def usfm_status(project_id):
    """Get current USFM import session status"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    try:
        from utils.usfm_parser import EBibleBuilder
        
        # Check temporary files
        temp_dir = os.path.join('storage', 'temp_usfm')
        session_file_path = os.path.join(temp_dir, f'session_{project_id}_{current_user.id}.json')
        ebible_file_path = os.path.join(temp_dir, f'ebible_{project_id}_{current_user.id}.txt')
        
        if not os.path.exists(session_file_path) or not os.path.exists(ebible_file_path):
            # No session, return empty state
            return jsonify({
                'stats': {
                    'total_verses': 31170,
                    'filled_verses': 0,
                    'missing_verses': 31170,
                    'completion_percentage': 0
                },
                'uploaded_files': []
            })
        
        # Load session data
        with open(session_file_path, 'r', encoding='utf-8') as f:
            usfm_session = json.load(f)
        
        # Load eBible lines
        with open(ebible_file_path, 'r', encoding='utf-8') as f:
            ebible_lines = [line.rstrip('\n') for line in f.readlines()]
        
        vref_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'vref.txt')
        builder = EBibleBuilder(vref_path)
        
        # Get current statistics
        stats = builder.get_completion_stats(ebible_lines)
        
        return jsonify({
            'stats': stats,
            'uploaded_files': usfm_session['uploaded_files']
        })
        
    except Exception as e:
        return jsonify({'error': f'Status check failed: {str(e)}'}), 500

@app.route('/project/<int:project_id>/usfm-complete', methods=['POST'])
@login_required
def usfm_complete(project_id):
    """Complete USFM import and create final eBible file"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    try:
        from utils.usfm_parser import EBibleBuilder
        
        # Check temporary files
        temp_dir = os.path.join('storage', 'temp_usfm')
        session_file_path = os.path.join(temp_dir, f'session_{project_id}_{current_user.id}.json')
        ebible_file_path = os.path.join(temp_dir, f'ebible_{project_id}_{current_user.id}.txt')
        
        if not os.path.exists(session_file_path) or not os.path.exists(ebible_file_path):
            return jsonify({'error': 'No USFM files uploaded in current session'}), 400
        
        # Load session data
        with open(session_file_path, 'r', encoding='utf-8') as f:
            usfm_session = json.load(f)
        
        if not usfm_session['uploaded_files']:
            return jsonify({'error': 'No USFM files uploaded in current session'}), 400
        
        # Load eBible content
        with open(ebible_file_path, 'r', encoding='utf-8') as f:
            ebible_content = f.read()
        
        # Create final eBible file
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        filename = f"ebible_from_usfm_{timestamp}.txt"
        
        # Save as regular eBible file (not usfm_ebible since it's finalized)
        project_file = save_project_file(
            project_id,
            ebible_content,
            filename,
            'ebible',  # Save as regular eBible
            'text/plain'
        )
        
        db.session.commit()
        
        # Get final statistics
        ebible_lines = ebible_content.split('\n')
        vref_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'vref.txt')
        builder = EBibleBuilder(vref_path)
        stats = builder.get_completion_stats(ebible_lines)
        
        # Clean up temporary files
        try:
            os.remove(session_file_path)
            os.remove(ebible_file_path)
        except OSError:
            pass  # Files may not exist or may be locked
        
        return jsonify({
            'success': True,
            'message': f'eBible created successfully! {stats["completion_percentage"]:.1f}% complete with {stats["filled_verses"]:,} verses.',
            'file_id': project_file.id,
            'stats': stats
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Completion failed: {str(e)}'}), 500

@app.route('/project/<int:project_id>/upload-target-text', methods=['POST'])
@login_required
def upload_target_text(project_id):
    """Upload target language text file (legacy endpoint)"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    upload_method = request.form.get('upload_method', 'file')
    
    try:
        if upload_method == 'file':
            # Handle file upload
            if 'target_text_file' not in request.files:
                return jsonify({'error': 'No file provided'}), 400
            
            file = request.files['target_text_file']
            if not file.filename:
                return jsonify({'error': 'No file selected'}), 400
            
            if not file.filename.lower().endswith('.txt'):
                return jsonify({'error': 'Only .txt files are allowed'}), 400
            
            # Determine file type based on filename
            filename = secure_filename(file.filename)
            file_type = 'ebible' if 'ebible' in filename.lower() else 'text'
            
            # Save the file
            project_file = save_project_file(
                project_id,
                file,
                filename,
                file_type,
                file.content_type or 'text/plain'
            )
            
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': f'Target text file "{filename}" uploaded successfully',
                'file_id': project_file.id
            })
            
        elif upload_method == 'text':
            # Handle pasted text
            text_content = request.form.get('target_text_content', '').strip()
            if not text_content:
                return jsonify({'error': 'No text content provided'}), 400
            
            if len(text_content) > 16000:
                return jsonify({'error': 'Text content exceeds 16,000 character limit'}), 400
            
            # Create filename with timestamp
            timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
            filename = f"target_text_{timestamp}.txt"
            
            # Save as text file
            project_file = save_project_file(
                project_id,
                text_content,
                filename,
                'text',
                'text/plain'
            )
            
            db.session.commit()
            
            return jsonify({
                'success': True,
                'message': f'Target text uploaded successfully ({len(text_content)} characters)',
                'file_id': project_file.id
            })
        
        else:
            return jsonify({'error': 'Invalid upload method'}), 400
            
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

@app.route('/api/corpus/files')
@login_required
def list_corpus_files():
    """List available corpus files for import"""
    corpus_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Corpus')
    
    if not os.path.exists(corpus_dir):
        return jsonify({'files': []})
    
    corpus_files = []
    for filename in os.listdir(corpus_dir):
        if filename.lower().endswith('.txt'):
            file_path = os.path.join(corpus_dir, filename)
            try:
                file_size = os.path.getsize(file_path)
                with open(file_path, 'r', encoding='utf-8') as f:
                    line_count = sum(1 for line in f)
                
                # Extract language/translation info from filename
                name_parts = filename.replace('.txt', '').split('_')
                display_name = ' '.join([part.title() for part in name_parts])
                
                corpus_files.append({
                    'filename': filename,
                    'display_name': display_name,
                    'file_size': file_size,
                    'line_count': line_count
                })
            except Exception as e:
                print(f"Error reading corpus file {filename}: {e}")
                continue
    
    return jsonify({'files': corpus_files})

@app.route('/project/<int:project_id>/import-corpus', methods=['POST'])
@login_required
def import_corpus_file(project_id):
    """Import a corpus file into the project"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    corpus_filename = data.get('filename')
    
    if not corpus_filename:
        return jsonify({'error': 'No filename provided'}), 400
    
    corpus_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Corpus')
    corpus_file_path = os.path.join(corpus_dir, corpus_filename)
    
    if not os.path.exists(corpus_file_path):
        return jsonify({'error': 'Corpus file not found'}), 404
    
    if not corpus_filename.lower().endswith('.txt'):
        return jsonify({'error': 'Only .txt files are supported'}), 400
    
    try:
        # Read the corpus file content
        with open(corpus_file_path, 'r', encoding='utf-8') as f:
            file_content = f.read()
        
        # Generate a unique filename for the project
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        base_name = corpus_filename.replace('.txt', '')
        project_filename = f"{base_name}_imported_{timestamp}.txt"
        
        # Save as project file
        project_file = save_project_file(
            project_id,
            file_content,
            project_filename,
            'ebible',  # Corpus files are eBible format
            'text/plain'
        )
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Corpus file "{corpus_filename}" imported successfully',
            'file_id': project_file.id,
            'project_filename': project_filename
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Import failed: {str(e)}'}), 500

@app.route('/api/translate', methods=['POST'])
@login_required
def translate_passage():
    """Translate a Bible passage using AI"""
    try:
        data = request.get_json()
        
        # Get form data
        passage_key = data.get('passage')
        target_language = data.get('target_language', '')
        audience = data.get('audience', '')
        style = data.get('style', '')
        model = data.get('model')  # Optional model override
        
        # Bible passages mapping
        passages = {
            'john3:16': 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.',
            'genesis1:1': 'In the beginning God created the heavens and the earth.',
            'psalm23:1': 'The Lord is my shepherd, I lack nothing.',
            'matthew28:19': 'Therefore go and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit.',
            'romans3:23': 'For all have sinned and fall short of the glory of God.',
            'revelation21:4': 'He will wipe every tear from their eyes. There will be no more death or mourning or crying or pain, for the old order of things has passed away.'
        }
        
        original_text = passages.get(passage_key)
        
        # Create chatbot instance
        chatbot = Chatbot()
        
        # Translate using AI
        def run_translation():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                return loop.run_until_complete(
                    chatbot.translate_text(
                        text=original_text,
                        target_language=target_language,
                        audience=audience,
                        style=style,
                        context=f"Bible verse ({passage_key})",
                        model=model
                    )
                )
            finally:
                loop.close()
        
        translation = run_translation()
        
        return jsonify({
            'success': True,
            'translation': translation,
            'passage': passage_key,
            'original': original_text
        })
        
    except Exception as e:
        print(f"Translation error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    """Serve uploaded files"""
    storage = get_storage()
    
    # For local storage, serve file directly
    if hasattr(storage, 'base_path'):  # LocalStorage
        file_data = storage.get_file(filename)
        return send_file(io.BytesIO(file_data), as_attachment=False, download_name=filename)
    else:  # Cloud storage
        return redirect(storage.get_file_url(filename))

@app.route('/static/<path:filename>')
def serve_static(filename):
    """Serve static files"""
    return send_file(os.path.join('static', filename))

@app.route('/favicon.ico')
def favicon():
    """Serve favicon with proper headers"""
    response = send_file('static/favicon.ico', mimetype='image/vnd.microsoft.icon')
    response.headers['Cache-Control'] = 'public, max-age=86400'  # Cache for 1 day
    return response

@app.route('/project/<int:project_id>/files')
@login_required
def project_files(project_id):
    """List files for a project"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    return jsonify([{
        'id': f.id,
        'filename': f.original_filename,
        'type': f.file_type,
        'size': f.file_size,
        'url': url_for('serve_upload', filename=f.storage_path),
        'created_at': f.created_at.isoformat()
    } for f in project.files])

@app.route('/project/<int:project_id>/files/<int:file_id>/download')
@login_required  
def download_project_file(project_id, file_id):
    """Download a project file with proper headers"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    project_file = ProjectFile.query.filter_by(id=file_id, project_id=project.id).first_or_404()
    
    storage = get_storage()
    
    try:
        # For local storage, serve file directly with download headers
        if hasattr(storage, 'base_path'):  # LocalStorage
            file_data = storage.get_file(project_file.storage_path)
            return send_file(
                io.BytesIO(file_data), 
                as_attachment=True, 
                download_name=project_file.original_filename,
                mimetype=project_file.content_type or 'application/octet-stream'
            )
        else:  # Cloud storage
            # For cloud storage, redirect to a signed URL for download
            return redirect(storage.get_file_url(project_file.storage_path))
    except Exception as e:
        return jsonify({'error': f'File download failed: {str(e)}'}), 500

@app.route('/project/<int:project_id>/files/<int:file1_id>/pair/<int:file2_id>', methods=['POST'])
@login_required
def pair_files(project_id, file1_id, file2_id):
    """Pair two files as parallel texts"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    # Verify both files exist and belong to this project
    file1 = ProjectFile.query.filter_by(id=file1_id, project_id=project.id).first_or_404()
    file2 = ProjectFile.query.filter_by(id=file2_id, project_id=project.id).first_or_404()
    
    if file1_id == file2_id:
        return jsonify({'error': 'Cannot pair a file with itself'}), 400
    
        # Check if either file is already paired
    if file1.is_paired():
        return jsonify({'error': f'{file1.original_filename} is already paired with another file'}), 400

    if file2.is_paired():
        return jsonify({'error': f'{file2.original_filename} is already paired with another file'}), 400
    
    # Check if both files are text files
    if file1.content_type != 'text/plain' or file2.content_type != 'text/plain':
        return jsonify({'error': 'Only .txt files can be paired together'}), 400
    
    # Check if both files have the same line count for proper alignment
    if file1.line_count != file2.line_count:
        return jsonify({'error': f'Files must have the same line count to be paired. {file1.original_filename} has {file1.line_count} lines, {file2.original_filename} has {file2.line_count} lines'}), 400
    
    try:
        # Create the file pair (store with smaller ID first for consistency)
        if file1_id < file2_id:
            file_pair = FilePair(project_id=project.id, file1_id=file1_id, file2_id=file2_id)
        else:
            file_pair = FilePair(project_id=project.id, file1_id=file2_id, file2_id=file1_id)
        
        db.session.add(file_pair)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Successfully paired {file1.original_filename} with {file2.original_filename}',
            'pair_id': file_pair.id
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to pair files: {str(e)}'}), 500

@app.route('/project/<int:project_id>/files/<int:file_id>/unpair', methods=['POST'])
@login_required
def unpair_file(project_id, file_id):
    """Unpair a file from its parallel text"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    file = ProjectFile.query.filter_by(id=file_id, project_id=project.id).first_or_404()
    
    # Find and delete the file pair
    pair_as_file1 = FilePair.query.filter_by(project_id=project.id, file1_id=file_id).first()
    pair_as_file2 = FilePair.query.filter_by(project_id=project.id, file2_id=file_id).first()
    
    pair_to_delete = pair_as_file1 or pair_as_file2
    
    if not pair_to_delete:
        return jsonify({'error': f'{file.original_filename} is not paired with any file'}), 400
    
    try:
        # Get the other file's name for the success message
        other_file_id = pair_to_delete.file2_id if pair_to_delete.file1_id == file_id else pair_to_delete.file1_id
        other_file = ProjectFile.query.get(other_file_id)
        
        db.session.delete(pair_to_delete)
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Successfully unpaired {file.original_filename} from {other_file.original_filename}'
        })
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to unpair files: {str(e)}'}), 500

@app.route('/faq')
def faq():
    """FAQ page"""
    return render_template('faq.html')

@app.route('/api/project/<int:project_id>')
@login_required
def get_project_info(project_id):
    """Get project information for API calls"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    return jsonify({
        'id': project.id,
        'target_language': project.target_language,
        'audience': project.audience,
        'style': project.style
    })

# Fine-tuning API routes
@app.route('/project/<int:project_id>/fine-tuning/jobs', methods=['GET'])
@login_required
def get_fine_tuning_jobs(project_id):
    """Get all fine-tuning jobs for a project"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    try:
        ft_service = FineTuningService()
        jobs = ft_service.get_project_jobs(project_id)
        return jsonify({'jobs': jobs})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/project/<int:project_id>/fine-tuning/preview', methods=['POST'])
@login_required
def preview_training_example(project_id):
    """Preview a training example from the file pair"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    # Verify files belong to this project
    source_file = ProjectFile.query.filter_by(id=source_file_id, project_id=project_id).first()
    target_file = ProjectFile.query.filter_by(id=target_file_id, project_id=project_id).first()
    
    if not source_file or not target_file:
        return jsonify({'error': 'Source or target file not found in this project'}), 404
    
    try:
        ft_service = FineTuningService()
        preview = ft_service.get_training_example_preview(source_file_id, target_file_id, project_id)
        return jsonify(preview)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/project/<int:project_id>/fine-tuning/jobs', methods=['POST'])
@login_required
def create_fine_tuning_job(project_id):
    """Create a new fine-tuning job"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    base_model = data.get('base_model', 'gpt-4o-mini')
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    # Verify files belong to this project
    source_file = ProjectFile.query.filter_by(id=source_file_id, project_id=project_id).first()
    target_file = ProjectFile.query.filter_by(id=target_file_id, project_id=project_id).first()
    
    if not source_file or not target_file:
        return jsonify({'error': 'Source or target file not found in this project'}), 404
    
    try:
        ft_service = FineTuningService()
        job_id = ft_service.start_fine_tuning_job(project_id, source_file_id, target_file_id, base_model)
        
        # Check if the job was created successfully
        job = db.session.get(FineTuningJob, job_id)
        
        if job.status == 'failed' and 'OpenAI API error' in (job.error_message or ''):
            # Job created but OpenAI upload failed
            return jsonify({
                'success': True,
                'job_id': job_id,
                'warning': True,
                'message': 'Training data generated and saved locally, but OpenAI upload failed. You can download the training data file from the project files section.',
                'error_details': job.error_message
            })
        elif job.status == 'failed':
            # Job creation failed entirely
            return jsonify({
                'success': False,
                'error': job.error_message or 'Unknown error occurred'
            }), 500
        else:
            # Job created successfully
            return jsonify({
                'success': True,
                'job_id': job_id,
                'message': 'Fine-tuning job started successfully'
            })
            
    except Exception as e:
        # Log the full error with traceback for debugging
        error_details = traceback.format_exc()
        print(f"Fine-tuning job creation failed:")
        print(f"Error: {str(e)}")
        print(f"Traceback:\n{error_details}")
        
        # Return the actual error message to help with debugging
        return jsonify({'error': f'Fine-tuning job failed: {str(e)}'}), 500

@app.route('/project/<int:project_id>/fine-tuning/jobs/<int:job_id>/status', methods=['GET'])
@login_required
def get_fine_tuning_job_status(project_id, job_id):
    """Get the status of a specific fine-tuning job"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    # Verify job belongs to this project
    job = FineTuningJob.query.filter_by(id=job_id, project_id=project_id).first()
    if not job:
        return jsonify({'error': 'Fine-tuning job not found'}), 404
    
    try:
        ft_service = FineTuningService()
        status = ft_service.check_job_status(job_id)
        return jsonify(status)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/project/<int:project_id>/fine-tuning/models', methods=['GET'])
@login_required
def get_fine_tuning_models(project_id):
    """Get available models for fine-tuning"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    try:
        ft_service = FineTuningService()
        models = ft_service.get_fine_tuning_models_for_project(project_id)
        return jsonify({'models': models})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/project/<int:project_id>/fine-tuning/estimate', methods=['POST'])
@login_required
def estimate_fine_tuning_cost(project_id):
    """Estimate the cost of fine-tuning with given files"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    base_model = data.get('base_model', 'gpt-4o-mini')
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    try:
        ft_service = FineTuningService()
        
        # Generate training data to count examples
        jsonl_content, num_examples = ft_service.create_training_data(
            source_file_id, target_file_id, project_id
        )
        
        estimated_cost = ft_service.estimate_cost(num_examples, base_model, project_id)
        
        return jsonify({
            'num_examples': num_examples,
            'estimated_cost_usd': estimated_cost,
            'base_model': base_model,
            'note': 'This is an estimate. Actual costs may vary based on final token count and training duration.'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Project translation model management
@app.route('/project/<int:project_id>/translation-models', methods=['GET'])
@login_required
def get_translation_models(project_id):
    """Get available translation models for a project"""
    try:
        project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
        
        models = project.get_available_translation_models()
        current_model = project.get_current_translation_model()
        default_model = project.get_default_translation_model()
        
        return jsonify({
            'success': True,
            'models': models,
            'current_model': current_model,
            'default_model': default_model
        })
        
    except Exception as e:
        print(f"Error getting translation models: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/project/<int:project_id>/translation-model', methods=['POST'])
@login_required
def set_translation_model(project_id):
    """Set the translation model for a project"""
    try:
        project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
        
        data = request.get_json()
        model_id = data.get('model_id')
        
        if not model_id:
            return jsonify({'success': False, 'error': 'Model ID is required'}), 400
        
        # Validate model exists in available models
        available_models = project.get_available_translation_models()
        if model_id not in available_models:
            return jsonify({'success': False, 'error': 'Invalid model ID'}), 400
        
        # Update project
        project.translation_model = model_id
        project.updated_at = datetime.utcnow()
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Translation model updated to {available_models[model_id]["name"]}'
        })
        
    except Exception as e:
        print(f"Error setting translation model: {e}")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500

def safe_decode_content(file_content):
    """Simple UTF-8 decode that ignores problematic bytes"""
    return file_content.decode('utf-8', errors='ignore')

# Instruction Fine-tuning API routes
@app.route('/project/<int:project_id>/fine-tuning/instruction/preview', methods=['POST'])
@login_required
def preview_instruction_training_example(project_id):
    """Simple instruction fine-tuning preview without complex progress tracking"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    max_examples = data.get('max_examples', 50)
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    # Validate max_examples
    try:
        max_examples = int(max_examples)
        if max_examples < 1 or max_examples > 100:
            max_examples = 50
    except (ValueError, TypeError):
        max_examples = 50
    
    # Verify files belong to this project
    source_file = ProjectFile.query.filter_by(id=source_file_id, project_id=project_id).first()
    target_file = ProjectFile.query.filter_by(id=target_file_id, project_id=project_id).first()
    
    if not source_file or not target_file:
        return jsonify({'error': 'Source or target file not found in this project'}), 404
    
    # Generate unique progress ID
    progress_id = str(uuid.uuid4())
    
    try:
        ft_service = FineTuningService()
        
        # Initialize progress
        ft_service.progress_cache[progress_id] = {
            "current": 0, 
            "total": max_examples, 
            "message": "Starting...",
            "status": "processing"
        }
        print(f"Stored progress for {progress_id}: {ft_service.progress_cache[progress_id]}")
        print(f"All progress keys: {list(ft_service.progress_cache.keys())}")
        
        def generate_training_data():
            try:
                with app.app_context():
                    def progress_callback(current, total, message):
                        ft_service.progress_cache[progress_id] = {
                            "current": current, 
                            "total": total, 
                            "message": message,
                            "status": "processing"
                        }
                        print(f"Progress update {progress_id}: {current}/{total} - {message}")
                    
                    # Use the context-aware method to generate training data with progress
                    jsonl_content, num_examples = ft_service.create_instruction_training_data_with_context(
                        source_file_id, target_file_id, project_id, max_examples, progress_callback
                    )
                    
                    if num_examples == 0:
                        ft_service.progress_cache[progress_id] = {
                            "status": "error",
                            "message": "No valid training examples found"
                        }
                        return
                    
                    # Parse the first example for preview
                    jsonl_lines = jsonl_content.strip().split('\n')
                    first_example = json.loads(jsonl_lines[0])
                    
                    # Extract info from the first example
                    system_prompt = first_example['messages'][0]['content']
                    user_prompt = first_example['messages'][1]['content']
                    assistant_response = first_example['messages'][2]['content']
                    
                    # Count context examples in the user prompt
                    context_count = user_prompt.count('\n') - 2 if 'TRANSLATION EXAMPLES:' in user_prompt else 0
                    context_count = max(0, context_count)
                    
                    # Extract the source text (last line of user prompt)
                    source_text = user_prompt.split('\n')[-1].replace('Translate this text: ', '')
                    
                    result = {
                        'total_lines': 'N/A',
                        'valid_pairs': num_examples,
                        'selected_examples': num_examples,
                        'max_examples': max_examples,
                        'source_filename': source_file.original_filename,
                        'target_filename': target_file.original_filename,
                        'preview_example': {
                            'line_number': 1,
                            'system_prompt': system_prompt,
                            'user_prompt': user_prompt,
                            'assistant_response': assistant_response,
                            'source_text': source_text,
                            'target_text': assistant_response,
                            'has_context': context_count > 0,
                            'context_examples_count': context_count
                        },
                        'jsonl_example': json.dumps(first_example, ensure_ascii=False, indent=2),
                        'status_msg': f'Generated {num_examples} training examples with context successfully',
                        'jsonl_content': jsonl_content  # Store the full JSONL content
                    }
                    
                    # Store result in progress cache
                    ft_service.progress_cache[progress_id] = {
                        "status": "completed",
                        "result": result
                    }
                    print(f"Completed {progress_id}: stored result")
                    
            except Exception as e:
                ft_service.progress_cache[progress_id] = {
                    "status": "error",
                    "message": f"Training data generation failed: {str(e)}"
                }
                print(f"Error {progress_id}: {str(e)}")
        
        # Start background thread
        thread = threading.Thread(target=generate_training_data)
        thread.daemon = True
        thread.start()
        
        return jsonify({'progress_id': progress_id})
        
    except Exception as e:
        # Clear progress on error
        progress_key = f"preview_{project_id}_{source_file_id}_{target_file_id}"
        ft_service = FineTuningService()
        if progress_key in ft_service.progress_cache:
            del ft_service.progress_cache[progress_key]
        return jsonify({'error': str(e)}), 500

@app.route('/project/<int:project_id>/fine-tuning/instruction/preview/progress/<progress_id>', methods=['GET'])
@login_required
def get_instruction_preview_progress(project_id, progress_id):
    """Get progress for instruction fine-tuning preview"""
    print(f"Progress request: project_id={project_id}, progress_id={progress_id}")
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    ft_service = FineTuningService()
    print(f"Progress cache keys: {list(ft_service.progress_cache.keys())}")
    
    if progress_id in ft_service.progress_cache:
        progress_data = ft_service.progress_cache[progress_id]
        print(f"Found progress: {progress_data}")
        return jsonify(progress_data)
    else:
        print(f"Progress not found for {progress_id}")
        return jsonify({'current': 0, 'total': 0, 'message': 'No progress found', 'status': 'not_found'})

@app.route('/project/<int:project_id>/fine-tuning/instruction/preview-with-progress', methods=['POST'])
@login_required
def preview_instruction_training_example_with_progress(project_id):
    """Generate full instruction training data with progress tracking"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    max_examples = data.get('max_examples', 50)
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    # Validate max_examples
    try:
        max_examples = int(max_examples)
        if max_examples < 1 or max_examples > 100:
            max_examples = 50
    except (ValueError, TypeError):
        max_examples = 50
    
    # Verify files belong to this project
    source_file = ProjectFile.query.filter_by(id=source_file_id, project_id=project_id).first()
    target_file = ProjectFile.query.filter_by(id=target_file_id, project_id=project_id).first()
    
    if not source_file or not target_file:
        return jsonify({'error': 'Source or target file not found in this project'}), 404
    
    # Generate unique progress ID
    progress_id = str(uuid.uuid4())
    
    # Initialize progress cache
    ft_service = FineTuningService()
    ft_service.progress_cache[progress_id] = {
        "current": 0, 
        "total": max_examples, 
        "status": "starting", 
        "message": "Initializing..."
    }
    
    def generate_training_data():
        try:
            with app.app_context():
                def progress_callback(current, total, message):
                    ft_service.progress_cache[progress_id].update({
                        "current": current,
                        "total": total,
                        "status": "processing",
                        "message": message
                    })
                
                # Generate the full training data with progress tracking
                jsonl_content, num_examples = ft_service.create_instruction_training_data(
                    source_file_id, target_file_id, project_id, max_examples, progress_callback
                )
                
                if num_examples == 0:
                    ft_service.progress_cache[progress_id].update({
                        "status": "error",
                        "message": "No valid training examples found"
                    })
                    return
                
                # Parse the first example for preview
                jsonl_lines = jsonl_content.strip().split('\n')
                first_example = json.loads(jsonl_lines[0])
                
                # Extract info from the first example
                system_prompt = first_example['messages'][0]['content']
                user_prompt = first_example['messages'][1]['content']
                assistant_response = first_example['messages'][2]['content']
                
                # Count context examples in the user prompt
                context_count = user_prompt.count('\n') - 2 if 'TRANSLATION EXAMPLES:' in user_prompt else 0
                context_count = max(0, context_count)
                
                # Extract the source text (last line of user prompt)
                source_text = user_prompt.split('\n')[-1].replace('Translate this text: ', '')
                
                result = {
                    'success': True,
                    'total_lines': 'N/A',
                    'valid_pairs': 'N/A',
                    'selected_examples': num_examples,
                    'max_examples': max_examples,
                    'source_filename': source_file.original_filename,
                    'target_filename': target_file.original_filename,
                    'preview_example': {
                        'line_number': 1,
                        'system_prompt': system_prompt,
                        'user_prompt': user_prompt,
                        'assistant_response': assistant_response,
                        'source_text': source_text,
                        'target_text': assistant_response,
                        'has_context': context_count > 0,
                        'context_examples_count': context_count
                    },
                    'jsonl_example': json.dumps(first_example, ensure_ascii=False, indent=2),
                    'status_msg': f'Generated {num_examples} training examples successfully',
                    'full_jsonl': jsonl_content
                }
                
                # Store result in progress cache
                ft_service.progress_cache[progress_id].update({
                    "status": "completed",
                    "result": result
                })
                
        except Exception as e:
            # Ensure progress cache exists before updating
            if progress_id not in ft_service.progress_cache:
                ft_service.progress_cache[progress_id] = {}
                
            ft_service.progress_cache[progress_id].update({
                "status": "error",
                "message": f"Training data generation failed: {str(e)}"
            })
    
    thread = threading.Thread(target=generate_training_data)
    thread.daemon = True
    thread.start()
    
    return jsonify({'progress_id': progress_id})

@app.route('/project/<int:project_id>/fine-tuning/instruction/progress/<progress_id>', methods=['GET'])
@login_required
def get_instruction_fine_tuning_progress(project_id, progress_id):
    """Get progress for instruction fine-tuning operations"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    ft_service = FineTuningService()
    progress = ft_service.get_progress(progress_id)
    
    return jsonify(progress)

@app.route('/project/<int:project_id>/fine-tuning/instruction/progress/<progress_id>', methods=['DELETE'])
@login_required
def clear_instruction_fine_tuning_progress(project_id, progress_id):
    """Clear progress data for instruction fine-tuning operations"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    ft_service = FineTuningService()
    ft_service.clear_progress(progress_id)
    
    return jsonify({'success': True})

@app.route('/project/<int:project_id>/fine-tuning/instruction/jobs-with-progress', methods=['POST'])
@login_required
def create_instruction_fine_tuning_job_with_progress(project_id):
    """Create instruction fine-tuning job with progress tracking"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    base_model = data.get('base_model', 'gpt-4o-mini')
    max_examples = data.get('max_examples', 100)
    preview_progress_id = data.get('preview_progress_id')  # Get the preview progress ID
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    # Validate max_examples
    try:
        max_examples = int(max_examples)
        if max_examples < 1 or max_examples > 100:
            max_examples = 100
    except (ValueError, TypeError):
        max_examples = 100
    
    # Verify files belong to this project
    source_file = ProjectFile.query.filter_by(id=source_file_id, project_id=project_id).first()
    target_file = ProjectFile.query.filter_by(id=target_file_id, project_id=project_id).first()
    
    if not source_file or not target_file:
        return jsonify({'error': 'Source or target file not found in this project'}), 404
    
    # Generate unique progress ID
    progress_id = str(uuid.uuid4())
    
    # Initialize progress cache
    ft_service = FineTuningService()
    ft_service.progress_cache[progress_id] = {
        "current": 0, 
        "total": max_examples, 
        "status": "starting", 
        "message": "Initializing..."
    }
    
    def create_job():
        try:
            with app.app_context():
                # Check if we have stored JSONL content from preview
                preview_data = None
                if preview_progress_id:
                    preview_cache = ft_service.progress_cache.get(preview_progress_id, {})
                    if preview_cache.get('status') == 'completed':
                        preview_data = preview_cache.get('result', {})
                
                # Create fine-tuning job record with instruction type
                job = FineTuningJob(
                    project_id=project_id,
                    source_file_id=source_file_id,
                    target_file_id=target_file_id,
                    base_model=base_model,
                    status='preparing',
                    is_instruction_tuning=True,
                    query_text=None,
                    max_examples=max_examples
                )
                db.session.add(job)
                db.session.commit()
                
                try:
                    if preview_data and 'jsonl_content' in preview_data:
                        # Reuse the stored JSONL content
                        jsonl_content = preview_data['jsonl_content']
                        num_examples = preview_data['selected_examples']
                        ft_service.progress_cache[progress_id].update({
                            "current": num_examples,
                            "total": num_examples,
                            "status": "processing",
                            "message": "Reusing generated training data..."
                        })
                    else:
                        # Generate new training data if no preview data available
                        def progress_callback(current, total, message):
                            ft_service.progress_cache[progress_id].update({
                                "current": current,
                                "total": total,
                                "status": "processing",
                                "message": message
                            })
                        
                        jsonl_content, num_examples = ft_service.create_instruction_training_data_with_context(
                            source_file_id, target_file_id, project_id, max_examples, progress_callback
                        )
                    
                    if num_examples == 0:
                        job.status = 'failed'
                        job.error_message = 'No valid instruction examples found'
                        db.session.commit()
                        ft_service.progress_cache[progress_id].update({
                            "status": "error",
                            "message": "No valid instruction examples found"
                        })
                        return
                    
                    # Save JSONL file locally
                    file_id = str(uuid.uuid4())
                    jsonl_filename = f"instruction_tuning_{job.id}_{file_id}.jsonl"
                    local_path = f"projects/{project_id}/fine_tuning/{jsonl_filename}"
                    
                    # Store JSONL file locally
                    jsonl_file = io.BytesIO(jsonl_content.encode('utf-8'))
                    ft_service.storage.store_file(jsonl_file, local_path)
                    job.training_file_path = local_path
                    
                    # Create a ProjectFile record for the JSONL file
                    jsonl_project_file = ProjectFile(
                        project_id=project_id,
                        original_filename=f"instruction_training_job_{job.id}.jsonl",
                        storage_path=local_path,
                        file_type='training_data',
                        content_type='application/jsonl',
                        file_size=len(jsonl_content.encode('utf-8')),
                        line_count=num_examples
                    )
                    db.session.add(jsonl_project_file)
                    db.session.commit()
                    
                    # Try to upload to OpenAI
                    try:
                        # Reset file pointer for OpenAI upload
                        jsonl_file.seek(0)
                        
                        # Upload to OpenAI
                        upload_response = ft_service.client.files.create(
                            file=jsonl_file,
                            purpose="fine-tune"
                        )
                        
                        job.openai_file_id = upload_response.id
                        
                        # Create fine-tuning job on OpenAI
                        ft_response = ft_service.client.fine_tuning.jobs.create(
                            training_file=upload_response.id,
                            model=base_model
                        )
                        
                        job.openai_job_id = ft_response.id
                        job.status = 'validating'
                        job.estimated_cost = ft_service.estimate_cost(num_examples, base_model, project_id)
                        job.training_examples = num_examples
                        
                        db.session.commit()
                        
                        result = {
                            'success': True,
                            'job_id': job.id,
                            'message': 'Instruction fine-tuning job started successfully'
                        }
                        
                    except Exception as openai_error:
                        # OpenAI upload/job creation failed, but we still have the local file
                        job.status = 'failed'
                        job.error_message = f'OpenAI API error: {str(openai_error)}'
                        db.session.commit()
                        
                        result = {
                            'success': True,
                            'job_id': job.id,
                            'warning': True,
                            'message': 'Instruction training data generated and saved locally, but OpenAI upload failed. You can download the training data file from the project files section.',
                            'error_details': str(openai_error)
                        }
                    
                except Exception as e:
                    job.status = 'failed'
                    job.error_message = str(e)
                    db.session.commit()
                    result = {
                        'success': False,
                        'error': str(e)
                    }
                
                # Store result in progress cache
                ft_service.progress_cache[progress_id].update({
                    "status": "completed",
                    "result": result
                })
                
        except Exception as e:
            ft_service.progress_cache[progress_id].update({
                "status": "error",
                "message": f"Job creation failed: {str(e)}"
            })
    
    # Start background thread
    thread = threading.Thread(target=create_job)
    thread.daemon = True
    thread.start()
    
    return jsonify({'progress_id': progress_id})

@app.route('/project/<int:project_id>/fine-tuning/instruction/jobs', methods=['POST'])
@login_required
def create_instruction_fine_tuning_job(project_id):
    """Create a new instruction fine-tuning job (original endpoint)"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    base_model = data.get('base_model', 'gpt-4o-mini')
    max_examples = data.get('max_examples', 100)
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    # Validate max_examples
    try:
        max_examples = int(max_examples)
        if max_examples < 1 or max_examples > 100:
            max_examples = 100
    except (ValueError, TypeError):
        max_examples = 100
    
    # Verify files belong to this project
    source_file = ProjectFile.query.filter_by(id=source_file_id, project_id=project_id).first()
    target_file = ProjectFile.query.filter_by(id=target_file_id, project_id=project_id).first()
    
    if not source_file or not target_file:
        return jsonify({'error': 'Source or target file not found in this project'}), 404
    
    try:
        ft_service = FineTuningService()
        
        # Validate model - check both base models and fine-tuned models
        available_models = ft_service.get_fine_tuning_models_for_project(project_id)
        if base_model not in available_models:
            return jsonify({'error': f'Model {base_model} is not available for fine-tuning'}), 400
        
        # Create fine-tuning job record with instruction type
        job = FineTuningJob(
            project_id=project_id,
            source_file_id=source_file_id,
            target_file_id=target_file_id,
            base_model=base_model,
            status='preparing',
            is_instruction_tuning=True,
            query_text=None,
            max_examples=max_examples
        )
        db.session.add(job)
        db.session.commit()
        
        # Generate instruction training data using context-aware method
        def progress_callback(current, total, message):
            print(f"Job {job.id} progress: {current}/{total} - {message}")
        
        jsonl_content, num_examples = ft_service.create_instruction_training_data_with_context(
            source_file_id, target_file_id, project_id, max_examples, progress_callback
        )
        
        if num_examples == 0:
            job.status = 'failed'
            job.error_message = 'No valid instruction examples found'
            db.session.commit()
            return jsonify({'success': False, 'error': 'No valid instruction examples found'}), 400
        
        # Save JSONL file locally FIRST
        file_id = str(uuid.uuid4())
        jsonl_filename = f"instruction_tuning_{job.id}_{file_id}.jsonl"
        local_path = f"projects/{project_id}/fine_tuning/{jsonl_filename}"
        
        # Store JSONL file locally
        jsonl_file = io.BytesIO(jsonl_content.encode('utf-8'))
        ft_service.storage.store_file(jsonl_file, local_path)
        job.training_file_path = local_path
        
        # Create a ProjectFile record for the JSONL file
        jsonl_project_file = ProjectFile(
            project_id=project_id,
            original_filename=f"instruction_training_job_{job.id}.jsonl",
            storage_path=local_path,
            file_type='training_data',
            content_type='application/jsonl',
            file_size=len(jsonl_content.encode('utf-8')),
            line_count=num_examples
        )
        db.session.add(jsonl_project_file)
        db.session.commit()
        
        # Try to upload to OpenAI
        try:
            # Reset file pointer for OpenAI upload
            jsonl_file.seek(0)
            
            # Upload to OpenAI
            upload_response = ft_service.client.files.create(
                file=jsonl_file,
                purpose="fine-tune"
            )
            
            job.openai_file_id = upload_response.id
            
            # Create fine-tuning job on OpenAI
            ft_response = ft_service.client.fine_tuning.jobs.create(
                training_file=upload_response.id,
                model=base_model
            )
            
            job.openai_job_id = ft_response.id
            job.status = 'validating'
            job.estimated_cost = ft_service.estimate_cost(num_examples, base_model, project_id)
            job.training_examples = num_examples
            
            db.session.commit()
            job_id = job.id
            
        except Exception as openai_error:
            # OpenAI upload/job creation failed, but we still have the local file
            job.status = 'failed'
            job.error_message = f'OpenAI API error: {str(openai_error)}'
            db.session.commit()
            job_id = job.id
        
        # Check if the job was created successfully
        job = db.session.get(FineTuningJob, job_id)
        
        if job.status == 'failed' and 'OpenAI API error' in (job.error_message or ''):
            # Job created but OpenAI upload failed
            return jsonify({
                'success': True,
                'job_id': job_id,
                'warning': True,
                'message': 'Instruction training data generated and saved locally, but OpenAI upload failed. You can download the training data file from the project files section.',
                'error_details': job.error_message
            })
        elif job.status == 'failed':
            # Job creation failed entirely
            return jsonify({
                'success': False,
                'error': job.error_message or 'Unknown error occurred'
            }), 500
        else:
            # Job created successfully
            return jsonify({
                'success': True,
                'job_id': job_id,
                'message': 'Instruction fine-tuning job started successfully'
            })
            
    except Exception as e:
        # Log the full error with traceback for debugging
        error_details = traceback.format_exc()
        print(f"Instruction fine-tuning job creation failed:")
        print(f"Error: {str(e)}")
        print(f"Traceback:\n{error_details}")
        
        # Return the actual error message to help with debugging
        return jsonify({'error': f'Instruction fine-tuning job failed: {str(e)}'}), 500

@app.route('/project/<int:project_id>/fine-tuning/instruction/estimate', methods=['POST'])
@login_required
def estimate_instruction_fine_tuning_cost(project_id):
    """Simple estimate for instruction fine-tuning cost without processing examples"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    data = request.get_json()
    source_file_id = data.get('source_file_id')
    target_file_id = data.get('target_file_id')
    base_model = data.get('base_model', 'gpt-4o-mini')
    max_examples = data.get('max_examples', 100)
    
    if not source_file_id or not target_file_id:
        return jsonify({'error': 'Both source_file_id and target_file_id are required'}), 400
    
    # Validate max_examples
    try:
        max_examples = int(max_examples)
        if max_examples < 1 or max_examples > 100:
            max_examples = 100
    except (ValueError, TypeError):
        max_examples = 100
    
    try:
        ft_service = FineTuningService()
        
        # Get simple estimate without processing examples
        estimate_data = ft_service.get_instruction_tuning_simple_estimate(
            source_file_id, target_file_id, project_id, max_examples
        )
        
        estimated_cost = ft_service.estimate_cost(estimate_data['actual_examples'], base_model, project_id)
        
        return jsonify({
            'num_examples': estimate_data['actual_examples'],
            'valid_pairs': estimate_data['valid_pairs'],
            'max_examples': max_examples,
            'estimated_cost_usd': estimated_cost,
            'base_model': base_model,
            'note': 'This is a simple estimate. Click "Get Training Data" to process examples and see preview.'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/project/<int:project_id>/fine-tuning/jobs/<int:job_id>/rename', methods=['POST'])
@login_required
def rename_fine_tuning_model(project_id, job_id):
    """Rename a fine-tuned model"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    # Verify job belongs to this project
    job = FineTuningJob.query.filter_by(id=job_id, project_id=project_id).first_or_404()
    
    data = request.get_json()
    new_name = data.get('name', '').strip()
    
    if not new_name:
        return jsonify({'error': 'Name cannot be empty'}), 400
        
    if len(new_name) > 255:
        return jsonify({'error': 'Name is too long (maximum 255 characters)'}), 400
    
    try:
        job.display_name = new_name
        db.session.commit()
        
        return jsonify({
            'success': True,
            'name': job.get_display_name()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/project/<int:project_id>/fine-tuning/jobs/<int:job_id>/toggle-visibility', methods=['POST'])
@login_required
def toggle_model_visibility(project_id, job_id):
    """Toggle the visibility of a fine-tuned model"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    # Verify job belongs to this project
    job = FineTuningJob.query.filter_by(id=job_id, project_id=project_id).first_or_404()
    
    if job.status != 'completed':
        return jsonify({'error': 'Can only toggle visibility of completed models'}), 400
    
    try:
        job.hidden = not job.hidden
        db.session.commit()
        
        return jsonify({
            'success': True,
            'hidden': job.hidden,
            'message': 'Model hidden from selection' if job.hidden else 'Model visible in selection'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Set development environment
    os.environ['FLASK_ENV'] = 'development'
    os.environ['DEVELOPMENT_MODE'] = 'true'
    
    # For development only - disable in production
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
    
    print("=" * 60)
    print("🚀 Starting CodexZero in DEVELOPMENT MODE")
    print("=" * 60)
    print("📍 App URL: http://localhost:5000")
    print("🔧 Dev Login: http://localhost:5000/dev")
    print("👤 Auto-login: Visit any page to automatically log in as 'Development User'")
    print("📚 Dashboard: http://localhost:5000/dashboard")
    print("")
    print("💡 To use Google OAuth instead, set DEVELOPMENT_MODE=false")
    print("=" * 60)
    
    app.run(debug=True, host='localhost', port=5000)
