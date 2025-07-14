import pytest
from models import db, User, Project, ProjectMember
from utils.project_access import ProjectAccess
from datetime import datetime


class TestProjectAccess:
    """Test the project access control system"""
    
    @pytest.fixture
    def users(self, app):
        """Create test users"""
        with app.app_context():
            # Create test users
            owner_user = User(
                google_id="owner123",
                email="owner@test.com",
                name="Owner User"
            )
            editor_user = User(
                google_id="editor123", 
                email="editor@test.com",
                name="Editor User"
            )
            viewer_user = User(
                google_id="viewer123",
                email="viewer@test.com", 
                name="Viewer User"
            )
            no_access_user = User(
                google_id="none123",
                email="none@test.com",
                name="No Access User"
            )
            
            db.session.add_all([owner_user, editor_user, viewer_user, no_access_user])
            db.session.commit()
            
            return {
                'owner': owner_user,
                'editor': editor_user, 
                'viewer': viewer_user,
                'no_access': no_access_user
            }
    
    @pytest.fixture
    def project_with_members(self, app, users):
        """Create test project with various member roles"""
        with app.app_context():
            # Create test project
            project = Project(
                user_id=users['owner'].id,
                created_by=users['owner'].id,
                target_language="Spanish",
                audience="General",
                style="Formal"
            )
            db.session.add(project)
            db.session.flush()
            
            # Add members with different roles
            owner_member = ProjectMember(
                project_id=project.id,
                user_id=users['owner'].id,
                role='owner',
                invited_by=users['owner'].id,
                accepted_at=datetime.utcnow()
            )
            editor_member = ProjectMember(
                project_id=project.id,
                user_id=users['editor'].id,
                role='editor',
                invited_by=users['owner'].id,
                accepted_at=datetime.utcnow()
            )
            viewer_member = ProjectMember(
                project_id=project.id,
                user_id=users['viewer'].id,
                role='viewer',
                invited_by=users['owner'].id,
                accepted_at=datetime.utcnow()
            )
            
            db.session.add_all([owner_member, editor_member, viewer_member])
            db.session.commit()
            
            return project


class TestGetUserRole:
    """Test getting user roles in projects"""
    
    def test_get_owner_role(self, app, users, project_with_members):
        """Test getting owner role"""
        with app.app_context():
            role = ProjectAccess.get_user_role(project_with_members.id, users['owner'].id)
            assert role == 'owner'
    
    def test_get_editor_role(self, app, users, project_with_members):
        """Test getting editor role"""
        with app.app_context():
            role = ProjectAccess.get_user_role(project_with_members.id, users['editor'].id)
            assert role == 'editor'
    
    def test_get_viewer_role(self, app, users, project_with_members):
        """Test getting viewer role"""
        with app.app_context():
            role = ProjectAccess.get_user_role(project_with_members.id, users['viewer'].id)
            assert role == 'viewer'
    
    def test_get_no_access_role(self, app, users, project_with_members):
        """Test getting None for users with no access"""
        with app.app_context():
            role = ProjectAccess.get_user_role(project_with_members.id, users['no_access'].id)
            assert role is None
    
    def test_get_role_nonexistent_project(self, app, users):
        """Test getting role for nonexistent project"""
        with app.app_context():
            role = ProjectAccess.get_user_role(99999, users['owner'].id)
            assert role is None
    
    def test_get_role_nonexistent_user(self, app, project_with_members):
        """Test getting role for nonexistent user"""
        with app.app_context():
            role = ProjectAccess.get_user_role(project_with_members.id, 99999)
            assert role is None


class TestHasPermission:
    """Test permission checking with role hierarchy"""
    
    def test_owner_has_all_permissions(self, app, users, project_with_members):
        """Test that owner has all permission levels"""
        with app.app_context():
            project_id = project_with_members.id
            user_id = users['owner'].id
            
            assert ProjectAccess.has_permission(project_id, user_id, 'viewer') is True
            assert ProjectAccess.has_permission(project_id, user_id, 'editor') is True
            assert ProjectAccess.has_permission(project_id, user_id, 'owner') is True
    
    def test_editor_has_editor_and_viewer_permissions(self, app, users, project_with_members):
        """Test that editor has editor and viewer permissions but not owner"""
        with app.app_context():
            project_id = project_with_members.id
            user_id = users['editor'].id
            
            assert ProjectAccess.has_permission(project_id, user_id, 'viewer') is True
            assert ProjectAccess.has_permission(project_id, user_id, 'editor') is True
            assert ProjectAccess.has_permission(project_id, user_id, 'owner') is False
    
    def test_viewer_has_only_viewer_permission(self, app, users, project_with_members):
        """Test that viewer only has viewer permission"""
        with app.app_context():
            project_id = project_with_members.id
            user_id = users['viewer'].id
            
            assert ProjectAccess.has_permission(project_id, user_id, 'viewer') is True
            assert ProjectAccess.has_permission(project_id, user_id, 'editor') is False
            assert ProjectAccess.has_permission(project_id, user_id, 'owner') is False
    
    def test_no_access_user_has_no_permissions(self, app, users, project_with_members):
        """Test that user with no access has no permissions"""
        with app.app_context():
            project_id = project_with_members.id
            user_id = users['no_access'].id
            
            assert ProjectAccess.has_permission(project_id, user_id, 'viewer') is False
            assert ProjectAccess.has_permission(project_id, user_id, 'editor') is False
            assert ProjectAccess.has_permission(project_id, user_id, 'owner') is False
    
    def test_default_permission_is_viewer(self, app, users, project_with_members):
        """Test that default required permission is viewer"""
        with app.app_context():
            project_id = project_with_members.id
            
            # All users with access should pass default permission check
            assert ProjectAccess.has_permission(project_id, users['owner'].id) is True
            assert ProjectAccess.has_permission(project_id, users['editor'].id) is True
            assert ProjectAccess.has_permission(project_id, users['viewer'].id) is True
            assert ProjectAccess.has_permission(project_id, users['no_access'].id) is False
    
    def test_invalid_role_requirements(self, app, users, project_with_members):
        """Test behavior with invalid role requirements"""
        with app.app_context():
            project_id = project_with_members.id
            user_id = users['owner'].id
            
            # Invalid role should return False (0 level in hierarchy)
            assert ProjectAccess.has_permission(project_id, user_id, 'invalid_role') is False
    
    def test_permission_check_with_nonexistent_project(self, app, users):
        """Test permission check with nonexistent project"""
        with app.app_context():
            assert ProjectAccess.has_permission(99999, users['owner'].id, 'viewer') is False
    
    def test_permission_check_with_nonexistent_user(self, app, project_with_members):
        """Test permission check with nonexistent user"""
        with app.app_context():
            assert ProjectAccess.has_permission(project_with_members.id, 99999, 'viewer') is False


class TestRoleHierarchy:
    """Test the role hierarchy constants and logic"""
    
    def test_role_hierarchy_values(self):
        """Test that role hierarchy has correct values"""
        assert ProjectAccess.ROLE_HIERARCHY['viewer'] == 1
        assert ProjectAccess.ROLE_HIERARCHY['editor'] == 2
        assert ProjectAccess.ROLE_HIERARCHY['owner'] == 3
    
    def test_role_hierarchy_ordering(self):
        """Test that role hierarchy is properly ordered"""
        viewer_level = ProjectAccess.ROLE_HIERARCHY['viewer']
        editor_level = ProjectAccess.ROLE_HIERARCHY['editor']
        owner_level = ProjectAccess.ROLE_HIERARCHY['owner']
        
        assert viewer_level < editor_level < owner_level 