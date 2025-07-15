from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user
from sqlalchemy import and_, or_, desc
from sqlalchemy.orm import joinedload
from datetime import datetime, timedelta

from models import db, UserNotification, Project, VerseFlag, FlagComment, User
from utils.project_access import ProjectAccess
from utils import error_response, success_response

notifications = Blueprint('notifications', __name__)


@notifications.route('/api/notifications')
@login_required
def get_user_notifications():
    """Get notifications for the current user"""
    try:
        # Get user's accessible projects for filtering
        accessible_project_ids = ProjectAccess.get_accessible_projects(current_user.id)
        
        # Get recent notifications (last 30 days) with optimized loading
        notifications_query = UserNotification.query.options(
            joinedload(UserNotification.project),
            joinedload(UserNotification.flag),
            joinedload(UserNotification.comment).joinedload(FlagComment.user)
        ).filter(
            and_(
                UserNotification.user_id == current_user.id,
                UserNotification.project_id.in_(accessible_project_ids),
                UserNotification.created_at >= datetime.utcnow() - timedelta(days=30)
            )
        ).order_by(desc(UserNotification.created_at)).limit(50)
        
        notifications_list = notifications_query.all()
        
        # Count unread notifications
        unread_count = UserNotification.query.filter(
            and_(
                UserNotification.user_id == current_user.id,
                UserNotification.is_read == False,
                UserNotification.project_id.in_(accessible_project_ids)
            )
        ).count()
        
        # Format notifications for frontend
        notifications_data = []
        for notification in notifications_list:
            notifications_data.append({
                'id': notification.id,
                'notification_type': notification.notification_type,
                'title': notification.title,
                'message': notification.message,
                'project_name': notification.project.target_language if notification.project else 'Unknown Project',
                'is_read': notification.is_read,
                'created_at': notification.created_at.isoformat(),
                'deep_link_url': notification.get_deep_link_url()
            })
        
        return jsonify({
            'notifications': notifications_data,
            'unread_count': unread_count,
            'success': True
        })
        
    except Exception as e:
        print(f"Error fetching notifications: {e}")
        return error_response('Failed to load notifications'), 500


@notifications.route('/api/notifications/mark-read', methods=['POST'])
@login_required
def mark_notifications_read():
    """Mark specific notifications as read"""
    try:
        data = request.get_json() or {}
        notification_ids = data.get('notification_ids', [])
        
        if not notification_ids:
            return error_response('No notification IDs provided')
        
        # Update notifications
        updated_count = UserNotification.query.filter(
            and_(
                UserNotification.id.in_(notification_ids),
                UserNotification.user_id == current_user.id,
                UserNotification.is_read == False
            )
        ).update({
            'is_read': True,
            'read_at': datetime.utcnow()
        }, synchronize_session=False)
        
        db.session.commit()
        
        return success_response(f'Marked {updated_count} notifications as read')
        
    except Exception as e:
        print(f"Error marking notifications as read: {e}")
        db.session.rollback()
        return error_response('Failed to mark notifications as read'), 500


@notifications.route('/api/notifications/mark-all-read', methods=['POST'])
@login_required
def mark_all_notifications_read():
    """Mark all unread notifications as read for the current user"""
    try:
        # Get user's accessible projects for filtering
        accessible_project_ids = ProjectAccess.get_accessible_projects(current_user.id)
        
        # Update all unread notifications
        updated_count = UserNotification.query.filter(
            and_(
                UserNotification.user_id == current_user.id,
                UserNotification.is_read == False,
                UserNotification.project_id.in_(accessible_project_ids)
            )
        ).update({
            'is_read': True,
            'read_at': datetime.utcnow()
        }, synchronize_session=False)
        
        db.session.commit()
        
        return success_response(f'Marked {updated_count} notifications as read')
        
    except Exception as e:
        print(f"Error marking all notifications as read: {e}")
        db.session.rollback()
        return error_response('Failed to mark all notifications as read'), 500


