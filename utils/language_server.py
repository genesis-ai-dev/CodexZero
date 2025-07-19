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
        # Normalize to NFC (canonical composed form) and convert to lowercase
        return unicodedata.normalize('NFC', word.strip()).lower()
    
    def _extract_words(self, text: str) -> List[tuple]:
        """Extract words from text using Unicode-aware regex patterns"""
        if not text:
            return []
        
        # Normalize the input text
        normalized_text = unicodedata.normalize('NFC', text)
        
        words = []
        
        # Pattern 1: Unicode letter sequences (most languages)
        # \p{L} matches any Unicode letter, including accented characters
        # This supports Latin, Cyrillic, Greek, Arabic, Hebrew, etc.
        letter_pattern = r'[\p{L}\p{M}]{3,}'
        
        # Pattern 2: CJK ideographs (Chinese, Japanese, Korean)
        # These languages don't use spaces between words, so each character is significant
        cjk_pattern = r'[\p{Han}\p{Hiragana}\p{Katakana}]+'
        
        try:
            # Use the regex module for Unicode property support
            import regex
            
            # Find letter-based words (3+ characters for non-CJK scripts)
            for match in regex.finditer(letter_pattern, normalized_text):
                word = match.group()
                if len(word) >= 3:  # Minimum length for most scripts
                    words.append((word, match.start(), match.end()))
            
            # Find CJK characters/words (each character is meaningful)
            for match in regex.finditer(cjk_pattern, normalized_text):
                word = match.group()
                # For CJK, we check individual characters or short sequences
                if len(word) >= 1:  # CJK characters are meaningful individually
                    words.append((word, match.start(), match.end()))
                    
        except ImportError:
            # Fallback to standard re module with basic Unicode support
            # This covers most common cases but may miss some edge cases
            
            # Enhanced pattern that works with standard re module
            # Covers Latin, Cyrillic, Greek, Arabic, Hebrew, and many others
            unicode_ranges = [
                r'\u0041-\u005A',  # Latin uppercase
                r'\u0061-\u007A',  # Latin lowercase  
                r'\u00C0-\u00D6',  # Latin-1 supplement uppercase
                r'\u00D8-\u00F6',  # Latin-1 supplement uppercase continued
                r'\u00F8-\u00FF',  # Latin-1 supplement lowercase
                r'\u0100-\u017F',  # Latin Extended-A
                r'\u0180-\u024F',  # Latin Extended-B
                r'\u0370-\u03FF',  # Greek and Coptic
                r'\u0400-\u04FF',  # Cyrillic
                r'\u0590-\u05FF',  # Hebrew
                r'\u0600-\u06FF',  # Arabic
                r'\u0750-\u077F',  # Arabic Supplement
                r'\u08A0-\u08FF',  # Arabic Extended-A
                r'\u0900-\u097F',  # Devanagari
                r'\u0980-\u09FF',  # Bengali
                r'\u0A00-\u0A7F',  # Gurmukhi
                r'\u0A80-\u0AFF',  # Gujarati
                r'\u0B00-\u0B7F',  # Oriya
                r'\u0B80-\u0BFF',  # Tamil
                r'\u0C00-\u0C7F',  # Telugu
                r'\u0C80-\u0CFF',  # Kannada
                r'\u0D00-\u0D7F',  # Malayalam
                r'\u0E00-\u0E7F',  # Thai
                r'\u0E80-\u0EFF',  # Lao
                r'\u1000-\u109F',  # Myanmar
                r'\u1100-\u11FF',  # Hangul Jamo
                r'\u1200-\u137F',  # Ethiopic
                r'\u13A0-\u13FF',  # Cherokee
                r'\u1400-\u167F',  # Unified Canadian Aboriginal Syllabics
                r'\u1680-\u169F',  # Ogham
                r'\u16A0-\u16FF',  # Runic
                r'\u1700-\u171F',  # Tagalog
                r'\u1720-\u173F',  # Hanunoo
                r'\u1740-\u175F',  # Buhid
                r'\u1760-\u177F',  # Tagbanwa
                r'\u1780-\u17FF',  # Khmer
                r'\u1800-\u18AF',  # Mongolian
                r'\u1900-\u194F',  # Limbu
                r'\u1950-\u197F',  # Tai Le
                r'\u19E0-\u19FF',  # Khmer Symbols
                r'\u1D00-\u1D7F',  # Phonetic Extensions
                r'\u1D80-\u1DBF',  # Phonetic Extensions Supplement
                r'\u1E00-\u1EFF',  # Latin Extended Additional
                r'\u1F00-\u1FFF',  # Greek Extended
                r'\u2C00-\u2C5F',  # Glagolitic
                r'\u2C60-\u2C7F',  # Latin Extended-C
                r'\u2C80-\u2CFF',  # Coptic
                r'\u2D00-\u2D2F',  # Georgian Supplement
                r'\u2D30-\u2D7F',  # Tifinagh
                r'\u2D80-\u2DDF',  # Ethiopic Extended
                r'\u2DE0-\u2DFF',  # Cyrillic Extended-A
                r'\u2E00-\u2E7F',  # Supplemental Punctuation
                r'\u3040-\u309F',  # Hiragana
                r'\u30A0-\u30FF',  # Katakana
                r'\u3100-\u312F',  # Bopomofo
                r'\u3130-\u318F',  # Hangul Compatibility Jamo
                r'\u31A0-\u31BF',  # Bopomofo Extended
                r'\u31F0-\u31FF',  # Katakana Phonetic Extensions
                r'\u3400-\u4DBF',  # CJK Extension A
                r'\u4E00-\u9FFF',  # CJK Unified Ideographs
                r'\uAC00-\uD7AF',  # Hangul Syllables
                r'\uF900-\uFAFF',  # CJK Compatibility Ideographs
                r'\uFE30-\uFE4F',  # CJK Compatibility Forms
                r'\uFF00-\uFFEF',  # Halfwidth and Fullwidth Forms
            ]
            
            # Combining marks (diacritics)
            combining_marks = r'\u0300-\u036F\u1AB0-\u1AFF\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F'
            
            # Create comprehensive Unicode word pattern
            unicode_pattern = f'[{"".join(unicode_ranges)}{combining_marks}]{{3,}}'
            
            # Find words using the comprehensive pattern
            for match in re.finditer(unicode_pattern, normalized_text):
                word = match.group()
                words.append((word, match.start(), match.end()))
            
            # Also find CJK characters using basic Unicode ranges
            cjk_basic_pattern = r'[\u3400-\u4DBF\u4E00-\u9FFF\u3040-\u309F\u30A0-\u30FF\uAC00-\uD7AF]+'
            for match in re.finditer(cjk_basic_pattern, normalized_text):
                word = match.group()
                if len(word) >= 1:  # CJK characters are meaningful individually
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
            
        # Check if already exists (using normalized form)
        existing = ProjectDictionary.query.filter_by(
            project_id=self.project_id,
            word=word  # Store original form but check normalized
        ).first()
        
        if not existing:
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
                    self.approved_words.add(self._normalize_word(word))
            
            # Update spell checker
            if self.spell_checker is not None:
                self.spell_checker.update_dictionary(set(added_words))
        
        return len(added_words)


 