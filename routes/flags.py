import re
from flask import Blueprint, request, jsonify, render_template
from flask_login import login_required, current_user
from sqlalchemy import and_, or_
from sqlalchemy.orm import joinedload

from models import db, Project, VerseFlag, VerseFlagAssociation, FlagComment, FlagMention, User, FlagResolution, ProjectMember, VerseEditHistory
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
    
    # Bulk load resolutions for all flags
    all_resolutions = FlagResolution.query.options(
        joinedload(FlagResolution.user)
    ).filter(
        FlagResolution.flag_id.in_(flag_ids_list)
    ).all()
    resolutions_by_flag = {}
    for res in all_resolutions:
        if res.flag_id not in resolutions_by_flag:
            resolutions_by_flag[res.flag_id] = []
        resolutions_by_flag[res.flag_id].append(res)
    
    flags_data = []
    for flag in flag_list:
        # Use the dynamic relationship to get comments
        comments = flag.comments.order_by(FlagComment.created_at.asc()).all()
        
        # Get associations for this flag
        flag_associations = associations_by_flag.get(flag.id, [])
        
        # Get resolutions for this flag
        flag_resolutions = resolutions_by_flag.get(flag.id, [])
        resolution_data = [
            {
                'user_id': res.user.id,
                'user_name': res.user.name,
                'user_email': res.user.email,
                'status': res.status,
                'resolved_at': res.resolved_at.isoformat() if res.resolved_at else None
            }
            for res in flag_resolutions
        ]
        
        # Check current user's resolution
        current_user_resolution = next(
            (res for res in flag_resolutions if res.user_id == current_user.id),
            None
        )
        
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
            ],
            'resolutions': resolution_data,
            'current_user_resolution': {
                'status': current_user_resolution.status,
                'resolved_at': current_user_resolution.resolved_at.isoformat() if current_user_resolution and current_user_resolution.resolved_at else None
            } if current_user_resolution else None
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
    
    # Get verse edits for all associated verses
    associations = VerseFlagAssociation.query.filter_by(flag_id=flag_id).all()
    
    timeline_items = []
    
    # Add comments to timeline
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
        
        timeline_items.append({
            'type': 'comment',
            'id': comment.id,
            'user': {
                'id': comment.user.id,
                'name': comment.user.name,
                'email': comment.user.email
            },
            'text': comment.comment_text,
            'created_at': comment.created_at,
            'edited_at': comment.edited_at,
            'mentions': mentions
        })
    
    # Get verse edits for the primary verse (first association)
    if associations:
        primary_assoc = associations[0]
        
        # Get text_id from the association's text_id field
        # Need to extract numeric ID if it's in format like "text_123"
        text_id_str = primary_assoc.text_id
        numeric_text_id = None
        
        try:
            if text_id_str.startswith('text_'):
                numeric_text_id = int(text_id_str.replace('text_', ''))
            else:
                # Try to parse as integer directly for legacy compatibility
                numeric_text_id = int(text_id_str)
        except (ValueError, AttributeError):
            # If we can't parse the text_id, skip verse edits
            numeric_text_id = None
        
        if numeric_text_id is not None:
            # Get verse edits within the flag's lifecycle
            edits = VerseEditHistory.query.options(
                joinedload(VerseEditHistory.editor)
            ).filter(
                VerseEditHistory.text_id == numeric_text_id,
                VerseEditHistory.verse_index == primary_assoc.verse_index,
                VerseEditHistory.edited_at >= flag.created_at
            ).all()
            
            # Add edits to timeline
            for edit in edits:
                timeline_items.append({
                    'type': 'verse_edit',
                    'id': edit.id,
                    'user': {
                        'id': edit.editor.id,
                        'name': edit.editor.name,
                        'email': edit.editor.email
                    },
                    'previous_text': edit.previous_text,
                    'new_text': edit.new_text,
                    'created_at': edit.edited_at,
                    'edit_type': edit.edit_type,
                    'edit_source': edit.edit_source,
                    'edit_comment': edit.edit_comment
                })
    
    # Sort timeline by created_at
    timeline_items.sort(key=lambda x: x['created_at'])
    
    # Convert datetime objects to ISO format strings
    for item in timeline_items:
        item['created_at'] = item['created_at'].isoformat()
        if item.get('edited_at'):
            item['edited_at'] = item['edited_at'].isoformat() if item['edited_at'] else None
    
    # Get associations in a separate query to avoid N+1
    verses = [
        {'text_id': assoc.text_id, 'verse_index': assoc.verse_index}
        for assoc in associations
    ]
    
    # Get resolution status for current user and all involved users
    resolutions = FlagResolution.query.options(
        joinedload(FlagResolution.user)
    ).filter_by(flag_id=flag_id).all()
    
    resolution_data = [
        {
            'user_id': res.user.id,
            'user_name': res.user.name,
            'user_email': res.user.email,
            'status': res.status,
            'resolved_at': res.resolved_at.isoformat() if res.resolved_at else None
        }
        for res in resolutions
    ]
    
    # Check if current user has a resolution
    current_user_resolution = next(
        (res for res in resolutions if res.user_id == current_user.id), 
        None
    )
    
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
        'timeline': timeline_items,
        'resolutions': resolution_data,
        'current_user_resolution': {
            'status': current_user_resolution.status,
            'resolved_at': current_user_resolution.resolved_at.isoformat() if current_user_resolution and current_user_resolution.resolved_at else None
        } if current_user_resolution else None
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


