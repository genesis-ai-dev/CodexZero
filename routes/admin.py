from datetime import datetime, timedelta
import base64
import hmac
import hashlib
from flask import Blueprint, render_template, request, flash, redirect, url_for, jsonify, current_app
from flask_login import login_required, current_user
from sqlalchemy import func, desc

from models import db, User, Project, ProjectFile, Translation, FineTuningJob

admin = Blueprint('admin', __name__)

def encode_id(id_value, prefix=''):
    """Encode an ID for use in URLs"""
    # Create a simple encoding using base64 and HMAC for security
    secret_key = current_app.config['SECRET_KEY'].encode()
    
    # Combine prefix and ID
    data = f"{prefix}:{id_value}".encode()
    
    # Create HMAC signature
    signature = hmac.new(secret_key, data, hashlib.sha256).hexdigest()[:8]
    
    # Encode with signature
    encoded = base64.urlsafe_b64encode(f"{id_value}:{signature}".encode()).decode().rstrip('=')
    return encoded

def decode_id(encoded_value, prefix=''):
    """Decode an ID from URL"""
    try:
        # Add padding if needed
        padding = 4 - len(encoded_value) % 4
        if padding != 4:
            encoded_value += '=' * padding
            
        # Decode base64
        decoded = base64.urlsafe_b64decode(encoded_value.encode()).decode()
        id_value, signature = decoded.split(':')
        
        # Verify signature
        secret_key = current_app.config['SECRET_KEY'].encode()
        data = f"{prefix}:{id_value}".encode()
        expected_signature = hmac.new(secret_key, data, hashlib.sha256).hexdigest()[:8]
        
        if not hmac.compare_digest(signature, expected_signature):
            return None
            
        return int(id_value)
    except (ValueError, TypeError):
        return None

def admin_required(f):
    """Decorator to require admin access with additional verification"""
    def decorated_function(*args, **kwargs):
        if not current_user.is_authenticated:
            flash('Authentication required.', 'error')
            return redirect(url_for('auth.login'))
        
        # Check admin email
        if current_user.email != 'danieljlosey@gmail.com':
            flash('Access denied. Admin privileges required.', 'error')
            return redirect(url_for('main.index'))
        
        # Additional verification: check recent login (within 4 hours)
        if current_user.last_login:
            from datetime import timedelta
            session_timeout = timedelta(hours=4)
            if datetime.utcnow() - current_user.last_login > session_timeout:
                flash('Admin session expired. Please log in again.', 'warning')
                return redirect(url_for('auth.logout'))
        
        return f(*args, **kwargs)
    decorated_function.__name__ = f.__name__
    return decorated_function

@admin.route('/admin')
@login_required
@admin_required
def dashboard():
    """Admin dashboard with key metrics and user management"""
    page = request.args.get('page', 1, type=int)
    per_page = 20
    
    # User statistics
    total_users = User.query.count()
    recent_users = User.query.filter(
        User.created_at >= datetime.utcnow() - timedelta(days=30)
    ).count()
    active_users = User.query.filter(
        User.last_login >= datetime.utcnow() - timedelta(days=7)
    ).count()
    
    # Project statistics  
    total_projects = Project.query.count()
    total_files = ProjectFile.query.count()
    total_translations = Translation.query.count()
    total_fine_tuning_jobs = FineTuningJob.query.count()
    
    # Recent activity
    recent_signups = User.query.filter(
        User.created_at >= datetime.utcnow() - timedelta(days=7)
    ).order_by(desc(User.created_at)).limit(5).all()
    
    # Paginated users
    users = User.query.order_by(desc(User.created_at)).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    return render_template('admin/dashboard.html',
                         users=users,
                         total_users=total_users,
                         recent_users=recent_users,
                         active_users=active_users,
                         total_projects=total_projects,
                         total_files=total_files,
                         total_translations=total_translations,
                         total_fine_tuning_jobs=total_fine_tuning_jobs,
                         recent_signups=recent_signups,
                         encode_id=encode_id)

@admin.route('/admin/models')
@login_required
@admin_required
def models():
    """Simple paginated view of all fine-tuned models"""
    page = request.args.get('page', 1, type=int)
    per_page = 50
    
    # Get all fine-tuning jobs ordered by creation date (newest first)
    jobs = FineTuningJob.query.order_by(desc(FineTuningJob.created_at)).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    return render_template('admin/models.html', jobs=jobs, encode_id=encode_id)

