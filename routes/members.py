from flask import Blueprint, request, jsonify, render_template, redirect, url_for, flash
from flask_login import login_required, current_user

from models import db, Project, User
from utils.project_access import ProjectAccess, require_project_access
from utils import validate_and_sanitize_request, error_response, success_response

members = Blueprint('members', __name__)


@members.route('/project/<int:project_id>/members')
@login_required
def project_members(project_id):
    """Show project members management page"""
    require_project_access(project_id, 'owner')
    project = Project.query.get_or_404(project_id)
    
    # Get all members with their details
    members_data = project.get_members()
    
    return render_template('project_members.html', 
                         project=project, 
                         members=members_data)


@members.route('/project/<int:project_id>/members/add', methods=['POST'])
@login_required
def add_member(project_id):
    """Add a new member to the project"""
    require_project_access(project_id, 'owner')
    
    # Validate and sanitize input
    is_valid, data, error_msg = validate_and_sanitize_request({
        'email': {'max_length': 254, 'required': True},
        'role': {'max_length': 20, 'choices': ['viewer', 'editor', 'owner'], 'default': 'viewer'}
    })
    
    if not is_valid:
        return error_response(error_msg)
    
    email = data['email'].lower()
    
    # Check if user exists
    user = User.query.filter_by(email=email).first()
    if not user:
        return error_response('User not found. They need to create an account first.', 404)
    
    # Add member using centralized system
    success = ProjectAccess.add_member(project_id, email, data['role'], current_user.id)
    
    if success:
        return success_response(
            f'{user.name or email} added as {data["role"]}',
            {
                'member': {
                    'id': user.id,
                    'name': user.name or email,
                    'email': user.email,
                    'role': data['role']
                }
            }
        )
    else:
        return error_response('User is already a member or could not be added')


@members.route('/project/<int:project_id>/members/<int:user_id>/role', methods=['POST'])
@login_required
def update_member_role(project_id, user_id):
    """Update a member's role"""
    require_project_access(project_id, 'owner')
    
    data = request.get_json()
    new_role = data.get('role')
    
    if new_role not in ['viewer', 'editor', 'owner']:
        return error_response('Invalid role')
    
    success = ProjectAccess.update_member_role(project_id, user_id, new_role, current_user.id)
    
    if success:
        user = User.query.get(user_id)
        return success_response(f'{user.name or user.email} role updated to {new_role}')
    else:
        return error_response('Could not update role. Cannot demote the last owner.')


@members.route('/project/<int:project_id>/members/<int:user_id>', methods=['DELETE'])
@login_required
def remove_member(project_id, user_id):
    """Remove a member from the project"""
    require_project_access(project_id, 'owner')
    
    success = ProjectAccess.remove_member(project_id, user_id, current_user.id)
    
    if success:
        user = User.query.get(user_id)
        return success_response(f'{user.name or user.email} removed from project')
    else:
        return error_response('Could not remove member. Cannot remove the last owner.')


@members.route('/api/users/search')
@login_required
def search_users():
    """Search for users by email (for adding to projects)"""
    query = request.args.get('q', '').strip()
    
    if len(query) < 3:
        return jsonify({'users': []})
    
    users = User.query.filter(
        User.email.ilike(f'%{query}%')
    ).limit(10).all()
    
    return jsonify({
        'users': [
            {
                'id': user.id,
                'name': user.name or user.email,
                'email': user.email
            }
            for user in users
        ]
    }) 