import os
import json
import re
import chardet
from datetime import datetime
from flask import Blueprint, request, jsonify, render_template, send_from_directory, abort, redirect
from flask_login import login_required, current_user
from werkzeug.utils import secure_filename
import mimetypes

from models import db, Project, FineTuningJob, Text
from utils.file_helpers import save_project_file, detect_usfm_content, validate_text_file
from utils.project_access import require_project_access
from utils import process_file_upload, error_response, success_response, create_timestamped_filename, safe_filename_from_original
from storage import get_storage

files = Blueprint('files', __name__)

# Define allowed file types with their MIME types
ALLOWED_FILE_TYPES = {
    '.txt': ['text/plain'],
    '.usfm': ['text/plain', 'application/octet-stream'],
    '.sfm': ['text/plain', 'application/octet-stream']
}

def validate_file_security(file):
    """Validate file for security issues"""
    if not file or not file.filename:
        return False, "No file provided"
    
    filename = secure_filename(file.filename)
    if not filename:
        return False, "Invalid filename"
    
    # Check file extension
    file_ext = os.path.splitext(filename)[1].lower()
    if file_ext not in ALLOWED_FILE_TYPES:
        return False, f"File type {file_ext} not allowed"
    
    # Check MIME type
    file.seek(0)  # Reset file pointer
    file_content = file.read(1024)  # Read first 1KB for MIME detection
    file.seek(0)  # Reset file pointer
    
    detected_mime = mimetypes.guess_type(filename)[0]
    if detected_mime and detected_mime not in ALLOWED_FILE_TYPES[file_ext]:
        return False, f"MIME type {detected_mime} not allowed for {file_ext} files"
    
    # Basic content validation for text files
    if file_ext in ['.txt', '.usfm', '.sfm']:
        try:
            # Try to decode as text
            file_content.decode('utf-8')
        except UnicodeDecodeError:
            try:
                # Try other encodings
                chardet.detect(file_content)
            except:
                return False, "File content is not valid text"
    
    return True, "File validation passed"


def read_file_content(file_obj, filename):
    """Read file content with encoding detection"""
    raw_content = file_obj.read()
    detected = chardet.detect(raw_content)
    encoding = detected['encoding'] if detected and detected['encoding'] else 'utf-8'
    
    # Try detected encoding first, then fallback to utf-8, then latin1
    for enc in [encoding, 'utf-8', 'latin1']:
        try:
            return raw_content.decode(enc)
        except UnicodeDecodeError:
            continue
    
    # Last resort - decode with errors='replace' to preserve as much as possible
    return raw_content.decode('utf-8', errors='replace')



@files.route('/project/<int:project_id>/files/<int:file_id>', methods=['DELETE'])
@login_required
def delete_project_file(project_id, file_id):
    require_project_access(project_id, 'editor')
    project = Project.query.get_or_404(project_id)
    project_file = Text.query.filter_by(id=file_id, project_id=project.id).first_or_404()
    
    fine_tuning_jobs = FineTuningJob.query.filter(
        db.or_(
            FineTuningJob.source_file_id == file_id,
            FineTuningJob.target_file_id == file_id
        ),
        FineTuningJob.project_id == project_id
    ).all()
    
    for job in fine_tuning_jobs:
        db.session.delete(job)
    
    storage = get_storage()
    try:
        storage.delete_file(project_file.storage_path)
    except Exception:
        pass
    
    db.session.delete(project_file)
    db.session.commit()
    
    return '', 204