@notifications.route('/api/dashboard/mentions')
@login_required
def get_dashboard_mentions():
    """Get recent mentions for dashboard display"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = 10
        
        # Get user's accessible projects for filtering
        accessible_project_ids = ProjectAccess.get_accessible_projects(current_user.id)
        
        # Get mentions (flag_mention and flag_created notifications) with pagination
        mentions_query = UserNotification.query.options(
            joinedload(UserNotification.project),
            joinedload(UserNotification.flag),
            joinedload(UserNotification.comment).joinedload(FlagComment.user)
        ).filter(
            and_(
                UserNotification.user_id == current_user.id,
                UserNotification.project_id.in_(accessible_project_ids),
                UserNotification.notification_type.in_(['flag_mention', 'flag_created']),
                UserNotification.created_at >= datetime.utcnow() - timedelta(days=90)  # Last 3 months
            )
        ).order_by(desc(UserNotification.created_at))
        
        # Get total count for pagination
        total_count = mentions_query.count()
        
        # Get paginated results
        offset = (page - 1) * per_page
        mentions_list = mentions_query.offset(offset).limit(per_page).all()
        
        # Check if there are more pages
        has_more = offset + per_page < total_count
        
        # Format mentions for frontend
        mentions_data = []
        for mention in mentions_list:
            mentions_data.append({
                'id': mention.id,
                'notification_type': mention.notification_type,
                'title': mention.title,
                'message': mention.message,
                'project_name': mention.project.target_language if mention.project else 'Unknown Project',
                'is_read': mention.is_read,
                'created_at': mention.created_at.isoformat(),
                'deep_link_url': mention.get_deep_link_url()
            })
        
        return jsonify({
            'mentions': mentions_data,
            'page': page,
            'per_page': per_page,
            'total': total_count,
            'has_more': has_more,
            'success': True
        })
        
    except Exception as e:
        print(f"Error fetching dashboard mentions: {e}")
        return error_response('Failed to load mentions'), 500


def create_notification(user_id: int, project_id: int, notification_type: str, 
                       title: str, message: str, flag_id: int = None, 
                       comment_id: int = None, text_id: str = None, 
                       verse_index: int = None) -> UserNotification:
    """
    Create a new notification for a user
    
    Args:
        user_id: ID of the user to notify
        project_id: ID of the project this notification relates to
        notification_type: Type of notification ('flag_mention', 'flag_created', 'flag_comment')
        title: Short title for the notification
        message: Longer message describing the notification
        flag_id: Optional flag ID for deep linking
        comment_id: Optional comment ID for context
        text_id: Optional text ID for verse location
        verse_index: Optional verse index for deep linking
    
    Returns:
        The created UserNotification instance
    """
    try:
        notification = UserNotification(
            user_id=user_id,
            project_id=project_id,
            notification_type=notification_type,
            title=title,
            message=message,
            flag_id=flag_id,
            comment_id=comment_id,
            text_id=text_id,
            verse_index=verse_index
        )
        
        db.session.add(notification)
        db.session.commit()
        
        return notification
        
    except Exception as e:
        print(f"Error creating notification: {e}")
        db.session.rollback()
        raise


def create_mention_notifications(comment: FlagComment, mentioned_users: list):
    """Create notifications for users mentioned in a flag comment"""
    try:
        # Get the first verse association for context
        first_association = comment.flag.associations.first()
        text_id = first_association.text_id if first_association else None
        verse_index = first_association.verse_index if first_association else None
        
        # Get commenter name
        commenter_name = comment.user.name if comment.user else 'Someone'
        
        # Get project name
        project_name = comment.flag.project.target_language if comment.flag.project else 'a project'
        
        for user in mentioned_users:
            # Check if user has access to this project
            if not ProjectAccess.has_permission(comment.flag.project_id, user.id, 'viewer'):
                continue
            
            create_notification(
                user_id=user.id,
                project_id=comment.flag.project_id,
                notification_type='flag_mention',
                title=f'{commenter_name} mentioned you',
                message=f'{commenter_name} mentioned you in a comment on {project_name}: "{comment.comment_text[:100]}..."',
                flag_id=comment.flag_id,
                comment_id=comment.id,
                text_id=text_id,
                verse_index=verse_index
            )
            
    except Exception as e:
        print(f"Error creating mention notifications: {e}")


def create_flag_created_notifications(flag: VerseFlag, mentioned_users: list):
    """Create notifications for users mentioned in a new flag's initial comment"""
    try:
        # Get the first comment (initial comment)
        first_comment = flag.comments.first()
        if not first_comment:
            return
            
        # Get the first verse association for context
        first_association = flag.associations.first()
        text_id = first_association.text_id if first_association else None
        verse_index = first_association.verse_index if first_association else None
        
        # Get creator name
        creator_name = flag.creator.name if flag.creator else 'Someone'
        
        # Get project name
        project_name = flag.project.target_language if flag.project else 'a project'
        
        for user in mentioned_users:
            # Don't notify the creator themselves
            if user.id == flag.created_by:
                continue
                
            # Check if user has access to this project
            if not ProjectAccess.has_permission(flag.project_id, user.id, 'viewer'):
                continue
            
            create_notification(
                user_id=user.id,
                project_id=flag.project_id,
                notification_type='flag_created',
                title=f'{creator_name} created a flag',
                message=f'{creator_name} created a new flag on {project_name} and mentioned you: "{first_comment.comment_text[:100]}..."',
                flag_id=flag.id,
                comment_id=first_comment.id,
                text_id=text_id,
                verse_index=verse_index
            )
            
    except Exception as e:
        print(f"Error creating flag created notifications: {e}") 