"""
Centralized Project Access Control System

This module provides a single source of truth for all project permissions.
All project access should go through these functions to maintain DRY principles.
"""

from typing import List, Optional, Union
from flask import abort
from flask_login import current_user
from sqlalchemy import and_, or_


class ProjectAccess:
    """Centralized project access control"""
    
    # Role hierarchy (higher number = more permissions)
    ROLE_HIERARCHY = {
        'viewer': 1,
        'editor': 2, 
        'owner': 3
    }
    
    @staticmethod
    def get_user_role(project_id: int, user_id: int) -> Optional[str]:
        """Get user's role in a project. Returns None if no access."""
        from models import ProjectMember
        
        member = ProjectMember.query.filter_by(
            project_id=project_id, 
            user_id=user_id
        ).first()
        
        return member.role if member and member.accepted_at else None
    
    @staticmethod
    def has_permission(project_id: int, user_id: int, required_role: str = 'viewer') -> bool:
        """
        Check if user has required permission level for project.
        
        Args:
            project_id: Project ID to check
            user_id: User ID to check
            required_role: Minimum role required ('viewer', 'editor', 'owner')
            
        Returns:
            True if user has required permission or higher
        """
        user_role = ProjectAccess.get_user_role(project_id, user_id)
        
        if not user_role:
            return False
            
        user_level = ProjectAccess.ROLE_HIERARCHY.get(user_role, 0)
        required_level = ProjectAccess.ROLE_HIERARCHY.get(required_role, 0)
        
        return user_level >= required_level
    
    @staticmethod
    def require_permission(project_id: int, user_id: int, required_role: str = 'viewer'):
        """
        Require permission or abort with 403.
        This is the main function to use in routes for DRY permission checking.
        
        Args:
            project_id: Project ID to check
            user_id: User ID to check  
            required_role: Minimum role required ('viewer', 'editor', 'owner')
            
        Raises:
            403 Forbidden if user doesn't have required permission
        """
        if not ProjectAccess.has_permission(project_id, user_id, required_role):
            abort(403)
    
    @staticmethod
    def get_accessible_projects(user_id: int) -> List[int]:
        """Get list of project IDs user has any access to"""
        from models import ProjectMember
        
        members = ProjectMember.query.filter(
            and_(
                ProjectMember.user_id == user_id,
                ProjectMember.accepted_at.isnot(None)
            )
        ).all()
        
        return [member.project_id for member in members]
    
    @staticmethod
    def get_projects_with_role(user_id: int, role: str = None) -> List[int]:
        """Get project IDs where user has specific role (or any role if None)"""
        from models import ProjectMember
        
        query = ProjectMember.query.filter(
            and_(
                ProjectMember.user_id == user_id,
                ProjectMember.accepted_at.isnot(None)
            )
        )
        
        if role:
            query = query.filter(ProjectMember.role == role)
            
        return [member.project_id for member in query.all()]
    
    @staticmethod
    def add_member(project_id: int, user_email: str, role: str, invited_by_id: int) -> bool:
        """
        Add a new member to project.
        
        Args:
            project_id: Project to add member to
            user_email: Email of user to invite
            role: Role to assign ('viewer', 'editor', 'owner')
            invited_by_id: ID of user sending invitation
            
        Returns:
            True if successful, False if user not found or already member
        """
        from models import db, User, ProjectMember
        from datetime import datetime
        
        # Check if inviter has owner permission
        if not ProjectAccess.has_permission(project_id, invited_by_id, 'owner'):
            return False
            
        # Find user by email
        user = User.query.filter_by(email=user_email).first()
        if not user:
            return False
            
        # Check if already a member
        existing = ProjectMember.query.filter_by(
            project_id=project_id,
            user_id=user.id
        ).first()
        
        if existing:
            return False
            
        # Create membership
        member = ProjectMember(
            project_id=project_id,
            user_id=user.id,
            role=role,
            invited_by=invited_by_id,
            accepted_at=datetime.utcnow()  # Auto-accept for now
        )
        
        db.session.add(member)
        db.session.commit()
        return True
    
    @staticmethod
    def remove_member(project_id: int, user_id: int, removed_by_id: int) -> bool:
        """
        Remove member from project.
        
        Args:
            project_id: Project to remove member from
            user_id: User to remove
            removed_by_id: ID of user performing removal
            
        Returns:
            True if successful
        """
        from models import db, ProjectMember
        
        # Check if remover has owner permission
        if not ProjectAccess.has_permission(project_id, removed_by_id, 'owner'):
            return False
            
        # Don't allow removing the last owner
        owners = ProjectMember.query.filter_by(
            project_id=project_id,
            role='owner'
        ).filter(ProjectMember.accepted_at.isnot(None)).count()
        
        member_to_remove = ProjectMember.query.filter_by(
            project_id=project_id,
            user_id=user_id
        ).first()
        
        if member_to_remove and member_to_remove.role == 'owner' and owners <= 1:
            return False  # Can't remove last owner
            
        if member_to_remove:
            db.session.delete(member_to_remove)
            db.session.commit()
            return True
            
        return False
    
    @staticmethod
    def update_member_role(project_id: int, user_id: int, new_role: str, updated_by_id: int) -> bool:
        """
        Update member's role in project.
        
        Args:
            project_id: Project ID
            user_id: User whose role to update
            new_role: New role to assign
            updated_by_id: ID of user making the change
            
        Returns:
            True if successful
        """
        from models import db, ProjectMember
        
        # Check if updater has owner permission
        if not ProjectAccess.has_permission(project_id, updated_by_id, 'owner'):
            return False
            
        member = ProjectMember.query.filter_by(
            project_id=project_id,
            user_id=user_id
        ).first()
        
        if not member:
            return False
            
        # Don't allow demoting the last owner
        if member.role == 'owner' and new_role != 'owner':
            owners = ProjectMember.query.filter_by(
                project_id=project_id,
                role='owner'
            ).filter(ProjectMember.accepted_at.isnot(None)).count()
            
            if owners <= 1:
                return False
                
        member.role = new_role
        db.session.commit()
        return True
    
    @staticmethod
    def get_project_members(project_id: int):
        """Get all members of a project with their details"""
        from models import ProjectMember, User, db
        
        return db.session.query(ProjectMember, User).join(
            User, ProjectMember.user_id == User.id
        ).filter(
            and_(
                ProjectMember.project_id == project_id,
                ProjectMember.accepted_at.isnot(None)
            )
        ).order_by(
            ProjectMember.role.desc(),  # Owners first
            User.name
        ).all()


# Convenience functions for common use cases
def require_project_access(project_id: int, required_role: str = 'viewer'):
    """Decorator-style function for requiring project access"""
    ProjectAccess.require_permission(project_id, current_user.id, required_role)

def can_view_project(project_id: int, user_id: int = None) -> bool:
    """Check if user can view project"""
    user_id = user_id or current_user.id
    return ProjectAccess.has_permission(project_id, user_id, 'viewer')

def can_edit_project(project_id: int, user_id: int = None) -> bool:
    """Check if user can edit project"""
    user_id = user_id or current_user.id
    return ProjectAccess.has_permission(project_id, user_id, 'editor')

def can_manage_project(project_id: int, user_id: int = None) -> bool:
    """Check if user can manage project (owner level)"""
    user_id = user_id or current_user.id
    return ProjectAccess.has_permission(project_id, user_id, 'owner') 