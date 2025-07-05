import os
import io
import json
import uuid
import threading
from datetime import datetime
from werkzeug.utils import secure_filename
from flask import Blueprint, request, jsonify, send_file, redirect, url_for, render_template
from flask_login import current_user, login_required

from models import db, Project, ProjectFile, FineTuningJob
from utils.file_helpers import save_project_file, detect_usfm_content, validate_text_file
from storage import get_storage

files = Blueprint('files', __name__)


@files.route('/project/<int:project_id>/files/<int:file_id>', methods=['DELETE'])
@login_required
def delete_project_file(project_id, file_id):
    """Delete a project file and associated relationships"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    project_file = ProjectFile.query.filter_by(id=file_id, project_id=project.id).first_or_404()
    
    # No need to delete file pairs anymore - using purpose system
    
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


@files.route('/project/<int:project_id>/upload', methods=['POST'])
@login_required
def upload_file_auto_detect(project_id):
    """
    Unified file upload endpoint with automatic USFM detection.
    Automatically detects USFM content and routes to appropriate workflow.
    """
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    
    # Handle both file upload and text paste
    upload_method = request.form.get('upload_method', 'file')
    
    try:
        if upload_method == 'file':
            if 'file' not in request.files:
                return jsonify({'error': 'No file provided'}), 400
            
            file = request.files['file']
            if not file.filename:
                return jsonify({'error': 'No file selected'}), 400
            
            if not file.filename.lower().endswith('.txt'):
                return jsonify({'error': 'Only .txt files are allowed'}), 400
            
            # Read file content for analysis
            file_content = file.read().decode('utf-8')
            file.seek(0)  # Reset file pointer
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
        
        # Detect USFM content
        is_usfm = detect_usfm_content(file_content)
        
        if is_usfm:
            # Route to USFM workflow
            return handle_usfm_auto_upload(project_id, project, file_content, filename)
        else:
            # Route to regular text workflow
            return handle_text_auto_upload(project_id, project, file_content, filename)
            
    except UnicodeDecodeError:
        return jsonify({'error': 'File encoding not supported. Please use UTF-8 encoded text files.'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Upload failed: {str(e)}'}), 500


@files.route('/project/<int:project_id>/upload-file', methods=['POST'])
@login_required
def upload_file_unified(project_id):
    """Legacy unified file upload endpoint - redirects to auto-detect"""
    # For backward compatibility, redirect to the new auto-detect endpoint
    return upload_file_auto_detect(project_id)


def handle_usfm_auto_upload(project_id, project, file_content, filename):
    """Handle USFM file upload with auto-detection"""
    from utils.usfm_parser import USFMParser, EBibleBuilder
    
    # Initialize USFM parser and eBible builder
    parser = USFMParser()
    vref_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'vref.txt')
    builder = EBibleBuilder(vref_path)
    
    # Use temporary files for USFM session management
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
    
    # Parse the USFM file
    try:
        file_verses = parser.parse_file(file_content)
        
        if not file_verses:
            return jsonify({'error': 'No verses found in the USFM file'}), 400
        
        # Track file info
        file_info = {
            'filename': filename,
            'verses_count': len(file_verses),
            'books': [parser.current_book] if parser.current_book else []
        }
        
        # Update eBible lines with new verses
        updated_ebible_lines = builder.create_ebible_from_usfm_verses(
            file_verses, 
            existing_ebible_lines
        )
        
        # Get statistics
        stats = builder.get_completion_stats(updated_ebible_lines)
        
        # Update session data
        usfm_session['uploaded_files'].append(file_info)
        
        # Save session data to file
        with open(session_file_path, 'w', encoding='utf-8') as f:
            json.dump(usfm_session, f)
        
        # Save eBible lines to file
        with open(ebible_file_path, 'w', encoding='utf-8') as f:
            for line in updated_ebible_lines:
                f.write(line + '\n')
        
        processed_books = list(set([book for book in file_info['books']]))
        
        return jsonify({
            'success': True,
            'is_usfm': True,
            'message': f'USFM file "{filename}" processed successfully',
            'redirect_url': f'/project/{project_id}/usfm-import',
            'uploaded_files': [file_info],
            'stats': stats,
            'processed_books': processed_books,
            'verses_added': len(file_verses)
        })
        
    except Exception as e:
        return jsonify({'error': f'Error parsing USFM file: {str(e)}'}), 400


def handle_text_auto_upload(project_id, project, file_content, filename):
    """Handle regular text file upload with auto-detection"""
    
    # Validate text file
    validation = validate_text_file(file_content, filename)
    if not validation['valid']:
        return jsonify({'error': validation['error']}), 400
    
    # Determine file type based on line count and content
    line_count = validation['line_count']
    
    # If it's around 31,170 lines, it's likely an eBible file
    if 30000 <= line_count <= 32000:
        file_type = 'ebible'
    else:
        file_type = 'text'
    
    # Save the file
    project_file = save_project_file(
        project_id,
        file_content,
        filename,
        file_type,
        'text/plain'
    )
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'is_usfm': False,
        'message': f'Text file "{filename}" uploaded successfully ({line_count:,} lines)',
        'file_id': project_file.id,
        'file_type': file_type,
        'line_count': line_count
    })


@files.route('/project/<int:project_id>/usfm-import')
@login_required
def usfm_import(project_id):
    """USFM import page"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    return render_template('usfm_import.html', project=project)


