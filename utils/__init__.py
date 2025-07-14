import html
import re
from flask import jsonify, request
from werkzeug.utils import secure_filename

def sanitize_text_input(text, max_length=None):
    """Basic text input sanitization to prevent XSS"""
    if not text:
        return text
    
    # Convert to string and strip whitespace
    text = str(text).strip()
    
    # HTML escape to prevent XSS
    text = html.escape(text)
    
    # Remove potentially dangerous characters/patterns
    text = re.sub(r'[<>"\'\`]', '', text)
    
    # Limit length if specified
    if max_length and len(text) > max_length:
        text = text[:max_length]
    
    return text

def sanitize_html_content(content):
    """Sanitize HTML content for display"""
    if not content:
        return content
    
    # Basic HTML escaping
    return html.escape(str(content))

def validate_and_sanitize_request(fields_config):
    """
    Validate and sanitize request fields in one go
    
    Args:
        fields_config: dict with field names and their config
        Example: {
            'email': {'max_length': 254, 'required': True},
            'role': {'max_length': 20, 'choices': ['viewer', 'editor', 'owner']}
        }
    
    Returns:
        tuple: (is_valid, sanitized_data, error_message)
    """
    sanitized_data = {}
    
    # Get data from JSON or form
    if request.is_json:
        data = request.get_json() or {}
    else:
        data = request.form.to_dict()
    
    for field_name, config in fields_config.items():
        value = data.get(field_name, config.get('default', ''))
        
        # Check required fields
        if config.get('required') and not value:
            return False, None, f"{field_name} is required"
        
        # Sanitize the value
        if value:
            value = sanitize_text_input(value, config.get('max_length'))
            
            # Check choices
            if config.get('choices') and value not in config['choices']:
                return False, None, f"Invalid {field_name}"
        
        sanitized_data[field_name] = value
    
    return True, sanitized_data, None

def process_file_upload():
    """
    Common file upload processing with security validation
    
    Returns:
        tuple: (is_valid, file_or_content, filename, error_message)
    """
    from routes.files import validate_file_security, read_file_content
    from datetime import datetime
    
    upload_method = request.form.get('upload_method', 'file')
    
    if upload_method == 'file':
        if 'file' not in request.files:
            return False, None, None, 'No file provided'
        
        file = request.files['file']
        is_valid, message = validate_file_security(file)
        if not is_valid:
            return False, None, None, message
        
        filename = secure_filename(file.filename)
        file_content = read_file_content(file, filename)
        return True, file_content, filename, None
        
    elif upload_method == 'text':
        text_content = sanitize_text_input(request.form.get('text_content', ''), max_length=50000)
        if not text_content:
            return False, None, None, 'No text content provided'
        
        timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
        filename = f"text_{timestamp}.txt"
        return True, text_content, filename, None
        
    else:
        return False, None, None, 'Invalid upload method'

def error_response(message, status_code=400):
    """Standard error response format"""
    return jsonify({'error': message}), status_code

def success_response(message, data=None):
    """Standard success response format"""
    response = {'success': True, 'message': message}
    if data:
        response.update(data)
    return jsonify(response)

def create_timestamped_filename(base_name="text", extension=".txt"):
    """Create a timestamped filename"""
    from datetime import datetime
    timestamp = datetime.utcnow().strftime('%Y%m%d_%H%M%S')
    return f"{base_name}_{timestamp}{extension}"

def safe_filename_from_original(original_filename):
    """Create a safe filename from original, preserving readable parts"""
    if not original_filename:
        return create_timestamped_filename()
    
    # Clean the filename but keep readable parts
    safe_name = "".join(c for c in original_filename if c.isalnum() or c in (' ', '-', '_', '.')).strip()
    if not safe_name:
        return create_timestamped_filename()
    
    return safe_name 