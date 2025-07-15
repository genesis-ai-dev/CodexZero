import re
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import and_, or_
from sqlalchemy.orm import joinedload

from models import db, Project, VerseFlag, VerseFlagAssociation, FlagComment, FlagMention, User
from utils.project_access import require_project_access, ProjectAccess
from utils import validate_and_sanitize_request, error_response, success_response
from routes.notifications import create_mention_notifications, create_flag_created_notifications

# Constants
MAX_COMMENT_LENGTH = 5000
MAX_TEXT_ID_LENGTH = 100
MAX_VERSE_INDEX = 41898

flags = Blueprint('flags', __name__)


@flags.route('/project/<int:project_id>/verse/<text_id>/<int:verse_index>/flags')
@login_required
def get_verse_flags(project_id, text_id, verse_index):
    require_project_access(project_id, "viewer")
    
    flag_ids = db.session.query(VerseFlagAssociation.flag_id).filter_by(
        text_id=text_id, verse_index=verse_index
    ).subquery()
    
    flags_query = VerseFlag.query.options(
        joinedload(VerseFlag.creator)
    ).filter(
        and_(
            VerseFlag.project_id == project_id,
            VerseFlag.id.in_(flag_ids)
        )
    ).order_by(VerseFlag.status.asc(), VerseFlag.created_at.desc())
    
    # Get all flag IDs for bulk queries
    flag_list = flags_query.all()
    flag_ids_list = [flag.id for flag in flag_list]
    
    # Bulk load associations for all flags
    all_associations = VerseFlagAssociation.query.filter(
        VerseFlagAssociation.flag_id.in_(flag_ids_list)
    ).all()
    associations_by_flag = {}
    for assoc in all_associations:
        if assoc.flag_id not in associations_by_flag:
            associations_by_flag[assoc.flag_id] = []
        associations_by_flag[assoc.flag_id].append(assoc)
    
    flags_data = []
    for flag in flag_list:
        # Use the dynamic relationship to get comments
        comments = flag.comments.order_by(FlagComment.created_at.asc()).all()
        
        # Get associations for this flag
        flag_associations = associations_by_flag.get(flag.id, [])
        
        flags_data.append({
            'id': flag.id,
            'status': flag.status,
            'created_by': {
                'id': flag.creator.id,
                'name': flag.creator.name,
                'email': flag.creator.email
            },
            'created_at': flag.created_at.isoformat(),
            'closed_at': flag.closed_at.isoformat() if flag.closed_at else None,
            'comment_count': len(comments),
            'first_comment': comments[0].comment_text[:100] + '...' if comments else '',
            'verses': [
                {'text_id': assoc.text_id, 'verse_index': assoc.verse_index}
                for assoc in flag_associations
            ]
        })
    
    return jsonify({'flags': flags_data})


@flags.route('/project/<int:project_id>/flags', methods=['POST'])
@login_required
def create_flag(project_id):
    require_project_access(project_id, "editor")
    
    request_data = request.get_json() or {}
    
    is_valid, data, error_msg = validate_and_sanitize_request({
        'comment_text': {'max_length': MAX_COMMENT_LENGTH, 'required': True}
    })
    
    if not is_valid:
        return error_response(error_msg)
    
    # For now, always associate with the current verse only
    text_id = request_data.get('text_id', '').strip()
    verse_index = request_data.get('verse_index')
    
    # Validate text_id
    if not text_id or len(text_id) > MAX_TEXT_ID_LENGTH:
        return error_response(f'text_id is required and must be under {MAX_TEXT_ID_LENGTH} characters')
    
    # Validate verse_index
    if verse_index is None or not isinstance(verse_index, int) or verse_index < 0 or verse_index > MAX_VERSE_INDEX:
        return error_response(f'verse_index must be a valid integer between 0 and {MAX_VERSE_INDEX}')
    
    flag = VerseFlag(
        project_id=project_id,
        created_by=current_user.id
    )
    db.session.add(flag)
    db.session.flush()
    
    # Associate with current verse
    association = VerseFlagAssociation(
        flag_id=flag.id,
        text_id=text_id,
        verse_index=verse_index
    )
    db.session.add(association)
    
    # Create initial comment
    comment = FlagComment(
        flag_id=flag.id,
        user_id=current_user.id,
        comment_text=data['comment_text']
    )
    db.session.add(comment)
    db.session.flush()
    
    mentions = extract_mentions(data['comment_text'])
    if mentions:
        mentioned_users = add_mentions(comment.id, mentions, project_id)
        
        # Create notifications for mentioned users (flush first to ensure mention records exist)
        db.session.flush()
        create_mention_notifications(comment, mentioned_users)
    
    db.session.commit()
    
    return success_response('Flag created successfully', {'flag_id': flag.id})


