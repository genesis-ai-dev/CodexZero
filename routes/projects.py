from datetime import datetime
from flask import Blueprint, render_template, flash, request, redirect, url_for, jsonify
from flask_login import current_user, login_required

from models import db, Project, ProjectFile, Translation
from utils.file_helpers import save_project_file
from utils.project_helpers import save_language_rules, import_ulb_automatically
from utils.project_access import ProjectAccess, require_project_access
from utils import sanitize_text_input, validate_and_sanitize_request, error_response, success_response
from storage import get_storage

projects = Blueprint('projects', __name__)


@projects.route('/dashboard')
@login_required
def dashboard():
    """User dashboard showing their projects"""
    # Use new multi-member access system
    projects_list = current_user.get_accessible_projects()
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
    target_language = sanitize_text_input(request.form.get('target_language', ''), max_length=100)
    audience = sanitize_text_input(request.form.get('audience', ''), max_length=200)
    style = sanitize_text_input(request.form.get('style', ''), max_length=200)
    
    # Create project
    project = Project(
        user_id=current_user.id,  # Keep for legacy compatibility
        created_by=current_user.id,  # Track original creator
        target_language=target_language,
        audience=audience,
        style=style
    )
    
    db.session.add(project)
    db.session.flush()
    
    # Add creator as owner in new member system
    from models import ProjectMember
    owner_member = ProjectMember(
        project_id=project.id,
        user_id=current_user.id,
        role='owner',
        invited_by=current_user.id,
        accepted_at=datetime.utcnow()
    )
    db.session.add(owner_member)
    
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
    # Use centralized permission system
    require_project_access(project_id, 'viewer')
    project = Project.query.get_or_404(project_id)
    
    # Use unified approach like translate page - get both new and legacy records
    from models import Text, Verse, ProjectFile, Translation
    
    texts = []
    total_available_verses = 0
    
    # NEW: Get unified Text records
    unified_texts = Text.query.filter_by(project_id=project_id).order_by(Text.created_at.desc()).all()
    
    for text in unified_texts:
        # Skip JSONL files (those belong in fine-tuning tab)
        if text.name and text.name.lower().endswith('.jsonl'):
            continue
            
        # Count verses for this text (can be 0 for empty translations)
        verse_count = Verse.query.filter_by(text_id=text.id).count()
        
        text_data = {
            'id': f'text_{text.id}',
            'name': text.name,
            'verse_count': verse_count,
            'created_at': text.created_at,
            'purpose_description': text.description
        }
        
        texts.append(text_data)
        
        # Track max verses for any text
        if verse_count > total_available_verses:
            total_available_verses = verse_count
    
    # LEGACY: Get old format records for backward compatibility during transition
    # Only include if not already migrated to unified format
    existing_names = {t['name'] for t in texts}
    
    # Legacy files
    legacy_files = ProjectFile.query.filter_by(project_id=project_id).order_by(ProjectFile.created_at.desc()).all()
    for file in legacy_files:
        if file.original_filename not in existing_names:
            # For legacy files, we can't easily count verses, so use a reasonable estimate
            file_verse_count = file.line_count if file.line_count else 0
            
            text_data = {
                'id': f'file_{file.id}',
                'name': file.original_filename,
                'verse_count': file_verse_count,
                'created_at': file.created_at,
                'purpose_description': file.purpose
            }
            
            texts.append(text_data)
            
            # Track max verses for any text
            if file_verse_count > total_available_verses:
                total_available_verses = file_verse_count
    
    # Legacy translations
    legacy_translations = Translation.query.filter_by(project_id=project_id).order_by(Translation.created_at.desc()).all()
    for trans in legacy_translations:
        if trans.name not in existing_names:
            # For legacy translations, count from the translation verses
            trans_verse_count = trans.non_empty_verses if trans.non_empty_verses else 0
            
            text_data = {
                'id': f'translation_{trans.id}',
                'name': trans.name,
                'verse_count': trans_verse_count,
                'created_at': trans.created_at,
                'purpose_description': trans.description
            }
            
            texts.append(text_data)
            
            # Track max verses for any text
            if trans_verse_count > total_available_verses:
                total_available_verses = trans_verse_count
    
    # Sort by creation date (newest first)
    texts.sort(key=lambda x: x['created_at'], reverse=True)

    return render_template('project.html', 
                         project=project, 
                         total_available_verses=total_available_verses, 
                         texts=texts)


@projects.route('/project/<int:project_id>/edit')
@login_required
def edit_project(project_id):
    """Show edit project form"""
    require_project_access(project_id, 'editor')
    project = Project.query.get_or_404(project_id)
    return render_template('edit_project.html', project=project)


@projects.route('/project/<int:project_id>/update', methods=['POST'])
@login_required
def update_project(project_id):
    """Update an existing project"""
    require_project_access(project_id, 'editor')
    project = Project.query.get_or_404(project_id)
    
    project.target_language = sanitize_text_input(request.form.get('target_language', project.target_language), max_length=100)
    project.audience = sanitize_text_input(request.form.get('audience', project.audience), max_length=200)
    project.style = sanitize_text_input(request.form.get('style', project.style), max_length=200)
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
    require_project_access(project_id, 'editor')
    project = Project.query.get_or_404(project_id)
    
    # Validate and sanitize input
    is_valid, data, error_msg = validate_and_sanitize_request({
        'instructions': {'max_length': 4000}
    })
    
    if not is_valid:
        return error_response(error_msg)
    
    project.instructions = data['instructions'] if data['instructions'] else None
    project.updated_at = datetime.utcnow()
    
    db.session.commit()
    
    return success_response('Instructions updated successfully')


@projects.route('/api/project/<int:project_id>')
@login_required
def get_project_info(project_id):
    """Get project information for API calls"""
    require_project_access(project_id, 'viewer')
    project = Project.query.get_or_404(project_id)
    
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
        require_project_access(project_id, 'viewer')
        project = Project.query.get_or_404(project_id)
        
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
        require_project_access(project_id, 'editor')
        project = Project.query.get_or_404(project_id)
        
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