import pytest
import os
from app import create_app
from models import db, User, Project, ProjectMember


@pytest.fixture
def app():
    """Create test Flask app using actual configuration"""
    # Set test environment
    os.environ['TESTING'] = 'true'
    os.environ['DEVELOPMENT_MODE'] = 'true'
    
    # Create app with actual config but mark as testing
    app = create_app()
    app.config['TESTING'] = True
    app.config['WTF_CSRF_ENABLED'] = False
    
    # Use app context for the duration of the test
    with app.app_context():
        yield app


@pytest.fixture
def client(app):
    """Test client for making requests"""
    return app.test_client()


@pytest.fixture
def runner(app):
    """Test CLI runner"""
    return app.test_cli_runner()


def cleanup_test_projects():
    """Comprehensive cleanup of all test projects and related data"""
    try:
        # Test project identifiers
        test_project_languages = [
            'Test-Language-12345', 'Test-German', 'Test-Portuguese-99999',
            'Spanish', 'German', 'Portuguese', 'French'  # Keep old names for backward compatibility
        ]
        
        test_projects = Project.query.filter(
            Project.target_language.in_(test_project_languages)
        ).all()
        
        for project in test_projects:
            try:
                # Delete all related data in correct order to avoid foreign key constraints
                from models import (Text, LanguageRule, FineTuningJob, 
                                  VerseAudio, Verse)
                
                # Delete verses first (they reference texts)
                for text in Text.query.filter_by(project_id=project.id).all():
                    Verse.query.filter_by(text_id=text.id).delete()
                
                # Delete related data
                Text.query.filter_by(project_id=project.id).delete()
                ProjectMember.query.filter_by(project_id=project.id).delete()
                LanguageRule.query.filter_by(project_id=project.id).delete()
                FineTuningJob.query.filter_by(project_id=project.id).delete()
                VerseAudio.query.filter_by(project_id=project.id).delete()
                
                # Handle other tables that might reference projects
                try:
                    db.session.execute(
                        db.text("DELETE FROM linguistic_summary_jobs WHERE project_id = :project_id"),
                        {"project_id": project.id}
                    )
                    db.session.execute(
                        db.text("DELETE FROM project_files WHERE project_id = :project_id"),
                        {"project_id": project.id}
                    )
                except Exception:
                    pass  # Tables might not exist
                
                # Finally delete the project itself
                db.session.delete(project)
                
            except Exception:
                continue  # Skip problematic projects
        
        # Clean up test user
        test_user = User.query.filter_by(email='dev@codexzero.local').first()
        if test_user:
            try:
                ProjectMember.query.filter_by(user_id=test_user.id).delete()
                db.session.delete(test_user)
            except Exception:
                pass
                
        # Commit all deletions
        db.session.commit()
            
    except Exception:
        db.session.rollback()


@pytest.fixture(autouse=True)
def cleanup_test_data():
    """Clean up test data after each test"""
    yield
    
    # Clean up test data created during tests
    try:
        cleanup_test_projects()
    except Exception:
        # If cleanup fails, rollback and continue
        db.session.rollback() 