@flags.route('/project/<int:project_id>/flags/<int:flag_id>')
@login_required
def get_flag_details(project_id, flag_id):
    require_project_access(project_id, "viewer")
    
    flag = VerseFlag.query.options(
        joinedload(VerseFlag.creator)
    ).filter_by(id=flag_id, project_id=project_id).first_or_404()
    
    # Get comments with their relationships in a separate query to avoid the dynamic relationship issue
    comments = FlagComment.query.options(
        joinedload(FlagComment.user)
    ).filter_by(flag_id=flag_id).order_by(FlagComment.created_at.asc()).all()
    
    # Bulk load all mentions for these comments to avoid N+1 queries
    comment_ids = [comment.id for comment in comments]
    all_mentions = FlagMention.query.options(
        joinedload(FlagMention.mentioned_user)
    ).filter(FlagMention.comment_id.in_(comment_ids)).all() if comment_ids else []
    
    # Group mentions by comment_id for easy lookup
    mentions_by_comment = {}
    for mention in all_mentions:
        if mention.comment_id not in mentions_by_comment:
            mentions_by_comment[mention.comment_id] = []
        mentions_by_comment[mention.comment_id].append(mention)
    
    comments_data = []
    for comment in comments:
        comment_mentions = mentions_by_comment.get(comment.id, [])
        mentions = [
            {
                'user_id': mention.mentioned_user.id,
                'name': mention.mentioned_user.name,
                'email': mention.mentioned_user.email
            }
            for mention in comment_mentions
        ]
        
        comments_data.append({
            'id': comment.id,
            'user': {
                'id': comment.user.id,
                'name': comment.user.name,
                'email': comment.user.email
            },
            'text': comment.comment_text,
            'created_at': comment.created_at.isoformat(),
            'edited_at': comment.edited_at.isoformat() if comment.edited_at else None,
            'mentions': mentions
        })
    
    # Get associations in a separate query to avoid N+1
    associations = VerseFlagAssociation.query.filter_by(flag_id=flag_id).all()
    verses = [
        {'text_id': assoc.text_id, 'verse_index': assoc.verse_index}
        for assoc in associations
    ]
    
    return jsonify({
        'id': flag.id,
        'status': flag.status,
        'created_by': {
            'id': flag.creator.id,
            'name': flag.creator.name,
            'email': flag.creator.email
        },
        'created_at': flag.created_at.isoformat(),
        'closed_at': flag.closed_at.isoformat() if flag.closed_at else None,
        'verses': verses,
        'comments': comments_data
    })


@flags.route('/project/<int:project_id>/flags/<int:flag_id>/comments', methods=['POST'])
@login_required
def add_comment(project_id, flag_id):
    require_project_access(project_id, "editor")
    
    flag = VerseFlag.query.filter_by(id=flag_id, project_id=project_id).first_or_404()
    
    is_valid, data, error_msg = validate_and_sanitize_request({
        'comment_text': {'max_length': MAX_COMMENT_LENGTH, 'required': True}
    })
    
    if not is_valid:
        return error_response(error_msg)
    
    comment = FlagComment(
        flag_id=flag_id,
        user_id=current_user.id,
        comment_text=data['comment_text']
    )
    db.session.add(comment)
    db.session.flush()
    
    mentions = extract_mentions(data['comment_text'])
    if mentions:
        mentioned_users = add_mentions(comment.id, mentions, project_id)
        
        # Create notifications for mentioned users (flush first to ensure mention records exist)
        db.session.flush()
        create_mention_notifications(comment, mentioned_users)
    
    db.session.commit()
    
    return success_response('Comment added successfully', {'comment_id': comment.id})