@files.route('/project/<int:project_id>/usfm-upload', methods=['POST'])
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
        vref_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'vref.txt')
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


@files.route('/project/<int:project_id>/usfm-status')
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
        
        vref_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'vref.txt')
        builder = EBibleBuilder(vref_path)
        
        # Get current statistics
        stats = builder.get_completion_stats(ebible_lines)
        
        return jsonify({
            'stats': stats,
            'uploaded_files': usfm_session['uploaded_files']
        })
        
    except Exception as e:
        return jsonify({'error': f'Status check failed: {str(e)}'}), 500


@files.route('/project/<int:project_id>/usfm-complete', methods=['POST'])
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
        vref_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'vref.txt')
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


@files.route('/project/<int:project_id>/upload-target-text', methods=['POST'])
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


@files.route('/project/<int:project_id>/files')
@login_required
def project_files(project_id):
    """List files for a project"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    return jsonify([{
        'id': f.id,
        'filename': f.original_filename,
        'type': f.file_type,
        'size': f.file_size,
        'url': url_for('files.serve_upload', filename=f.storage_path),
        'created_at': f.created_at.isoformat()
    } for f in project.files])


@files.route('/project/<int:project_id>/files/<int:file_id>/download')
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


@files.route('/project/<int:project_id>/files/<int:file_id>/purpose', methods=['POST'])
@login_required
def update_file_purpose(project_id, file_id):
    """Update the purpose description for a file"""
    project = Project.query.filter_by(id=project_id, user_id=current_user.id).first_or_404()
    project_file = ProjectFile.query.filter_by(id=file_id, project_id=project.id).first_or_404()
    
    data = request.get_json()
    purpose_description = data.get('purpose_description', '').strip()
    file_purpose = data.get('file_purpose', '').strip()
    
    # Validate purpose description length
    if len(purpose_description) > 1000:
        return jsonify({'error': 'Purpose description must be 1000 characters or less'}), 400
    
    # Update the file purpose
    project_file.purpose_description = purpose_description if purpose_description else None
    project_file.file_purpose = file_purpose if file_purpose else None
    
    try:
        db.session.commit()
        return jsonify({
            'success': True,
            'message': f'Updated purpose for {project_file.original_filename}'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to update purpose: {str(e)}'}), 500


@files.route('/uploads/<path:filename>')
def serve_upload(filename):
    """Serve uploaded files"""
    storage = get_storage()
    
    # For local storage, serve file directly
    if hasattr(storage, 'base_path'):  # LocalStorage
        file_data = storage.get_file(filename)
        return send_file(io.BytesIO(file_data), as_attachment=False, download_name=filename)
    else:  # Cloud storage
        return redirect(storage.get_file_url(filename)) 