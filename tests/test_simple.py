"""
Basic functional tests for CodexZero
Tests core functionality: user authentication and project creation
"""

import pytest
from models import db, User, Project, ProjectMember
from datetime import datetime


def test_dev_login_creates_user(client):
    """Test that development login creates and logs in a user"""
    response = client.get('/auth/dev-login', follow_redirects=True)
    
    # Should redirect to dashboard after successful login
    assert response.status_code == 200
    assert b'Your Translation Projects' in response.data
    
    # Verify user was created in database
    dev_user = User.query.filter_by(email='dev@codexzero.local').first()
    assert dev_user is not None
    assert dev_user.name == 'Development User'
    assert dev_user.google_id == 'dev_user_123'


def test_dev_login_with_existing_user(client):
    """Test dev login with user that already exists"""
    # Check if user already exists, if so skip creating
    existing_user = User.query.filter_by(email='dev@codexzero.local').first()
    if not existing_user:
        existing_user = User(
            google_id='dev_user_123',
            email='dev@codexzero.local',
            name='Existing Dev User'
        )
        db.session.add(existing_user)
        db.session.commit()
    
    response = client.get('/auth/dev-login', follow_redirects=True)
    
    # Should still log in successfully
    assert response.status_code == 200
    assert b'Your Translation Projects' in response.data
    
    # Should update last_login but not create duplicate
    users = User.query.filter_by(email='dev@codexzero.local').all()
    assert len(users) == 1
    assert users[0].last_login is not None


def test_main_index_redirects_to_dev_login(client):
    """Test that main index redirects unauthenticated users to dev login in development mode"""
    response = client.get('/')
    
    # Should redirect to dev login
    assert response.status_code == 302
    assert '/auth/dev-login' in response.location


def test_login_requires_authentication(client):
    """Test that protected routes require authentication"""
    response = client.get('/dashboard')
    
    # Should redirect to login
    assert response.status_code == 302
    assert '/auth/login' in response.location


def test_project_creation_basic(client):
    """Test basic project creation with logged in user"""
    # First log in
    client.get('/auth/dev-login')
    
    project_data = {
        'target_language': 'Test-Language-12345',
        'audience': 'Test-Adults',
        'style': 'Test-Formal'
    }
    
    response = client.post('/project', data=project_data, follow_redirects=True)
    
    # Should redirect to dashboard with success
    assert response.status_code == 200
    assert b'Project created successfully!' in response.data
    assert b'Your Translation Projects' in response.data
    
    # Verify project was created in database
    project = Project.query.filter_by(target_language='Test-Language-12345').first()
    assert project is not None
    assert project.audience == 'Test-Adults'
    assert project.style == 'Test-Formal'


def test_project_creation_requires_auth(client):
    """Test that project creation requires authentication"""
    project_data = {
        'target_language': 'Test-German',
        'audience': 'Test-Adults',
        'style': 'Test-Formal'
    }
    
    response = client.post('/project', data=project_data)
    
    # Should redirect to login
    assert response.status_code == 302
    assert '/auth/login' in response.location


def test_dashboard_shows_created_projects(client):
    """Test that dashboard displays user's created projects"""
    # Log in first
    client.get('/auth/dev-login')
    user = User.query.filter_by(email='dev@codexzero.local').first()
    
    # Create a test project
    project = Project(
        user_id=user.id,
        created_by=user.id,
        target_language='Test-Portuguese-99999',
        audience='Test-General',
        style='Test-Modern'
    )
    db.session.add(project)
    db.session.flush()  # Get the project ID
    
    # Add user as owner in the project member system
    owner_member = ProjectMember(
        project_id=project.id,
        user_id=user.id,
        role='owner',
        invited_by=user.id,
        accepted_at=datetime.utcnow()
    )
    db.session.add(owner_member)
    db.session.commit()
    
    response = client.get('/dashboard')
    
    assert response.status_code == 200
    # The project should show up since we're using the new access system
    assert b'Test-Portuguese-99999' in response.data
    assert b'Your Translation Projects' in response.data


def test_new_project_form_loads(client):
    """Test that new project form loads correctly"""
    # Log in first
    client.get('/auth/dev-login')
    
    response = client.get('/project/new')
    
    assert response.status_code == 200
    assert b'Create New Project' in response.data
    assert b'target_language' in response.data


def test_index_page_loads(client):
    """Test that index page loads"""
    response = client.get('/', follow_redirects=True)
    assert response.status_code == 200


def test_dev_shortcut_redirects(client):
    """Test /dev shortcut redirects to dev login"""
    response = client.get('/dev')
    assert response.status_code == 302
    assert '/auth/dev-login' in response.location 