@flags.route('/project/<int:project_id>/flags/all')
@login_required
def get_project_flags(project_id):
    """Get all flags for a project with filtering and sorting options"""
    require_project_access(project_id, "viewer")
    
    # Get query parameters
    status_filter = request.args.get('status', 'all')  # all, open, closed
    sort_by = request.args.get('sort', 'newest')  # newest, oldest, most-comments
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 20, type=int), 50)  # Cap at 50
    
    # Start with base query
    flags_query = VerseFlag.query.options(
        joinedload(VerseFlag.creator),
        joinedload(VerseFlag.closer)
    ).filter(VerseFlag.project_id == project_id)
    
    # Apply status filter
    if status_filter == 'open':
        flags_query = flags_query.filter(VerseFlag.status == 'open')
    elif status_filter == 'closed':
        flags_query = flags_query.filter(VerseFlag.status == 'closed')
    
    # Apply sorting
    if sort_by == 'oldest':
        flags_query = flags_query.order_by(VerseFlag.created_at.asc())
    elif sort_by == 'most-comments':
        # Join with comments to count them
        from sqlalchemy import func
        flags_query = flags_query.outerjoin(FlagComment).group_by(VerseFlag.id).order_by(
            func.count(FlagComment.id).desc(), VerseFlag.created_at.desc()
        )
    else:  # newest (default)
        flags_query = flags_query.order_by(VerseFlag.created_at.desc())
    
    # Get paginated results
    flags_pagination = flags_query.paginate(
        page=page, per_page=per_page, error_out=False
    )
    flags_list = flags_pagination.items
    
    # Get flag IDs for bulk loading
    flag_ids = [flag.id for flag in flags_list]
    
    # Bulk load associations
    all_associations = VerseFlagAssociation.query.filter(
        VerseFlagAssociation.flag_id.in_(flag_ids)
    ).all() if flag_ids else []
    associations_by_flag = {}
    for assoc in all_associations:
        if assoc.flag_id not in associations_by_flag:
            associations_by_flag[assoc.flag_id] = []
        associations_by_flag[assoc.flag_id].append(assoc)
    
    # Bulk load comment counts
    from sqlalchemy import func
    comment_counts = dict(
        db.session.query(FlagComment.flag_id, func.count(FlagComment.id))
        .filter(FlagComment.flag_id.in_(flag_ids))
        .group_by(FlagComment.flag_id)
        .all()
    ) if flag_ids else {}
    
    # Bulk load resolutions for current user
    user_resolutions = {}
    if flag_ids:
        resolutions = FlagResolution.query.filter(
            FlagResolution.flag_id.in_(flag_ids),
            FlagResolution.user_id == current_user.id
        ).all()
        user_resolutions = {res.flag_id: res for res in resolutions}
    
    # Format flags data
    flags_data = []
    for flag in flags_list:
        # Get first comment for preview
        first_comment = flag.comments.order_by(FlagComment.created_at.asc()).first()
        
        # Get verse associations
        flag_associations = associations_by_flag.get(flag.id, [])
        
        # Get user's resolution status
        user_resolution = user_resolutions.get(flag.id)
        
        # Get verse reference string for display
        verse_refs = []
        for assoc in flag_associations:
            try:
                # Try to get a readable verse reference
                from utils.translation_manager import VerseReferenceManager
                verse_ref_manager = VerseReferenceManager()
                verse_ref = verse_ref_manager.get_verse_reference(assoc.verse_index)
                if verse_ref:
                    verse_refs.append(verse_ref)
                else:
                    verse_refs.append(f"Verse {assoc.verse_index + 1}")
            except:
                verse_refs.append(f"Verse {assoc.verse_index + 1}")
        
        flag_data = {
            'id': flag.id,
            'status': flag.status,
            'created_by': {
                'id': flag.creator.id,
                'name': flag.creator.name,
                'email': flag.creator.email
            },
            'created_at': flag.created_at.isoformat(),
            'closed_at': flag.closed_at.isoformat() if flag.closed_at else None,
            'closed_by': {
                'id': flag.closer.id,
                'name': flag.closer.name,
                'email': flag.closer.email
            } if flag.closer else None,
            'comment_count': comment_counts.get(flag.id, 0),
            'first_comment': first_comment.comment_text[:150] + '...' if first_comment and len(first_comment.comment_text) > 150 else (first_comment.comment_text if first_comment else ''),
            'verse_references': verse_refs,
            'verses': [
                {'text_id': assoc.text_id, 'verse_index': assoc.verse_index}
                for assoc in flag_associations
            ],
            'user_resolution': {
                'status': user_resolution.status,
                'resolved_at': user_resolution.resolved_at.isoformat() if user_resolution and user_resolution.resolved_at else None
            } if user_resolution else None
        }
        flags_data.append(flag_data)
    
    return jsonify({
        'flags': flags_data,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': flags_pagination.total,
            'pages': flags_pagination.pages,
            'has_next': flags_pagination.has_next,
            'has_prev': flags_pagination.has_prev
        }
    })


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


