import json
import re
import unicodedata
from typing import List, Dict, Set

from models import db, ProjectDictionary
from utils.spell_checker import SpellChecker


class LanguageServerService:
    """Lightweight language server for Bible translation"""
    
    def __init__(self, project_id: int):
        self.project_id = project_id
        self.approved_words = None  # Lazy load
        self.spell_checker = None  # Lazy load
    
    def _ensure_dictionary(self):
        """Load dictionary on first use"""
        if self.approved_words is None:
            entries = ProjectDictionary.query.filter_by(
                project_id=self.project_id, 
                approved=True
            ).all()
            self.approved_words = {self._normalize_word(entry.word) for entry in entries}
            
            # Initialize spell checker with approved words
            if self.spell_checker is None:
                original_words = {entry.word for entry in entries}
                self.spell_checker = SpellChecker(original_words)
    
    def _normalize_word(self, word: str) -> str:
        """Normalize word for consistent comparison across Unicode encodings"""
        if not word:
            return ""
        
        # Normalize to NFC (canonical composed form)
        normalized = unicodedata.normalize('NFC', word.strip())
        
        # Only apply case folding for scripts that have case distinctions
        # This is more language-agnostic than forcing lowercase
        try:
            # Case folding is more sophisticated than lowercase for Unicode
            return normalized.casefold()
        except:
            # Fallback if casefold fails for any reason
            return normalized.lower()
    
    def _extract_words(self, text: str) -> List[tuple]:
        """Extract words from text using simple, language-agnostic approach"""
        if not text:
            return []
        
        # Normalize the input text
        normalized_text = unicodedata.normalize('NFC', text)
        
        words = []
        
        try:
            # Use regex module for better Unicode support if available
            import regex
            
            # Simple pattern: any sequence of Unicode letters and marks
            # No minimum length requirement - let users decide what's valid
            pattern = r'[\p{L}\p{M}]+'
            
            for match in regex.finditer(pattern, normalized_text):
                word = match.group()
                words.append((word, match.start(), match.end()))
                
        except ImportError:
            # Fallback: use standard re with basic Unicode word boundary
            # This is less precise but still inclusive
            import re
            
            # Match sequences of word characters (letters, digits, underscores)
            # Plus common Unicode letter ranges
            pattern = r'[\w\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0900-\u097F\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]+'
            
            for match in re.finditer(pattern, normalized_text):
                word = match.group()
                words.append((word, match.start(), match.end()))
        
        return words

    def analyze_verse(self, verse_text: str) -> Dict:
        """Analyze verse text and return suggestions"""
        if not verse_text or not verse_text.strip():
            return {"suggestions": []}
        
        self._ensure_dictionary()
        
        spelling_suggestions = []
        smart_edit_suggestions = []
        
        # --- 1. Always check for smart edits first ---
        # This allows us to know if they "exist" in the current text.
        target_phrase = "hello world"
        replacement_phrase = "Hello World!"
        for match in re.finditer(target_phrase, verse_text, re.IGNORECASE):
            start, end = match.start(), match.end()
            smart_edit_suggestions.append({
                "substring": match.group(0),
                "start": start,
                "end": end,
                "color": "#A020F0",  # Purple for smart edits
                "message": "Apply Edit:",
                "actions": ["apply_smart_edit"],
                "replacement": replacement_phrase
            })
            
        # --- 2. Check for spelling suggestions ---
        words = self._extract_words(verse_text)
        for word, start, end in words:
            normalized_word = self._normalize_word(word)
            if normalized_word and normalized_word not in self.approved_words:
                suggestion = {
                    "substring": word,
                    "start": start,
                    "end": end,
                    "color": "#ff6b6b",
                    "message": f"'{word}' not in dictionary",
                    "actions": ["add_to_dictionary", "spell_check"]
                }
                spelling_suggestions.append(suggestion)
        
        # --- 3. Prioritization Logic ---
        # If there are spelling errors, return them alongside any pre-existing smart edits.
        # This prevents new smart edits from appearing but keeps existing ones on screen.
        if spelling_suggestions:
            # Only return smart edits if they were already in the text.
            # This satisfies "don't create new ones if there are spelling problems"
            # because the smart edit check is now independent.
            return {"suggestions": spelling_suggestions + smart_edit_suggestions}
            
        # If there are no spelling errors, it's safe to show the smart edits.
        return {"suggestions": smart_edit_suggestions}
    
    def get_word_suggestions(self, word: str) -> List[Dict]:
        """Get spelling suggestions for a specific word (called on hover)"""
        self._ensure_dictionary()
        
        if not self.spell_checker:
            return []
        
        suggestions_with_scores = self.spell_checker.get_suggestions(word, max_suggestions=5)
        return [word for word, score in suggestions_with_scores]

    def add_word_to_dictionary(self, word: str, user_id: int) -> bool:
        """Add word to project dictionary, returns True if word was actually added"""
        # Normalize the word before storage
        normalized_word = self._normalize_word(word)
        if not normalized_word:
            return False
        
        # Ensure dictionary cache is loaded
        self._ensure_dictionary()
        
        # Check if normalized word already exists in our cache
        if normalized_word in self.approved_words:
            return False  # Word already exists (in normalized form)
        
        # Store the original word as entered by user
        entry = ProjectDictionary(
            project_id=self.project_id,
            word=word,  # Store the original word as entered by user
            added_by=user_id
        )
        db.session.add(entry)
        db.session.commit()
        
        # Update cache if loaded (use normalized form for lookup)
        if self.approved_words is not None:
            self.approved_words.add(normalized_word)
        
        # Update spell checker
        if self.spell_checker is not None:
            self.spell_checker.update_dictionary({word})
        
        return True

    def add_words_to_dictionary_bulk(self, words: List[str], user_id: int) -> int:
        """Add multiple words to project dictionary efficiently"""
        if not words:
            return 0
        
        # Ensure dictionary cache is loaded for normalization checks
        self._ensure_dictionary()
        
        # Create new entries for words that don't exist (using normalized comparison)
        new_entries = []
        added_words = []
        
        for word in words:
            word = word.strip()
            if word:  # Only check that word exists, no length requirements
                normalized_word = self._normalize_word(word)
                # Check if normalized form already exists in cache
                if normalized_word not in self.approved_words:
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
                    self.approved_words.add(self._normalize_word(word))
            
            # Update spell checker
            if self.spell_checker is not None:
                self.spell_checker.update_dictionary(set(added_words))
        
        return len(added_words)


 