@flags.route('/project/<int:project_id>/flags/<int:flag_id>/status', methods=['POST'])
@login_required
def update_flag_status(project_id, flag_id):
    require_project_access(project_id, "editor")
    
    flag = VerseFlag.query.filter_by(id=flag_id, project_id=project_id).first_or_404()
    
    is_valid, data, error_msg = validate_and_sanitize_request({
        'status': {'choices': ['open', 'closed'], 'required': True}
    })
    
    if not is_valid:
        return error_response(error_msg)
    
    flag.status = data['status']
    
    if data['status'] == 'closed':
        flag.closed_at = db.func.now()
        flag.closed_by = current_user.id
    else:
        flag.closed_at = None
        flag.closed_by = None
    db.session.commit()
    
    return success_response(f'Flag {data["status"]} successfully')


@flags.route('/project/<int:project_id>/flags/<int:flag_id>/verses', methods=['POST'])
@login_required
def add_verse_to_flag(project_id, flag_id):
    require_project_access(project_id, "editor")
    
    flag = VerseFlag.query.filter_by(id=flag_id, project_id=project_id).first_or_404()
    
    request_data = request.get_json() or {}
    
    text_id = request_data.get('text_id', '').strip()
    verse_index = request_data.get('verse_index')
    
    # Validate text_id
    if not text_id or len(text_id) > MAX_TEXT_ID_LENGTH:
        return error_response(f'text_id is required and must be under {MAX_TEXT_ID_LENGTH} characters')
    
    # Validate verse_index
    if verse_index is None or not isinstance(verse_index, int) or verse_index < 0 or verse_index > MAX_VERSE_INDEX:
        return error_response(f'verse_index must be a valid integer between 0 and {MAX_VERSE_INDEX}')
    
    data = {'text_id': text_id[:MAX_TEXT_ID_LENGTH], 'verse_index': verse_index}
    
    existing = VerseFlagAssociation.query.filter_by(
        flag_id=flag_id,
        text_id=data['text_id'],
        verse_index=data['verse_index']
    ).first()
    
    if existing:
        return error_response('Verse is already associated with this flag')
    
    association = VerseFlagAssociation(
        flag_id=flag_id,
        text_id=data['text_id'],
        verse_index=data['verse_index']
    )
    db.session.add(association)
    db.session.commit()
    
    return success_response('Verse added to flag successfully')


@flags.route('/project/<int:project_id>/flags/<int:flag_id>/verses/<text_id>/<int:verse_index>', methods=['DELETE'])
@login_required
def remove_verse_from_flag(project_id, flag_id, text_id, verse_index):
    require_project_access(project_id, "editor")
    
    flag = VerseFlag.query.filter_by(id=flag_id, project_id=project_id).first_or_404()
    
    association = VerseFlagAssociation.query.filter_by(
        flag_id=flag_id,
        text_id=text_id,
        verse_index=verse_index
    ).first_or_404()
    
    remaining_count = VerseFlagAssociation.query.filter_by(flag_id=flag_id).count()
    if remaining_count <= 1:
        return error_response('Cannot remove the last verse from a flag')
    
    db.session.delete(association)
    db.session.commit()
    
    return success_response('Verse removed from flag successfully')


@flags.route('/project/<int:project_id>/flags/members')
@login_required
def get_project_members_for_mentions(project_id):
    require_project_access(project_id, "viewer")
    
    members_data = ProjectAccess.get_project_members(project_id)
    
    members = [
        {
            'id': user.id,
            'name': user.name,
            'email': user.email
        }
        for member, user in members_data
    ]
    
    return jsonify({'members': members})


def extract_mentions(text):
    # Only match @email addresses
    pattern = r'@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})'
    matches = re.findall(pattern, text)
    return [match for match in matches if match]


def add_mentions(comment_id, mentions, project_id):
    # Get the comment to check who made it
    comment = FlagComment.query.get(comment_id)
    if not comment:
        return []
    
    members_data = ProjectAccess.get_project_members(project_id)
    # Create lookup by email for all project members
    member_email_lookup = {user.email: user for member, user in members_data}
    
    mentioned_users = []
    
    for email in mentions:
        if email in member_email_lookup:
            user = member_email_lookup[email]
            
            existing = FlagMention.query.filter_by(
                comment_id=comment_id,
                mentioned_user_id=user.id
            ).first()
            
            if not existing:
                mention_record = FlagMention(
                    comment_id=comment_id,
                    mentioned_user_id=user.id
                )
                db.session.add(mention_record)
                mentioned_users.append(user)
    
    return mentioned_users 