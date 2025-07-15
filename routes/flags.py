import re
from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user
from sqlalchemy import and_, or_

from models import db, Project, VerseFlag, VerseFlagAssociation, FlagComment, FlagMention, User
from utils.project_access import require_project_access
from utils import validate_and_sanitize_request, error_response, success_response

flags = Blueprint('flags', __name__)


@flags.route('/project/<int:project_id>/verse/<text_id>/<int:verse_index>/flags')
@login_required
def get_verse_flags(project_id, text_id, verse_index):
    require_project_access(project_id, "viewer")
    
    flag_ids = db.session.query(VerseFlagAssociation.flag_id).filter_by(
        text_id=text_id, verse_index=verse_index
    ).subquery()
    
    flags_query = VerseFlag.query.filter(
        and_(
            VerseFlag.project_id == project_id,
            VerseFlag.id.in_(flag_ids)
        )
    ).order_by(VerseFlag.status.asc(), VerseFlag.created_at.desc())
    
    flags_data = []
    for flag in flags_query:
        comments = FlagComment.query.filter_by(flag_id=flag.id).order_by(FlagComment.created_at.asc()).all()
        
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
                for assoc in flag.associations
            ]
        })
    
    return jsonify({'flags': flags_data})


@flags.route('/project/<int:project_id>/flags', methods=['POST'])
@login_required
def create_flag(project_id):
    require_project_access(project_id, "editor")
    
    request_data = request.get_json() or {}
    
    is_valid, data, error_msg = validate_and_sanitize_request({
        'comment_text': {'max_length': 5000, 'required': True}
    })
    
    if not is_valid:
        return error_response(error_msg)
    
    # For now, always associate with the current verse only
    text_id = request_data.get('text_id', '').strip()
    verse_index = request_data.get('verse_index')
    
    if not text_id or verse_index is None:
        return error_response('text_id and verse_index are required')
    
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
        add_mentions(comment.id, mentions, project_id)
    
    db.session.commit()
    
    return success_response('Flag created successfully', {'flag_id': flag.id})


@flags.route('/project/<int:project_id>/flags/<int:flag_id>')
@login_required
def get_flag_details(project_id, flag_id):
    require_project_access(project_id, "viewer")
    
    flag = VerseFlag.query.filter_by(id=flag_id, project_id=project_id).first_or_404()
    
    comments = FlagComment.query.filter_by(flag_id=flag_id).order_by(FlagComment.created_at.asc()).all()
    
    comments_data = []
    for comment in comments:
        mentions = [
            {
                'user_id': mention.mentioned_user.id,
                'name': mention.mentioned_user.name,
                'email': mention.mentioned_user.email
            }
            for mention in comment.mentions
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
    
    verses = [
        {'text_id': assoc.text_id, 'verse_index': assoc.verse_index}
        for assoc in flag.associations
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
        'comment_text': {'max_length': 5000, 'required': True}
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
        add_mentions(comment.id, mentions, project_id)
    
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
    
    if data['status'] == 'closed' and flag.status == 'open':
        flag.closed_at = db.func.now()
        flag.closed_by = current_user.id
    elif data['status'] == 'open' and flag.status == 'closed':
        flag.closed_at = None
        flag.closed_by = None
    
    flag.status = data['status']
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
    
    if not text_id:
        return error_response('text_id is required')
    
    if verse_index is None or not isinstance(verse_index, int):
        return error_response('verse_index must be an integer')
    
    data = {'text_id': text_id[:100], 'verse_index': verse_index}
    
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
    
    from utils.project_access import ProjectAccess
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
    pattern = r'@(\w+(?:\.\w+)*@\w+(?:\.\w+)+|\w+)'
    matches = re.findall(pattern, text)
    return [match for match in matches if match]


def add_mentions(comment_id, mentions, project_id):
    from utils.project_access import ProjectAccess
    members_data = ProjectAccess.get_project_members(project_id)
    member_lookup = {user.email: user.id for member, user in members_data}
    
    for mention in mentions:
        if '@' in mention:
            user_id = member_lookup.get(mention)
        else:
            user = User.query.filter_by(name=mention).first()
            user_id = user.id if user else None
        
        if user_id:
            existing = FlagMention.query.filter_by(
                comment_id=comment_id,
                mentioned_user_id=user_id
            ).first()
            
            if not existing:
                mention_record = FlagMention(
                    comment_id=comment_id,
                    mentioned_user_id=user_id
                )
                db.session.add(mention_record) 