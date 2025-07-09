from typing import List, Tuple
from models import db, Text, Verse
from datetime import datetime

class TextManager:
    """Unified manager for all Bible texts - source, draft, back_translation"""
    
    @staticmethod
    def create_text(project_id: int, name: str, text_type: str, description: str = None) -> int:
        """Create a new text and return its ID"""
        text = Text(
            project_id=project_id,
            name=name,
            text_type=text_type,
            description=description
        )
        db.session.add(text)
        db.session.flush()
        db.session.commit()
        return text.id
    
    @staticmethod
    def import_verses(text_id: int, content: str) -> bool:
        """Import verses from text content"""
        lines = content.split('\n')
        verses_data = []
        
        for i, line in enumerate(lines):
            if line.strip():
                verses_data.append({
                    'text_id': text_id,
                    'verse_index': i,
                    'verse_text': line.strip()
                })
        
        if verses_data:
            db.session.bulk_insert_mappings(Verse, verses_data)
            
            # Update progress
            count = len(verses_data)
            progress = (count / 31170) * 100
            text = Text.query.get(text_id)
            text.non_empty_verses = count
            text.progress_percentage = progress
            text.updated_at = datetime.utcnow()
            
            db.session.commit()
        
        return True
    
    @staticmethod
    def get_verses(text_id: int, verse_indices: List[int]) -> List[str]:
        """Get multiple verses by indices"""
        verses_dict = {}
        
        if verse_indices:
            results = Verse.query.filter(
                Verse.text_id == text_id,
                Verse.verse_index.in_(verse_indices)
            ).all()
            
            for verse in results:
                verses_dict[verse.verse_index] = verse.verse_text
        
        return [verses_dict.get(idx, '') for idx in verse_indices]
    
    @staticmethod
    def save_verse(text_id: int, verse_index: int, text: str) -> bool:
        """Save single verse"""
        existing = Verse.query.filter_by(
            text_id=text_id,
            verse_index=verse_index
        ).first()
        
        if existing:
            existing.verse_text = text.strip()
            existing.updated_at = datetime.utcnow()
        else:
            verse = Verse(
                text_id=text_id,
                verse_index=verse_index,
                verse_text=text.strip()
            )
            db.session.add(verse)
        
        # Update text progress
        count = Verse.query.filter(
            Verse.text_id == text_id,
            Verse.verse_text != ''
        ).count()
        
        progress = (count / 31170) * 100
        text = Text.query.get(text_id)
        text.non_empty_verses = count
        text.progress_percentage = progress
        text.updated_at = datetime.utcnow()
        
        db.session.commit()
        return True
    
    @staticmethod
    def get_all_verses(text_id: int) -> List[str]:
        """Get all verses for a text"""
        verses = [''] * 31170
        
        results = Verse.query.filter_by(text_id=text_id).order_by(Verse.verse_index).all()
        
        for verse in results:
            if 0 <= verse.verse_index < 31170:
                verses[verse.verse_index] = verse.verse_text
        
        return verses 