@files.route('/project/<int:project_id>/upload', methods=['POST'])
@login_required
def upload_file_auto_detect(project_id):
    require_project_access(project_id, 'editor')
    project = Project.query.get_or_404(project_id)
    upload_method = request.form.get('upload_method', 'file')
    
    if upload_method == 'file':
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400
        
        file = request.files['file']
        is_valid, message = validate_file_security(file)
        if not is_valid:
            return jsonify({'error': message}), 400
        
        if not file.filename.lower().endswith('.txt'):
            return jsonify({'error': 'Only .txt files are allowed for direct upload. Use the USFM importer for .usfm/.sfm files.'}), 400
        
        file_content = read_file_content(file, file.filename)
        filename = secure_filename(file.filename)
        
    elif upload_method == 'text':
        text_content = request.form.get('text_content', '').strip()
        if not text_content:
            return jsonify({'error': 'No text content provided'}), 400
        
        file_content = text_content
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        filename = f"text_{timestamp}.txt"
        
    else:
        return jsonify({'error': 'Invalid upload method'}), 400
    
    is_usfm = detect_usfm_content(file_content, filename)
    
    if is_usfm:
        return handle_usfm_auto_upload(project_id, project, file_content, filename)
    else:
        return handle_text_auto_upload(project_id, project, file_content, filename)

def handle_usfm_auto_upload(project_id, project, file_content, filename):
    from utils.usfm_parser import USFMParser, EBibleBuilder
    
    parser = USFMParser()
    vref_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'vref.txt')
    builder = EBibleBuilder(vref_path)
    
    try:
        file_verses = parser.parse_file(file_content, filename)
    except ValueError as e:
        return error_response(f'Invalid USFM file "{filename}": {str(e)}')
    except Exception as e:
        return error_response(f'Error parsing USFM file "{filename}": {str(e)}', 500)
    
    # Create eBible format from USFM verses
    ebible_lines = builder.create_ebible_from_usfm_verses(file_verses)
    ebible_content = '\n'.join(ebible_lines)
    
    # Generate descriptive filename
    safe_base = safe_filename_from_original(filename)
    project_filename = f"usfm_{safe_base}_{create_timestamped_filename()}"
    
    # Store directly in database using save_project_file
    project_file = save_project_file(project_id, ebible_content, project_filename, 'ebible', 'text/plain')
    db.session.commit()
    
    stats = builder.get_completion_stats(ebible_lines)
    
    return jsonify({
        'success': True,
        'is_usfm': True,
        'message': f'USFM file "{filename}" processed and stored in database successfully',
        'file_id': project_file.id,
        'filename': project_filename,
        'verses_added': len(file_verses),
        'stats': stats
    })

def handle_text_auto_upload(project_id, project, file_content, filename):
    validation = validate_text_file(file_content, filename)
    if not validation['valid']:
        return error_response(validation['error'])
    
    project_file = save_project_file(project_id, file_content, filename, 'text', 'text/plain')
    db.session.commit()
    
    return success_response(
        f'Text file "{filename}" uploaded successfully',
        {
            'is_usfm': False,
            'line_count': validation['line_count']
        }
    )

@files.route('/project/<int:project_id>/usfm-import')
@login_required
def usfm_import(project_id):
    require_project_access(project_id, 'viewer')
    project = Project.query.get_or_404(project_id)
    return render_template('usfm_import.html', project=project)

@files.route('/project/<int:project_id>/usfm-status')
@login_required
def usfm_status(project_id):
    """Get USFM import status and progress stats"""
    require_project_access(project_id, 'viewer')
    project = Project.query.get_or_404(project_id)
    
    total_verses = 0
    filled_verses = 0
    
    # Count from unified Text records (USFM uploads use this)
    from models import Text, Verse
    
    source_texts = Text.query.filter_by(
        project_id=project_id, 
        text_type='source'
    ).all()
    
    for text in source_texts:
        # Count all verses for this text
        verses = Verse.query.filter_by(text_id=text.id).all()
        total_verses += len(verses)
        # Count filled verses (non-empty text)
        filled_verses += sum(1 for v in verses if v.verse_text and v.verse_text.strip())
    
    # Calculate completion percentage based on Protestant canon
    completion_percentage = (filled_verses / 31170) * 100 if filled_verses > 0 else 0.0
    
    stats = {
        'total_verses': total_verses,
        'filled_verses': filled_verses,
        'completion_percentage': completion_percentage
    }
    
    return jsonify({
        'success': True,
        'stats': stats,
        'uploaded_files': []  # Could be enhanced to track individual file info
    })