@admin.route('/admin/users')
@login_required
@admin_required
def users():
    """Detailed user management page"""
    page = request.args.get('page', 1, type=int)
    search = request.args.get('search', '')
    per_page = 50
    
    query = User.query
    
    if search:
        query = query.filter(
            (User.name.contains(search)) |
            (User.email.contains(search))
        )
    
    users = query.order_by(desc(User.created_at)).paginate(
        page=page, per_page=per_page, error_out=False
    )
    
    return render_template('admin/users.html', users=users, search=search, encode_id=encode_id)

@admin.route('/admin/user/<encoded_user_id>')
@login_required
@admin_required  
def user_detail(encoded_user_id):
    """Detailed view of a specific user"""
    user_id = decode_id(encoded_user_id, 'user')
    if not user_id:
        flash('Invalid user identifier', 'error')
        return redirect(url_for('admin.users'))
        
    user = User.query.get_or_404(user_id)
    
    # Get user's projects with counts
    projects = Project.query.filter_by(user_id=user.id).order_by(desc(Project.created_at)).all()
    
    # Calculate totals for this user
    total_files = db.session.query(func.count(ProjectFile.id)).join(Project).filter(Project.user_id == user.id).scalar()
    total_translations = db.session.query(func.count(Translation.id)).join(Project).filter(Project.user_id == user.id).scalar()
    total_fine_tuning = db.session.query(func.count(FineTuningJob.id)).join(Project).filter(Project.user_id == user.id).scalar()
    
    return render_template('admin/user_detail.html',
                         user=user,
                         projects=projects,
                         total_files=total_files,
                         total_translations=total_translations,
                         total_fine_tuning=total_fine_tuning,
                         encode_id=encode_id)

@admin.route('/admin/user/<encoded_user_id>/project/<encoded_project_id>')
@login_required
@admin_required
def view_user_project(encoded_user_id, encoded_project_id):
    """Admin view of a specific user's project"""
    user_id = decode_id(encoded_user_id, 'user')
    project_id = decode_id(encoded_project_id, 'project')
    
    if not user_id or not project_id:
        flash('Invalid identifiers', 'error')
        return redirect(url_for('admin.users'))
    
    user = User.query.get_or_404(user_id)
    project = Project.query.filter_by(id=project_id, user_id=user_id).first_or_404()
    
    # Use the same template as the regular project view, but with admin context
    return render_template('project.html', project=project, admin_view=True, project_owner=user, encode_id=encode_id)

@admin.route('/admin/user/<encoded_user_id>/project/<encoded_project_id>/file/<encoded_file_id>/download')
@login_required
@admin_required
def download_user_project_file(encoded_user_id, encoded_project_id, encoded_file_id):
    """Admin download of a user's project file"""
    import io
    from flask import send_file
    from storage import get_storage
    
    user_id = decode_id(encoded_user_id, 'user')
    project_id = decode_id(encoded_project_id, 'project')
    file_id = decode_id(encoded_file_id, 'file')
    
    if not user_id or not project_id or not file_id:
        flash('Invalid identifiers', 'error')
        return redirect(url_for('admin.users'))
    
    # Verify user and project exist and are related
    user = User.query.get_or_404(user_id)
    project = Project.query.filter_by(id=project_id, user_id=user_id).first_or_404()
    project_file = ProjectFile.query.filter_by(id=file_id, project_id=project.id).first_or_404()
    
    storage = get_storage()
    
    try:
        # For local storage, serve file directly with download headers
        if hasattr(storage, 'base_path'):  # LocalStorage
            file_data = storage.get_file(project_file.storage_path)
            return send_file(
                io.BytesIO(file_data), 
                as_attachment=True, 
                download_name=f"{user.name}_{project_file.original_filename}",
                mimetype=project_file.content_type or 'application/octet-stream'
            )
        else:  # Cloud storage
            # For cloud storage, redirect to a signed URL for download
            return redirect(storage.get_file_url(project_file.storage_path))
    except Exception as e:
        flash(f'File download failed: {str(e)}', 'error')
        return redirect(url_for('admin.view_user_project', 
                              encoded_user_id=encoded_user_id, 
                              encoded_project_id=encoded_project_id)) 