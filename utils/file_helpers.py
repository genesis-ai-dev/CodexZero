import os
import uuid
import io
import json
from datetime import datetime
from werkzeug.utils import secure_filename

from models import db, ProjectFile, LanguageRule
from storage import get_storage


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