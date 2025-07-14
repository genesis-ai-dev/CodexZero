from typing import List, Tuple, Optional
from models import db, Text, Verse
from datetime import datetime


class TextManager:
    """Unified text manager - replaces TranslationFileManager, TranslationDatabaseManager, and dual storage complexity"""
    
    def __init__(self, text_id: int):
        self.text_id = text_id
        self.text = Text.query.get(text_id)
        if not self.text:
            raise ValueError(f"Text with ID {text_id} not found")
    
    def get_verse(self, verse_index: int) -> str:
        """Get single verse text by index"""
        if verse_index < 0 or verse_index >= 41899:
            return ''
        
        verse = Verse.query.filter_by(
            text_id=self.text_id,
            verse_index=verse_index
        ).first()
        
        return verse.verse_text if verse else ''
    
    def get_verses(self, verse_indices: List[int]) -> List[str]:
        """Get multiple verses by their indices - optimized for performance"""
        if not verse_indices:
            return []
        
        # Filter valid indices
        valid_indices = [idx for idx in verse_indices if 0 <= idx < 41899]
        if not valid_indices:
            return [''] * len(verse_indices)
        
        # Single query to get all verses
        verses = Verse.query.filter(
            Verse.text_id == self.text_id,
            Verse.verse_index.in_(valid_indices)
        ).all()
        
        # Create lookup dict for fast access
        verse_dict = {v.verse_index: v.verse_text for v in verses}
        
        # Return in requested order with empty strings for missing verses
        return [verse_dict.get(idx, '') for idx in verse_indices]
    
    def save_verse(self, verse_index: int, text: str) -> bool:
        """Save single verse at specific index"""
        if verse_index < 0 or verse_index >= 41899:
            return False
        
        try:
            verse = Verse.query.filter_by(
                text_id=self.text_id,
                verse_index=verse_index
            ).first()
            
            if verse:
                verse.verse_text = text.strip()
            else:
                verse = Verse(
                    text_id=self.text_id,
                    verse_index=verse_index,
                    verse_text=text.strip() or ' '  # MySQL doesn't allow empty TEXT
                )
                db.session.add(verse)
            
            db.session.commit()
            
            # Update progress tracking
            self._update_progress()
            
            return True
        except Exception as e:
            db.session.rollback()
            print(f"Error saving verse: {e}")
            return False
    
    def save_verses(self, verse_data: List[Tuple[int, str]]) -> bool:
        """Bulk save multiple verses for performance"""
        try:
            # Prepare bulk operations
            verse_updates = []
            verse_inserts = []
            
            # Get existing verses
            indices = [idx for idx, _ in verse_data if 0 <= idx < 41899]
            existing_verses = {
                v.verse_index: v for v in 
                Verse.query.filter(
                    Verse.text_id == self.text_id,
                    Verse.verse_index.in_(indices)
                ).all()
            }
            
            # Categorize updates vs inserts
            for verse_index, text in verse_data:
                if verse_index < 0 or verse_index >= 41899:
                    continue
                
                if verse_index in existing_verses:
                    existing_verses[verse_index].verse_text = text.strip() or ' '
                else:
                    verse_inserts.append({
                        'text_id': self.text_id,
                        'verse_index': verse_index,
                        'verse_text': text.strip() or ' '  # MySQL doesn't allow empty TEXT
                    })
            
            # Bulk insert new verses
            if verse_inserts:
                db.session.bulk_insert_mappings(Verse, verse_inserts)
            
            db.session.commit()
            self._update_progress()
            
            return True
        except Exception as e:
            db.session.rollback()
            print(f"Error saving verses: {e}")
            return False
    
    def get_non_empty_verses(self) -> List[Tuple[int, str]]:
        """Get all non-empty verses for context queries"""
        verses = Verse.query.filter(
            Verse.text_id == self.text_id,
            Verse.verse_text != ' ',  # Filter out placeholder spaces
            Verse.verse_text != ''
        ).all()
        
        return [(v.verse_index, v.verse_text) for v in verses]
    
    def _update_progress(self):
        """Update progress tracking for the text"""
        try:
            count = Verse.query.filter(
                Verse.text_id == self.text_id,
                Verse.verse_text != ' ',  # Filter out placeholder spaces
                Verse.verse_text != ''
            ).count()
            
            self.text.non_empty_verses = count
            self.text.progress_percentage = (count / 31170) * 100
            db.session.commit()
        except Exception as e:
            print(f"Error updating progress: {e}")
    
    @staticmethod
    def create_text(project_id: int, name: str, description: str = None) -> int:
        """Create a new text and return its ID"""
        text = Text(
            project_id=project_id,
            name=name,
            description=description
        )
        db.session.add(text)
        db.session.flush()  # Get ID
        db.session.commit()
        return text.id
    
    @staticmethod
    def import_verses(text_id: int, content: str) -> bool:
        """Import verses from content string (eBible format)"""
        try:
            lines = content.split('\n')
            verse_data = []
            
            for i, line in enumerate(lines):
                if line.strip():  # Only store non-empty lines
                    verse_data.append((i, line.strip() or ' '))
            
            if verse_data:
                manager = TextManager(text_id)
                return manager.save_verses(verse_data)
            
            return True
        except Exception as e:
            print(f"Error importing verses: {e}")
            return False


def get_text_manager(text_id: int) -> TextManager:
    """Factory function to get TextManager instance"""
    return TextManager(text_id) 