@flags.route('/project/<int:project_id>/flags/<int:flag_id>/resolve', methods=['POST'])
@login_required
def update_flag_resolution(project_id, flag_id):
    """Update user's resolution status for a flag"""
    require_project_access(project_id, "viewer")
    
    flag = VerseFlag.query.filter_by(id=flag_id, project_id=project_id).first_or_404()
    
    is_valid, data, error_msg = validate_and_sanitize_request({
        'status': {'choices': ['resolved', 'unresolved', 'not_relevant'], 'required': True}
    })
    
    if not is_valid:
        return error_response(error_msg)
    
    # Find or create resolution record for current user
    resolution = FlagResolution.query.filter_by(
        flag_id=flag_id,
        user_id=current_user.id
    ).first()
    
    if not resolution:
        resolution = FlagResolution(
            flag_id=flag_id,
            user_id=current_user.id
        )
        db.session.add(resolution)
    
    # Update status
    resolution.status = data['status']
    resolution.resolved_at = db.func.now() if data['status'] == 'resolved' else None
    
    # Check if flag should be auto-closed
    # Flag auto-closes when all mentioned users OR the project owner mark it as resolved
    if data['status'] == 'resolved':
        # Get all mentioned users in this flag
        mentioned_user_ids = set()
        comments = flag.comments.all()
        for comment in comments:
            mentions = comment.mentions.all()
            for mention in mentions:
                mentioned_user_ids.add(mention.mentioned_user_id)
        
        # Add flag creator and project owner
        mentioned_user_ids.add(flag.created_by)
        project = Project.query.get(project_id)
        
        # Get owner from ProjectMember table
        owner_member = ProjectMember.query.filter_by(
            project_id=project_id,
            role='owner'
        ).first()
        if owner_member:
            mentioned_user_ids.add(owner_member.user_id)
        
        # Check if all relevant users have resolved
        all_resolved = True
        for user_id in mentioned_user_ids:
            user_resolution = FlagResolution.query.filter_by(
                flag_id=flag_id,
                user_id=user_id
            ).first()
            if not user_resolution or user_resolution.status != 'resolved':
                all_resolved = False
                break
        
        # Auto-close flag if all resolved
        if all_resolved and flag.status == 'open':
            flag.status = 'closed'
            flag.closed_at = db.func.now()
            flag.closed_by = current_user.id
    
    db.session.commit()
    
    # Return updated resolution data
    resolutions = FlagResolution.query.options(
        joinedload(FlagResolution.user)
    ).filter_by(flag_id=flag_id).all()
    
    resolution_data = [
        {
            'user_id': res.user.id,
            'user_name': res.user.name,
            'user_email': res.user.email,
            'status': res.status,
            'resolved_at': res.resolved_at.isoformat() if res.resolved_at else None
        }
        for res in resolutions
    ]
    
    return success_response('Resolution updated', {
        'resolutions': resolution_data,
        'flag_status': flag.status
    })


 