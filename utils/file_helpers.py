import os
import uuid
import io
import json
import re
import chardet
from datetime import datetime
from werkzeug.utils import secure_filename

from models import db, LanguageRule
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
    """
    Save project file using UNIFIED SCHEMA - dramatically simplified!
    
    Bible texts (ebible, text, back_translation) -> Text + Verse records (database only)
    Training files (jsonl, rtf) -> Legacy ProjectFile records (file storage)
    """
    
    # Handle both uploaded files and text data
    if isinstance(file_data, str):
        file_content = file_data
        file_size = len(file_data.encode('utf-8'))
    else:
        # File upload - read content
        content = file_data.read()
        file_size = len(content)
        file_content = content.decode('utf-8')
        file_data.seek(0)
    
    # Use unified Text + Verse approach for all file types
    from utils.text_manager import TextManager
    
    # Determine text_type for unified schema
    if file_type == 'back_translation':
        text_type = 'back_translation'
    else:
        text_type = 'source'  # All files are treated as source material
    
    # Create Text record
    text_id = TextManager.create_text(
        project_id=project_id,
        name=filename,
        text_type=text_type,
        description=f"Uploaded {file_type} file"
    )
    
    # Import verses for Bible text files
    if file_type in ['text', 'ebible', 'back_translation'] and not filename.endswith('.jsonl'):
        success = TextManager.import_verses(text_id, file_content)
        if not success:
            raise Exception("Failed to import verses to database")
    
    # Return a compatibility object
    class UnifiedFileResult:
        def __init__(self, text_id, filename, file_type):
            self.id = text_id
            self.text_id = text_id
            self.original_filename = filename
            self.file_type = file_type
    
    return UnifiedFileResult(text_id, filename, file_type)


def safe_decode_content(file_content):
    """Auto-detect encoding to preserve all characters with zero information loss"""
    detected = chardet.detect(file_content)
    encoding = detected['encoding'] if detected and detected['encoding'] else 'utf-8'
    return file_content.decode(encoding) 