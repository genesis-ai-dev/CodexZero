import os
import asyncio
import uuid
import io
from werkzeug.utils import secure_filename
from flask import Flask, render_template, flash, get_flashed_messages, request, redirect, url_for, jsonify, send_file, session
from flask_login import LoginManager, current_user, login_required
from datetime import datetime
import json

from config import Config
from models import db, User, Project, ProjectFile, LanguageRule, BackTranslationJob
from auth import auth
from translation import translation
from ai.bot import Chatbot
from ai.back_translator import BackTranslator
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
    
    # Create database tables
    with app.app_context():
        db.create_all()
    
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
    else:
        # File upload - read size and reset
        content = file_data.read()
        file_size = len(content)
        file_data.seek(0)
        file_obj = file_data
    
    storage.store_file(file_obj, storage_path)
    
    project_file = ProjectFile(
        project_id=project_id,
        original_filename=filename,
        storage_path=storage_path,
        file_type=file_type,
        content_type=content_type,
        file_size=file_size
    )
    db.session.add(project_file)
    return project_file

def save_language_rules(project_id: int, rules_json: str):
    """Helper to save language rules for a project"""
    import json
    
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

@app.route('/')
def index():
    return render_template('index.html')

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
                file_content = storage.get_file(file.storage_path).decode('utf-8')
                all_lines = file_content.split('\n')
                file_data['line_count'] = len(all_lines)
                
                # Use the first file's line count as total for backward compatibility
                if not text_files:  # First file
                    total_available_lines = len(all_lines)
                    
            except Exception as e:
                print(f"Error calculating line count for {file.original_filename}: {e}")
                file_data['line_count'] = 0
            
            text_files.append(file_data)
    
    # Get completed back translation jobs count
    completed_jobs_count = BackTranslationJob.query.filter_by(
        project_id=project_id, 
        status='completed'
    ).count()
    
    return render_template('project.html', 
                         project=project, 
                         total_available_lines=total_available_lines, 
                         text_files=text_files,
                         completed_jobs_count=completed_jobs_count)

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
    """Delete a project file and associated back translations"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    project_file = ProjectFile.query.filter_by(id=file_id, project_id=project.id).first_or_404()
    
    # Delete from storage
    storage = get_storage()
    storage.delete_file(project_file.storage_path)
    
    # Find and delete associated back translation jobs  
    back_translation_jobs = BackTranslationJob.query.filter(
        db.or_(
            BackTranslationJob.source_filename == project_file.original_filename,
            BackTranslationJob.project_file_id == file_id
        ),
        BackTranslationJob.project_id == project_id
    ).all()
    
    for job in back_translation_jobs:
        # Delete back translation results from storage
        if job.results_storage_path:
            try:
                storage.delete_file(job.results_storage_path)
            except Exception as e:
                print(f"Failed to delete back translation results: {e}")
        
        # Delete source content from storage
        if job.source_content_path:
            try:
                storage.delete_file(job.source_content_path)
            except Exception as e:
                print(f"Failed to delete source content: {e}")
        
        # Delete job from database
        db.session.delete(job)
    
    # Delete file from database
    db.session.delete(project_file)
    db.session.commit()
    
    return '', 204  # No content response

@app.route('/project/<int:project_id>/upload-back-translation', methods=['POST'])
@login_required
def upload_back_translation(project_id):
    """Upload a manual back translation file"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    if 'back_translation_file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['back_translation_file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.lower().endswith('.txt'):
        return jsonify({'error': 'Only .txt files are allowed'}), 400
    
    try:
        # Read and validate file content
        file_content = file.read().decode('utf-8')
        all_lines = file_content.split('\n')
        non_empty_lines = [line.strip() for line in all_lines if line.strip()]
        
        if not non_empty_lines:
            return jsonify({'error': 'File is empty or contains no valid content'}), 400
        
        # Create a back translation job record
        job = BackTranslationJob(
            project_id=project_id,
            batch_id='manual_upload',
            total_lines=len(all_lines),
            processed_lines=len(all_lines),
            source_filename=f"manual_upload_{file.filename}",
            status='completed'
        )
        
        db.session.add(job)
        db.session.flush()
        
        # Format results for storage
        formatted_results = []
        for i, line in enumerate(all_lines):
            formatted_results.append({
                'line_number': i,
                'original': f"[Manual upload line {i+1}]",
                'back_translation': line
            })
        
        # Store results
        storage = get_storage()
        results_storage_path = f"projects/{project_id}/back_translation/{job.id}_results.json"
        results_file = io.BytesIO(json.dumps(formatted_results, ensure_ascii=False, indent=2).encode('utf-8'))
        storage.store_file(results_file, results_storage_path)
        
        # Update job
        job.results_storage_path = results_storage_path
        job.back_translations = json.dumps({'total_results': len(formatted_results), 'storage_path': results_storage_path})
        job.completed_at = datetime.utcnow()
        
        # Create ProjectFile entry for the back translation
        back_translation_filename = f"back_translation_{job.id}_{secure_filename(file.filename)}"
        project_file = save_project_file(
            project_id,
            file_content,
            back_translation_filename,
            'back_translation',
            'text/plain'
        )
        
        # Link the project file to the job
        job.project_file_id = project_file.id
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': f'Back translation uploaded successfully with {len(all_lines)} lines',
            'job_id': job.id,
            'file_id': project_file.id
        })
        
    except UnicodeDecodeError:
        return jsonify({'error': 'File must be valid UTF-8 text'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500

@app.route('/project/<int:project_id>/back-translation/<int:job_id>', methods=['DELETE'])
@login_required
def delete_back_translation_job(project_id, job_id):
    """Delete a back translation job and its results"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    job = BackTranslationJob.query.filter_by(id=job_id, project_id=project_id).first_or_404()
    
    try:
        storage = get_storage()
        
        # Delete results from storage if they exist
        if job.results_storage_path:
            try:
                storage.delete_file(job.results_storage_path)
            except Exception as e:
                print(f"Failed to delete results file: {e}")
        
        # Delete source content from storage if it exists
        if job.source_content_path:
            try:
                storage.delete_file(job.source_content_path)
            except Exception as e:
                print(f"Failed to delete source content file: {e}")
        
        # Delete associated ProjectFile if it exists
        if job.project_file_id:
            project_file = ProjectFile.query.get(job.project_file_id)
            if project_file:
                # Delete the project file from storage
                try:
                    storage.delete_file(project_file.storage_path)
                except Exception as e:
                    print(f"Failed to delete project file from storage: {e}")
                
                # Delete the project file from database
                db.session.delete(project_file)
        
        # Delete job from database
        db.session.delete(job)
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Back translation job deleted successfully'})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to delete job: {str(e)}'}), 500

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
        import json
        
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
        import json
        
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
        import json
        
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
                        context=f"Bible verse ({passage_key})"
                    )
                )
            finally:
                loop.close()
        
        translation = run_translation()
        
        return jsonify({
            'original': original_text,
            'translation': translation,
            'target_language': target_language
        })
        
    except ValueError as e:
        # Handle missing API key or configuration errors
        print(f"Configuration error: {str(e)}")
        return jsonify({'error': 'Translation service not configured properly. Please check API keys.'}), 500
    except Exception as e:
        print(f"Translation error: {str(e)}")
        return jsonify({'error': f'Translation failed: {str(e)}'}), 500

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

@app.route('/project/<int:project_id>/start-back-translation', methods=['POST'])
@login_required
def start_back_translation(project_id):
    """Start a back translation job for project files"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first()
    
    # Check if there's already a job in progress
    existing_job = BackTranslationJob.query.filter_by(
        project_id=project_id, 
        status='in_progress'
    ).first()
    
    if existing_job:
        return jsonify({'error': 'Back translation already in progress'}), 400
    
    # Get training files with text content
    text_files = [f for f in project.files if f.file_type in ['ebible', 'text']]
    
    if not text_files:
        return jsonify({'error': 'No training files found to back translate'}), 400
    
    try:
        # Get parameters from request
        data = request.get_json() or {}
        line_count_param = data.get('line_count', 'all')
        selected_file_id = data.get('file_id')
        
        back_translator = BackTranslator()
        
        # Select the file to back translate
        if selected_file_id:
            try:
                selected_file_id = int(selected_file_id)
                source_file = next((f for f in text_files if f.id == selected_file_id), None)
                if not source_file:
                    return jsonify({'error': 'Selected file not found'}), 400
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid file ID'}), 400
        else:
            # Default to first text file for backward compatibility
            source_file = text_files[0]
        
        # Load file content
        storage = get_storage()
        file_content = storage.get_file(source_file.storage_path).decode('utf-8')
        
        # Split into lines and apply line count limit
        all_lines = file_content.split('\n')
        
        if line_count_param == 'all':
            lines_to_process = all_lines
        else:
            try:
                line_count = int(line_count_param)
                lines_to_process = all_lines[:line_count]
            except (ValueError, TypeError):
                return jsonify({'error': 'Invalid line count parameter'}), 400
        
        # Reconstruct content with only the lines to process
        limited_content = '\n'.join(lines_to_process)
        
        # Create job record first to get the job ID
        job = BackTranslationJob(
            project_id=project_id,
            batch_id='',  # Will be updated after batch submission
            total_lines=len(lines_to_process),
            source_filename=source_file.original_filename
        )
        
        db.session.add(job)
        db.session.flush()  # Get the job ID
        
        # Store source content in DigitalOcean Spaces
        source_content_path = f"projects/{project_id}/back_translation/{job.id}_source_content.txt"
        source_content_file = io.BytesIO(limited_content.encode('utf-8'))
        storage.store_file(source_content_file, source_content_path)
        
        # Update job with storage path
        job.source_content_path = source_content_path
        
        # Prepare batch requests
        batch_requests = back_translator.prepare_lines_for_translation(limited_content)
        
        # Submit batch to Anthropic
        batch_id = back_translator.submit_batch(batch_requests)
        
        # Update job with batch ID
        job.batch_id = batch_id
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'job_id': job.id,
            'batch_id': batch_id,
            'total_lines': len(lines_to_process),
            'total_available_lines': len(all_lines),
            'line_count_param': line_count_param
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/project/<int:project_id>/back-translation-status')
@login_required
def back_translation_status(project_id):
    """Get status of back translation jobs for a project"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first()
    
    jobs = BackTranslationJob.query.filter_by(project_id=project_id).order_by(
        BackTranslationJob.created_at.desc()
    ).all()
    
    job_status = []
    back_translator = BackTranslator()
    
    for job in jobs:
        status_data = {
            'id': job.id,
            'batch_id': job.batch_id,
            'status': job.status,
            'total_lines': job.total_lines,
            'processed_lines': job.processed_lines,
            'source_filename': job.source_filename,
            'created_at': job.created_at.isoformat(),
            'completed_at': job.completed_at.isoformat() if job.completed_at else None
        }
        
        # Check for updates if still in progress
        if job.status == 'in_progress':
            try:
                batch_status = back_translator.check_batch_status(job.batch_id)
                
                if batch_status['status'] == 'ended':
                    # Process completed batch
                    results = back_translator.retrieve_batch_results(job.batch_id)
                    
                    # Load source content from storage
                    storage = get_storage()
                    if job.source_content_path:
                        source_content = storage.get_file(job.source_content_path).decode('utf-8')
                        lines = source_content.split('\n')
                    else:
                        # Fallback for old jobs without storage path
                        lines = []
                    
                    formatted_results = back_translator.format_results_for_storage(lines, results)
                    
                    # Store results in storage instead of database
                    results_storage_path = f"projects/{project_id}/back_translation/{job.id}_results.json"
                    results_file = io.BytesIO(json.dumps(formatted_results, ensure_ascii=False, indent=2).encode('utf-8'))
                    storage.store_file(results_file, results_storage_path)
                    
                    # Update job with minimal metadata
                    job.status = 'completed'
                    job.processed_lines = len(results)
                    job.results_storage_path = results_storage_path
                    job.back_translations = json.dumps({'total_results': len(formatted_results), 'storage_path': results_storage_path})
                    job.completed_at = datetime.utcnow()
                    
                    # Create ProjectFile entry for the auto-generated back translation
                    # Extract just the back translation text for storage as a text file
                    back_translation_lines = []
                    for result in formatted_results:
                        back_translation = result.get('back_translation', '')
                        if back_translation.startswith('[ERROR:'):
                            back_translation_lines.append(f"# {back_translation}")
                        elif back_translation.strip() == '':
                            # Preserve blank lines as blank lines
                            back_translation_lines.append('')
                        else:
                            # Clean the back translation text
                            clean_back_translation = back_translation.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
                            clean_back_translation = ' '.join(clean_back_translation.split())
                            back_translation_lines.append(clean_back_translation)
                    
                    back_translation_content = '\n'.join(back_translation_lines)
                    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
                    back_translation_filename = f"back_translation_{job.source_filename}_{timestamp}.txt"
                    
                    project_file = save_project_file(
                        project_id,
                        back_translation_content,
                        back_translation_filename,
                        'back_translation',
                        'text/plain'
                    )
                    
                    # Link the project file to the job
                    job.project_file_id = project_file.id
                    
                    db.session.commit()
                    
                    status_data['status'] = 'completed'
                    status_data['processed_lines'] = len(results)
                    status_data['completed_at'] = job.completed_at.isoformat()
                
                elif batch_status['status'] in ['failed', 'expired']:
                    job.status = batch_status['status']
                    job.error_message = f"Batch {batch_status['status']}"
                    db.session.commit()
                    
                    status_data['status'] = job.status
                    status_data['error'] = job.error_message
                
            except Exception as e:
                status_data['error'] = str(e)
        
        job_status.append(status_data)
    
    return jsonify({'jobs': job_status})

@app.route('/project/<int:project_id>/files/<int:file_id>/back-translations')
@login_required
def get_file_back_translations(project_id, file_id):
    """Get back translation jobs for a specific file"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    project_file = ProjectFile.query.filter_by(id=file_id, project_id=project.id).first_or_404()
    
    # Find completed back translation jobs for this file
    back_translation_jobs = BackTranslationJob.query.filter_by(
        project_id=project_id,
        source_filename=project_file.original_filename,
        status='completed'
    ).all()
    
    jobs_data = []
    for job in back_translation_jobs:
        jobs_data.append({
            'id': job.id,
            'total_lines': job.total_lines,
            'completed_at': job.completed_at.isoformat() if job.completed_at else None,
            'download_url': url_for('download_back_translation', project_id=project_id, job_id=job.id)
        })
    
    return jsonify({
        'file_id': file_id,
        'filename': project_file.original_filename,
        'back_translation_jobs': jobs_data
    })

@app.route('/project/<int:project_id>/back-translation/<int:job_id>')
@login_required  
def view_back_translation(project_id, job_id):
    """View back translation results"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first()
    job = BackTranslationJob.query.filter_by(id=job_id, project_id=project_id).first()
    
    if job.status != 'completed':
        return jsonify({'error': 'Back translation not completed'}), 400
    
    try:
        storage = get_storage()
        
        # Load results from storage
        if job.results_storage_path:
            results_content = storage.get_file(job.results_storage_path).decode('utf-8')
            results = json.loads(results_content)
        else:
            # Fallback for old jobs with results in database
            if job.back_translations:
                results = json.loads(job.back_translations)
            else:
                return jsonify({'error': 'No results available'}), 400
        
        return jsonify({
            'job_id': job.id,
            'source_filename': job.source_filename,
            'total_lines': job.total_lines,
            'completed_at': job.completed_at.isoformat(),
            'results': results
        })
    except Exception as e:
        return jsonify({'error': f'Failed to load results: {str(e)}'}), 500

@app.route('/project/<int:project_id>/back-translation/<int:job_id>/download')
@login_required  
def download_back_translation(project_id, job_id):
    """Download back translation results as a text file"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    job = BackTranslationJob.query.filter_by(id=job_id, project_id=project_id).first_or_404()
    
    if job.status != 'completed':
        flash('Back translation not completed', 'error')
        return redirect(url_for('view_project', project_id=project_id))
    
    try:
        storage = get_storage()
        
        # Load results from storage
        if job.results_storage_path:
            results_content = storage.get_file(job.results_storage_path).decode('utf-8')
            results = json.loads(results_content)
        else:
            # Fallback for old jobs with results in database
            if job.back_translations:
                results = json.loads(job.back_translations)
            else:
                flash('No results available', 'error')
                return redirect(url_for('view_project', project_id=project_id))
        
        # Extract just the back translations, one per line
        back_translation_lines = []
        for result in results:
            back_translation = result.get('back_translation', '')
            # Handle error cases where back translation might contain error messages
            if back_translation.startswith('[ERROR:'):
                back_translation_lines.append(f"# {back_translation}")
            elif back_translation.strip() == '':
                # Preserve blank lines as blank lines
                back_translation_lines.append('')
            else:
                # Aggressively remove ALL newlines and normalize to single line
                # Handle \n, \r, \r\n, and any whitespace combinations
                clean_back_translation = back_translation.replace('\n', ' ').replace('\r', ' ').replace('\t', ' ')
                # Collapse multiple spaces and strip
                clean_back_translation = ' '.join(clean_back_translation.split())
                back_translation_lines.append(clean_back_translation)
        
        # Create text content
        text_content = '\n'.join(back_translation_lines)
        
        # Create filename based on source filename and timestamp
        timestamp = job.completed_at.strftime('%Y%m%d_%H%M%S') if job.completed_at else 'unknown'
        base_filename = job.source_filename.rsplit('.', 1)[0] if '.' in job.source_filename else job.source_filename
        download_filename = f"{base_filename}_back_translations_{timestamp}.txt"
        
        # Return as downloadable file
        return send_file(
            io.BytesIO(text_content.encode('utf-8')),
            as_attachment=True,
            download_name=download_filename,
            mimetype='text/plain'
        )
        
    except Exception as e:
        flash(f'Failed to download results: {str(e)}', 'error')
        return redirect(url_for('view_project', project_id=project_id))

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

@app.route('/faq')
def faq():
    """FAQ page"""
    return render_template('faq.html')



if __name__ == '__main__':
    # For development only - disable in production
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
    
    print("Starting Flask app on http://localhost:5000")
    print("Make sure to access the app via localhost, not 127.0.0.1")
    app.run(debug=True, host='localhost', port=5000)