@files.route('/project/<int:project_id>/usfm-upload', methods=['POST'])
@login_required
def usfm_upload(project_id):
    require_project_access(project_id, 'editor')
    project = Project.query.get_or_404(project_id)
    
    if 'usfm_files' not in request.files:
        return error_response('No files provided')
    
    files = request.files.getlist('usfm_files')
    if not files:
        return error_response('No files selected')
    
    # Process all files as USFM content
    all_verses = {}
    uploaded_file_info = []
    processing_errors = []
    
    from utils.usfm_parser import USFMParser, EBibleBuilder
    parser = USFMParser()
    
    for file in files:
        is_valid, message = validate_file_security(file)
        if not is_valid:
            processing_errors.append(f'{file.filename}: {message}')
            uploaded_file_info.append({
                'filename': file.filename or 'unknown',
                'verses_count': 0,
                'status': 'error',
                'error': message
            })
            continue
            
        try:
            content = read_file_content(file, file.filename)
            file_verses = parser.parse_file(content, file.filename)
            all_verses.update(file_verses)
            
            uploaded_file_info.append({
                'filename': file.filename,
                'verses_count': len(file_verses),
                'status': 'success'
            })
        except ValueError as e:
            processing_errors.append(f'{file.filename}: {str(e)}')
            uploaded_file_info.append({
                'filename': file.filename,
                'verses_count': 0,
                'status': 'error',
                'error': str(e)
            })
        except Exception as e:
            processing_errors.append(f'{file.filename}: Error processing file - {str(e)}')
            uploaded_file_info.append({
                'filename': file.filename,
                'verses_count': 0,
                'status': 'error',
                'error': f'Processing error: {str(e)}'
            })
    
    if not all_verses:
        error_msg = 'No verses extracted from any files.'
        if processing_errors:
            error_msg += f' Errors: {"; ".join(processing_errors)}'
        return jsonify({'error': error_msg}), 400
    
    # Create eBible format from all verses
    vref_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'vref.txt')
    builder = EBibleBuilder(vref_path)
    ebible_lines = builder.create_ebible_from_usfm_verses(all_verses)
    ebible_content = '\n'.join(ebible_lines)
    
    # Generate descriptive filename
    if len(uploaded_file_info) == 1:
        safe_base = safe_filename_from_original(uploaded_file_info[0]['filename'])
        project_filename = f"usfm_{safe_base}"
    else:
        project_filename = f"usfm_combined_{len(uploaded_file_info)}_files_{create_timestamped_filename()}"
    
    # Store directly in database using save_project_file
    project_file = save_project_file(project_id, ebible_content, project_filename, 'ebible', 'text/plain')
    db.session.commit()
    

    
    # Calculate stats for response
    from utils.usfm_parser import EBibleBuilder
    vref_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'vref.txt')
    builder = EBibleBuilder(vref_path)
    stats = builder.get_completion_stats(ebible_lines)
    
    result = {
        'success': True,
        'message': f'Processed {len([f for f in uploaded_file_info if f["status"] == "success"])} USFM file(s), stored {len(all_verses)} verses in database',
        'uploaded_files': uploaded_file_info,
        'verses_added': len(all_verses),
        'file_id': project_file.id,
        'filename': project_filename,
        'stats': stats  # Include completion stats
    }
    
    if processing_errors:
        result['warnings'] = processing_errors
        
    return jsonify(result)

@files.route('/project/<int:project_id>/usfm-complete', methods=['POST'])
@login_required
def usfm_complete(project_id):
    """Complete USFM import process"""
    require_project_access(project_id, 'editor')
    project = Project.query.get_or_404(project_id)
    
    # For now, this just returns success since files are already processed
    # Could be enhanced to perform final validation or consolidation
    
    return jsonify({
        'success': True,
        'message': 'USFM import completed successfully'
    })


