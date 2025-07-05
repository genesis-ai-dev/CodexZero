from datetime import datetime
from flask import Blueprint, render_template, flash, request, redirect, url_for, jsonify
from flask_login import current_user, login_required

from models import db, Project, ProjectFile
from utils.file_helpers import save_project_file
from utils.project_helpers import save_language_rules, import_ulb_automatically
from storage import get_storage

projects = Blueprint('projects', __name__)


@projects.route('/dashboard')
@login_required
def dashboard():
    """User dashboard showing their projects"""
    projects_list = Project.query.filter_by(user_id=current_user.id).order_by(Project.updated_at.desc()).all()
    return render_template('dashboard.html', projects=projects_list)


@projects.route('/project/new')
@login_required
def new_project():
    """Show new project creation form"""
    return render_template('new_project.html')


@projects.route('/project', methods=['POST'])
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
                from werkzeug.utils import secure_filename
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
            from werkzeug.utils import secure_filename
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
    return redirect(url_for('projects.dashboard'))


@projects.route('/project/<int:project_id>')
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
                from utils.file_helpers import safe_decode_content
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


@projects.route('/project/<int:project_id>/edit')
@login_required
def edit_project(project_id):
    """Show edit project form"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    return render_template('edit_project.html', project=project)


@projects.route('/project/<int:project_id>/update', methods=['POST'])
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
            from werkzeug.utils import secure_filename
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
            from werkzeug.utils import secure_filename
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
            from werkzeug.utils import secure_filename
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
    return redirect(url_for('projects.view_project', project_id=project.id))


@projects.route('/project/<int:project_id>/update-instructions', methods=['POST'])
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


@projects.route('/api/project/<int:project_id>')
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


# Project translation model management
@projects.route('/project/<int:project_id>/translation-models', methods=['GET'])
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


@projects.route('/project/<int:project_id>/translation-model', methods=['POST'])
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