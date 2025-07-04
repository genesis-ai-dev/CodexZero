import os
import uuid
import io
import json
import re
from datetime import datetime
from werkzeug.utils import secure_filename

from models import db, ProjectFile, LanguageRule
from storage import get_storage


def detect_usfm_content(file_content: str) -> bool:
    """
    Detect if file content contains USFM markers.
    
    Args:
        file_content: The file content as a string
        
    Returns:
        bool: True if USFM markers are detected, False otherwise
    """
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


def safe_decode_content(file_content):
    """Simple UTF-8 decode that ignores problematic bytes"""
    return file_content.decode('utf-8', errors='ignore') 