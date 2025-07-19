from typing import List, Optional
from datetime import datetime
from models import db, Verse, VerseEditHistory, User


class VerseEditHistoryService:
    """Simplified service for managing verse edit history"""
    
    @staticmethod
    def record_edit(
        text_id: int, 
        verse_index: int, 
        previous_text: str, 
        new_text: str, 
        user_id: int,
        edit_type: str = 'update',
        edit_source: str = 'manual',
        comment: str = None
    ) -> VerseEditHistory:
        """Record a verse edit in history - simplified version"""
        
        # Normalize text consistently with save routes - join split to clean whitespace
        previous_text = ' '.join(previous_text.split()) if previous_text else ''
        new_text = ' '.join(new_text.split()) if new_text else ''
        
        # Skip recording if no actual change (more robust comparison)
        if previous_text == new_text and edit_type == 'update':
            return None
        
        # Create history record
        edit_record = VerseEditHistory(
            text_id=text_id,
            verse_index=verse_index,
            previous_text=previous_text or None,  # Store NULL for empty
            new_text=new_text,
            edited_by=user_id,
            edit_type='create' if not previous_text else edit_type,
            edit_source=edit_source,
            edit_comment=comment
        )
        
        db.session.add(edit_record)
        # Note: Don't commit here - let caller handle transaction
        
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
            'previous_text': edit.previous_text or '',
            'new_text': edit.new_text,
            'edited_by': edit.editor.name,
            'edited_by_email': edit.editor.email,
            'edited_at': edit.edited_at.isoformat(),
            'edit_type': edit.edit_type,
            'edit_source': edit.edit_source,
            'comment': edit.edit_comment
        } for edit in history]
    
    @staticmethod
    def get_recent_activity(text_id: int, limit: int = 50) -> List[dict]:
        """Get recent edit activity for a text"""
        from utils.translation_manager import VerseReferenceManager
        verse_ref_manager = VerseReferenceManager()
        
        activity = VerseEditHistory.query.filter_by(text_id=text_id)\
            .join(User, VerseEditHistory.edited_by == User.id)\
            .order_by(VerseEditHistory.edited_at.desc())\
            .limit(limit).all()
        
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
        """Simplified revert - just restore content and record single history entry"""
        
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
        
        # Store current text before reverting
        current_text = current_verse.verse_text
        
        # Update verse to target content
        current_verse.verse_text = target_edit.new_text
        
        # Record single revert entry
        revert_record = VerseEditHistoryService.record_edit(
            text_id=text_id,
            verse_index=verse_index,
            previous_text=current_text,
            new_text=target_edit.new_text,
            user_id=user_id,
            edit_type='revert',
            comment=f'Reverted to version from {target_edit.edited_at.strftime("%Y-%m-%d %H:%M")}'
        )
        
        # Single transaction commit
        try:
            db.session.commit()
            return True
        except Exception as e:
            db.session.rollback()
            print(f"Error reverting verse: {e}")
            return False 