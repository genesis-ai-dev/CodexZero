import json
import re
from typing import List, Dict, Set

from models import db, ProjectDictionary


class LanguageServerService:
    """Lightweight language server for Bible translation"""
    
    def __init__(self, project_id: int):
        self.project_id = project_id
        self.approved_words = None  # Lazy load
    
    def _ensure_dictionary(self):
        """Load dictionary on first use"""
        if self.approved_words is None:
            entries = ProjectDictionary.query.filter_by(
                project_id=self.project_id, 
                approved=True
            ).all()
            self.approved_words = {entry.word.lower() for entry in entries}
    
    def analyze_verse(self, verse_text: str) -> Dict:
        """Analyze verse text and return suggestions"""
        if not verse_text or not verse_text.strip():
            return {"suggestions": []}
        
        self._ensure_dictionary()
        
        suggestions = []
        
        # Find unknown words (3+ letters, not numbers)
        for match in re.finditer(r'\b[a-zA-Z]{3,}\b', verse_text):
            word = match.group()
            if word.lower() not in self.approved_words:
                suggestions.append({
                    "substring": word,
                    "start": match.start(),
                    "end": match.end(),
                    "color": "#ff6b6b",  # Red for dictionary suggestions
                    "message": f"'{word}' not in dictionary",
                    "actions": ["add_to_dictionary"]
                })
        
        return {"suggestions": suggestions}

    def add_word_to_dictionary(self, word: str, user_id: int):
        """Add word to project dictionary"""
        # Check if already exists
        existing = ProjectDictionary.query.filter_by(
            project_id=self.project_id,
            word=word
        ).first()
        
        if not existing:
            entry = ProjectDictionary(
                project_id=self.project_id,
                word=word,
                added_by=user_id
            )
            db.session.add(entry)
            db.session.commit()
            
            # Update cache if loaded
            if self.approved_words is not None:
                self.approved_words.add(word.lower())


 