from typing import List, Optional
from datetime import datetime
from models import db, Verse, VerseEditHistory, User


class VerseEditHistoryService:
    """Clean service for managing verse edit history"""
    
    @staticmethod
    def record_edit(
        text_id: int, 
        verse_index: int, 
        previous_text: str, 
        new_text: str, 
        user_id: int,
        edit_type: str = 'update',
        edit_source: str = 'manual',
        comment: str = None,
        confidence_score: float = None
    ) -> VerseEditHistory:
        """Record a verse edit in history"""
        
        # Create history record
        edit_record = VerseEditHistory(
            text_id=text_id,
            verse_index=verse_index,
            previous_text=previous_text,
            new_text=new_text,
            edited_by=user_id,
            edit_type=edit_type,
            edit_source=edit_source,
            edit_comment=comment,
            confidence_score=confidence_score
        )
        
        db.session.add(edit_record)
        
        # Update verse tracking
        verse = Verse.query.filter_by(
            text_id=text_id, 
            verse_index=verse_index
        ).first()
        
        if verse:
            verse.last_edited_by = user_id
            verse.last_edited_at = datetime.utcnow()
            verse.edit_count = (verse.edit_count or 0) + 1
        
        db.session.commit()
        return edit_record
    
    @staticmethod
    def get_verse_history(text_id: int, verse_index: int, limit: int = 50) -> List[dict]:
        """Get edit history for a specific verse with user details"""
        history = VerseEditHistory.query.filter_by(
            text_id=text_id,
            verse_index=verse_index
        ).join(User, VerseEditHistory.edited_by == User.id)\
         .order_by(VerseEditHistory.edited_at.desc())\
         .limit(limit).all()
        
        return [{
            'id': edit.id,
            'previous_text': edit.previous_text,
            'new_text': edit.new_text,
            'edited_by': edit.editor.name,
            'edited_by_email': edit.editor.email,
            'edited_at': edit.edited_at.isoformat(),
            'edit_type': edit.edit_type,
            'edit_source': edit.edit_source,
            'comment': edit.edit_comment,
            'confidence_score': float(edit.confidence_score) if edit.confidence_score else None
        } for edit in history]
    
    @staticmethod
    def get_recent_activity(text_id: int, limit: int = 50) -> List[dict]:
        """Get recent edit activity for a text"""
        from utils.translation_manager import VerseReferenceManager
        
        activity = VerseEditHistory.query.filter_by(text_id=text_id)\
                                        .join(User, VerseEditHistory.edited_by == User.id)\
                                        .order_by(VerseEditHistory.edited_at.desc())\
                                        .limit(limit).all()
        
        verse_ref_manager = VerseReferenceManager()
        
        return [{
            'id': edit.id,
            'verse_index': edit.verse_index,
            'verse_reference': verse_ref_manager.get_verse_reference(edit.verse_index),
            'edited_by': edit.editor.name,
            'edited_at': edit.edited_at.isoformat(),
            'edit_type': edit.edit_type,
            'edit_source': edit.edit_source,
            'comment': edit.edit_comment,
            'new_text': edit.new_text[:100] + '...' if len(edit.new_text) > 100 else edit.new_text
        } for edit in activity]
    
    @staticmethod
    def revert_verse(text_id: int, verse_index: int, target_edit_id: int, user_id: int) -> bool:
        """Revert a verse to a previous version"""
        
        # Get the target edit
        target_edit = VerseEditHistory.query.get(target_edit_id)
        if not target_edit or target_edit.text_id != text_id or target_edit.verse_index != verse_index:
            return False
        
        # Get current verse
        current_verse = Verse.query.filter_by(
            text_id=text_id,
            verse_index=verse_index
        ).first()
        
        if not current_verse:
            return False
        
        # Record the revert action
        VerseEditHistoryService.record_edit(
            text_id=text_id,
            verse_index=verse_index,
            previous_text=current_verse.verse_text,
            new_text=target_edit.new_text,
            user_id=user_id,
            edit_type='revert',
            comment=f'Reverted to version from {target_edit.edited_at.strftime("%Y-%m-%d %H:%M")}'
        )
        
        # Update the verse
        current_verse.verse_text = target_edit.new_text
        db.session.commit()
        
        return True
    
    @staticmethod
    def get_user_recent_edits(user_id: int, limit: int = 100) -> List[dict]:
        """Get recent edits by a user across all projects they have access to"""
        from utils.project_access import ProjectAccess
        
        # Get accessible project IDs
        accessible_projects = ProjectAccess.get_accessible_projects(user_id)
        if not accessible_projects:
            return []
        
        # Get recent edits from accessible projects
        from models import Text
        accessible_texts = Text.query.filter(Text.project_id.in_(accessible_projects)).all()
        text_ids = [text.id for text in accessible_texts]
        
        edits = VerseEditHistory.query.filter(
            VerseEditHistory.edited_by == user_id,
            VerseEditHistory.text_id.in_(text_ids)
        ).join(User, VerseEditHistory.edited_by == User.id)\
         .order_by(VerseEditHistory.edited_at.desc())\
         .limit(limit).all()
        
        from utils.translation_manager import VerseReferenceManager
        verse_ref_manager = VerseReferenceManager()
        
        return [{
            'id': edit.id,
            'text_name': edit.text.name,
            'verse_index': edit.verse_index,
            'verse_reference': verse_ref_manager.get_verse_reference(edit.verse_index),
            'edited_at': edit.edited_at.isoformat(),
            'edit_type': edit.edit_type,
            'edit_source': edit.edit_source,
            'new_text': edit.new_text[:100] + '...' if len(edit.new_text) > 100 else edit.new_text
        } for edit in edits] 