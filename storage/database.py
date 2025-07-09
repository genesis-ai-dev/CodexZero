from typing import List, Tuple
from sqlalchemy import text
from models import db, TranslationVerse

class DatabaseStorage:
    """Database storage for translations"""
    
    def store_verse(self, translation_id: int, verse_index: int, verse_text: str) -> bool:
        """Store or update a single verse in the database"""
        try:
            existing = TranslationVerse.query.filter_by(
                translation_id=translation_id,
                verse_index=verse_index
            ).first()
            
            if existing:
                existing.verse_text = verse_text.strip()
            else:
                verse = TranslationVerse(
                    translation_id=translation_id,
                    verse_index=verse_index,
                    verse_text=verse_text.strip()
                )
                db.session.add(verse)
            
            db.session.commit()
            return True
        except Exception as e:
            db.session.rollback()
            print(f"Error storing verse: {e}")
            return False
    
    def get_verses(self, translation_id: int, verse_indices: List[int]) -> List[str]:
        """Get multiple verses by their indices"""
        verses_dict = {}
        
        if verse_indices:
            results = TranslationVerse.query.filter(
                TranslationVerse.translation_id == translation_id,
                TranslationVerse.verse_index.in_(verse_indices)
            ).all()
            
            for verse in results:
                verses_dict[verse.verse_index] = verse.verse_text
        
        # Return in the requested order, with empty strings for missing verses
        return [verses_dict.get(idx, '') for idx in verse_indices]
    
    def get_all_verses(self, translation_id: int) -> List[str]:
        """Get all verses for a translation in order"""
        verses = [''] * 31170  # Initialize with empty verses
        
        results = TranslationVerse.query.filter_by(
            translation_id=translation_id
        ).order_by(TranslationVerse.verse_index).all()
        
        for verse in results:
            if 0 <= verse.verse_index < 31170:
                verses[verse.verse_index] = verse.verse_text
        
        return verses
    
    def calculate_progress(self, translation_id: int) -> Tuple[int, float]:
        """Calculate translation progress directly from database"""
        count = db.session.query(TranslationVerse).filter(
            TranslationVerse.translation_id == translation_id,
            TranslationVerse.verse_text != ''
        ).count()
        
        percentage = (count / 31170) * 100 if count > 0 else 0.0
        return count, percentage
    
    def batch_store_verses(self, translation_id: int, verses: List[Tuple[int, str]]) -> bool:
        """Batch store multiple verses for efficiency"""
        try:
            # Delete existing verses for this translation
            TranslationVerse.query.filter_by(translation_id=translation_id).delete()
            
            # Insert new verses using bulk_insert_mappings for better performance
            verse_objects = []
            for verse_index, verse_text in verses:
                if verse_text.strip():  # Only store non-empty verses
                    verse_objects.append({
                        'translation_id': translation_id,
                        'verse_index': verse_index,
                        'verse_text': verse_text.strip()
                    })
            
            if verse_objects:
                db.session.bulk_insert_mappings(TranslationVerse, verse_objects)
            
            db.session.commit()
            return True
        except Exception as e:
            db.session.rollback()
            print(f"Error in batch store: {e}")
            return False 