@files.route('/project/<int:project_id>/upload-target-text', methods=['POST'])
@login_required
def upload_target_text(project_id):
    require_project_access(project_id, 'editor')
    project = Project.query.get_or_404(project_id)
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400
    
    file = request.files['file']
    if not file.filename:
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.lower().endswith('.txt'):
        return jsonify({'error': 'Only .txt files are allowed for direct upload. Use the USFM importer for .usfm/.sfm files.'}), 400
    
    file_content = read_file_content(file, file.filename)
    
    if request.form.get('text_content'):
        text_content = request.form.get('text_content', '').strip()
        if not text_content:
            return jsonify({'error': 'No text content provided'}), 400
        
        if len(text_content) > 16000:
            return jsonify({'error': 'Text content exceeds 16,000 character limit'}), 400
        
        file_content = text_content
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        filename = f"target_text_{timestamp}.txt"
    else:
        filename = secure_filename(file.filename)
    
    validation = validate_text_file(file_content, filename)
    if not validation['valid']:
        return jsonify({'error': validation['error']}), 400
    
    project_file = save_project_file(project_id, file_content, filename, 'text', 'text/plain')
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': f'Target text "{filename}" uploaded successfully',
        'file_id': project_file.id,
        'filename': filename,
        'line_count': validation['line_count']
    })

@files.route('/project/<int:project_id>/files')
@login_required
def project_files(project_id):
    require_project_access(project_id, 'viewer')
    project = Project.query.get_or_404(project_id)
    
    # Use unified Text model instead of legacy ProjectFile
    from models import Text, Verse
    texts = Text.query.filter_by(project_id=project.id).order_by(Text.created_at.desc()).all()
    
    file_data = []
    for text in texts:
        # Skip JSONL files if needed
        if text.name and text.name.lower().endswith('.jsonl'):
            continue
            
        verse_count = Verse.query.filter_by(text_id=text.id).count()
        file_data.append({
            'id': text.id,
            'filename': text.name,
            'file_type': text.text_type,
            'file_size': 0,  # Not tracked in unified schema
            'line_count': verse_count,
            'created_at': text.created_at.isoformat(),
            'purpose': text.description or ''
        })
    
    return jsonify({'files': file_data})

@files.route('/project/<int:project_id>/files/<int:file_id>/download')
@login_required  
def download_project_file(project_id, file_id):
    require_project_access(project_id, 'viewer')
    project = Project.query.get_or_404(project_id)
    project_file = Text.query.filter_by(id=file_id, project_id=project.id).first_or_404()
    
    storage = get_storage()
    
    if hasattr(storage, 'base_path'):
        file_data = storage.get_file(project_file.storage_path)
        return send_from_directory(storage.base_path, project_file.storage_path, as_attachment=True, download_name=project_file.original_filename, mimetype=project_file.content_type or 'application/octet-stream')
    else:
        file_url = storage.get_file_url(project_file.storage_path)
        return jsonify({'download_url': file_url})

@files.route('/project/<int:project_id>/files/<int:file_id>/purpose', methods=['POST'])
@login_required
def update_file_purpose(project_id, file_id):
    require_project_access(project_id, 'editor')
    project = Project.query.get_or_404(project_id)
    project_file = Text.query.filter_by(id=file_id, project_id=project.id).first_or_404()
    
    purpose_description = request.json.get('purpose_description', '').strip()
    
    if len(purpose_description) > 1000:
        return jsonify({'error': 'Purpose description must be 1000 characters or less'}), 400
    
    project_file.purpose_description = purpose_description if purpose_description else None
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'message': 'File purpose updated successfully',
        'purpose_description': project_file.purpose_description
    })

@files.route('/uploads/<path:filename>')
@login_required
def serve_upload(filename):
    # Extract project ID from filename path to check access
    # Expected format: projects/{project_id}/...
    path_parts = filename.split('/')
    if len(path_parts) >= 2 and path_parts[0] == 'projects':
        try:
            project_id = int(path_parts[1])
            require_project_access(project_id, 'viewer')
        except (ValueError, IndexError):
            abort(404)
    else:
        # For non-project files, require authentication only
        pass
    
    storage = get_storage()
    
    if hasattr(storage, 'base_path'):
        try:
            file_data = storage.get_file(filename)
            return send_from_directory(storage.base_path, filename)
        except FileNotFoundError:
            abort(404)
    else:
        return redirect(storage.get_file_url(filename)) 