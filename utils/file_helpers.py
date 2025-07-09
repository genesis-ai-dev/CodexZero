import os
import uuid
import io
import json
import re
import chardet
from datetime import datetime
from werkzeug.utils import secure_filename

from models import db, ProjectFile, LanguageRule
from storage import get_storage


def detect_usfm_content(file_content: str, filename: str = "") -> bool:
    """
    Detect if file content contains USFM markers.
    
    Args:
        file_content: The file content as a string
        filename: The filename to check extension
        
    Returns:
        bool: True if USFM markers are detected, False otherwise
    """
    # Check file extension first
    if filename:
        ext = filename.lower()
        if not (ext.endswith('.usfm') or ext.endswith('.sfm')):
            return False
    
    # Common USFM markers that indicate structured biblical text
    usfm_markers = [
        r'\\id\s+',      # Book identification
        r'\\c\s+\d+',    # Chapter markers
        r'\\v\s+\d+',    # Verse markers
        r'\\h\s+',       # Header
        r'\\toc\d+\s+',  # Table of contents
        r'\\mt\d*\s+',   # Main title
        r'\\p\s*$',      # Paragraph
        r'\\q\d*\s*',    # Poetry/quotation
        r'\\m\s*$',      # Margin paragraph
        r'\\s\d*\s+',    # Section heading
    ]
    
    # Check for multiple USFM markers (need at least 3 different types)
    marker_count = 0
    for marker in usfm_markers:
        if re.search(marker, file_content, re.MULTILINE):
            marker_count += 1
            if marker_count >= 3:
                return True
    
    return False


def validate_text_file(file_content: str, filename: str) -> dict:
    """
    Validate a text file for line count and basic requirements.
    
    Args:
        file_content: The file content as a string
        filename: The original filename
        
    Returns:
        dict: {'valid': bool, 'error': str, 'line_count': int}
    """
    lines = file_content.splitlines()
    line_count = len(lines)
    
    if line_count < 2:
        return {
            'valid': False,
            'error': f'File "{filename}" must contain at least 2 lines (found {line_count})',
            'line_count': line_count
        }
    
    if line_count > 50000:
        return {
            'valid': False,
            'error': f'File "{filename}" exceeds maximum of 50,000 lines (found {line_count:,})',
            'line_count': line_count
        }
    
    return {
        'valid': True,
        'error': None,
        'line_count': line_count
    }


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
        file_content = file_data
        line_count = len(file_data.splitlines())
    else:
        # File upload - read content for size and line count
        content = file_data.read()
        file_size = len(content)
        file_content = content.decode('utf-8')
        line_count = len(file_content.splitlines())
        file_data.seek(0)
        file_obj = file_data
    
    # For now, still store the file for backup/compatibility
    # This can be removed later once we're confident in database storage
    try:
        storage.store_file(file_obj, storage_path)
    except Exception as e:
        print(f"Storage connection failed: {e}")
        # Log the full error for debugging
        import traceback
        print(f"Full storage error: {traceback.format_exc()}")
        raise Exception(f"File storage unavailable. Please check storage configuration or contact support. Error: {str(e)}")
    
    # Determine if this file should use database storage for verses
    use_database_storage = False
    if file_type in ['text', 'ebible', 'back_translation']:
        # Don't store verses for training data files
        if not filename.endswith('.jsonl') and not filename.endswith('.rtf'):
            use_database_storage = True
    
    # Create project file record
    project_file = ProjectFile(
        project_id=project_id,
        original_filename=filename,
        storage_path=storage_path,
        storage_type='database' if use_database_storage else 'file',
        file_type=file_type,
        content_type=content_type,
        file_size=file_size,
        line_count=line_count
    )
    db.session.add(project_file)
    db.session.flush()  # Get the ID before bulk insert
    
    # Store verses in database if appropriate
    if use_database_storage:
        from models import ProjectFileVerse
        lines = file_content.split('\n')
        verses_data = []
        
        for i, line in enumerate(lines):
            if line.strip():  # Only store non-empty lines
                verses_data.append({
                    'project_file_id': project_file.id,
                    'verse_index': i,
                    'verse_text': line.strip()
                })
        
        # Bulk insert verses for better performance
        if verses_data:
            db.session.bulk_insert_mappings(ProjectFileVerse, verses_data)
    
    return project_file


def safe_decode_content(file_content):
    """Auto-detect encoding to preserve all characters with zero information loss"""
    detected = chardet.detect(file_content)
    encoding = detected['encoding'] if detected and detected['encoding'] else 'utf-8'
    return file_content.decode(encoding) 