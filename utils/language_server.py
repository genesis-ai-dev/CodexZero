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

    def add_word_to_dictionary(self, word: str, user_id: int) -> bool:
        """Add word to project dictionary, returns True if word was actually added"""
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
            
            return True
        
        return False  # Word already existed

    def add_words_to_dictionary_bulk(self, words: List[str], user_id: int) -> int:
        """Add multiple words to project dictionary efficiently"""
        if not words:
            return 0
        
        # Get existing words to avoid duplicates
        existing_words = set()
        if words:
            existing_entries = ProjectDictionary.query.filter(
                ProjectDictionary.project_id == self.project_id,
                ProjectDictionary.word.in_(words)
            ).all()
            existing_words = {entry.word for entry in existing_entries}
        
        # Create new entries for words that don't exist
        new_entries = []
        added_words = []
        
        for word in words:
            word = word.strip()
            if word and len(word) >= 3 and word not in existing_words:
                new_entries.append(ProjectDictionary(
                    project_id=self.project_id,
                    word=word,
                    added_by=user_id
                ))
                added_words.append(word)
        
        # Bulk insert new entries
        if new_entries:
            db.session.add_all(new_entries)
            db.session.commit()
            
            # Update cache if loaded
            if self.approved_words is not None:
                for word in added_words:
                    self.approved_words.add(word.lower())
        
        return len(added_words)


 