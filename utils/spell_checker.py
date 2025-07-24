import unicodedata
from typing import List, Tuple, Set, Dict
import difflib
from collections import defaultdict


class SpellChecker:
    """Efficient spell checker with similarity-based suggestions for Bible translation"""
    
    def __init__(self, dictionary_words: Set[str]):
        self.dictionary_words = set(dictionary_words)
        self.normalized_words = {self._normalize_word(word): word for word in dictionary_words}
        
        # Build character-based index for fast filtering
        self.char_index = self._build_character_index()
        
        # Cache for frequently accessed suggestions
        self.suggestion_cache = {}
    
    def _normalize_word(self, word: str) -> str:
        """Normalize word for consistent comparison"""
        if not word:
            return ""
        
        # Normalize to NFC (canonical composed form)
        normalized = unicodedata.normalize('NFC', word.strip())
        
        # Use case folding which is more language-agnostic than lowercase
        try:
            return normalized.casefold()
        except:
            # Fallback if casefold fails
            return normalized.lower()
    
    def _build_character_index(self) -> Dict[str, Set[str]]:
        """Build index of words by their character sets for fast filtering"""
        char_index = defaultdict(set)
        
        for word in self.dictionary_words:
            normalized = self._normalize_word(word)
            if normalized:  # Only check that word exists after normalization
                # Create character set signature
                char_set = frozenset(normalized)
                char_index[char_set].add(word)
                
                # Also index by first few characters for prefix matching
                if len(normalized) >= 2:  # More inclusive minimum for prefix matching
                    prefix = normalized[:2]
                    char_index[f"prefix_{prefix}"].add(word)
        
        return char_index
    
    def _levenshtein_distance(self, s1: str, s2: str, max_distance: int = None) -> int:
        """Calculate Levenshtein distance with early termination for efficiency"""
        if len(s1) < len(s2):
            s1, s2 = s2, s1
        
        if len(s2) == 0:
            return len(s1)
        
        # Early termination if length difference is too large
        if max_distance and abs(len(s1) - len(s2)) > max_distance:
            return max_distance + 1
        
        previous_row = list(range(len(s2) + 1))
        
        for i, c1 in enumerate(s1):
            current_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = previous_row[j + 1] + 1
                deletions = current_row[j] + 1
                substitutions = previous_row[j] + (c1 != c2)
                current_row.append(min(insertions, deletions, substitutions))
            
            # Early termination if all values exceed max_distance
            if max_distance and all(val > max_distance for val in current_row):
                return max_distance + 1
                
            previous_row = current_row
        
        return previous_row[-1]
    
    def _get_candidate_words(self, target_word: str) -> Set[str]:
        """Get candidate words for similarity comparison using character-based filtering"""
        normalized_target = self._normalize_word(target_word)
        candidates = set()
        
        # Method 1: Character set overlap
        target_chars = frozenset(normalized_target)
        for char_set, words in self.char_index.items():
            if isinstance(char_set, frozenset):
                # Calculate character overlap
                overlap = len(target_chars & char_set)
                total = len(target_chars | char_set)
                if total > 0 and overlap / total >= 0.4:  # 40% character overlap
                    candidates.update(words)
        
        # Method 2: Prefix matching - allow any length
        if len(normalized_target) >= 1:  # Allow single character prefixes
            prefix_len = min(len(normalized_target), 2)  # Use 1-2 character prefixes
            prefix = normalized_target[:prefix_len]
            candidates.update(self.char_index.get(f"prefix_{prefix}", set()))
        
        # Method 3: Length-based filtering (±2 characters)
        target_len = len(normalized_target)
        for word in self.dictionary_words:
            word_len = len(self._normalize_word(word))
            if abs(word_len - target_len) <= 2:
                candidates.add(word)
        
        # Limit candidates for performance
        return candidates if len(candidates) <= 1000 else set(list(candidates)[:1000])
    
    def get_suggestions(self, unknown_word: str, max_suggestions: int = 5) -> List[Tuple[str, float]]:
        """Get top N most similar words with similarity scores"""
        if not unknown_word:  # Only check if word exists, not length
            return []
        
        # Check cache first
        cache_key = (unknown_word.lower(), max_suggestions)
        if cache_key in self.suggestion_cache:
            return self.suggestion_cache[cache_key]
        
        normalized_target = self._normalize_word(unknown_word)
        
        # Simplified: just use all dictionary words as candidates for reliability
        candidates = self.dictionary_words
        
        # Early return if no dictionary words
        if not candidates:
            return []
        
        suggestions = []
        # More generous edit distance for better suggestions
        max_edit_distance = max(1, min(4, len(normalized_target) // 2 + 1))
        
        for candidate in candidates:
            normalized_candidate = self._normalize_word(candidate)
            
            # More generous length filtering - allow any length difference
            length_diff = abs(len(normalized_candidate) - len(normalized_target))
            if length_diff > max_edit_distance + 2:  # More generous allowance
                continue
            
            # Calculate edit distance
            distance = self._levenshtein_distance(
                normalized_target, 
                normalized_candidate, 
                max_distance=max_edit_distance
            )
            
            if distance <= max_edit_distance:
                # Calculate similarity score (0-1, higher is better)
                max_len = max(len(normalized_target), len(normalized_candidate))
                similarity = 1.0 - (distance / max_len) if max_len > 0 else 0.0
                
                suggestions.append((candidate, similarity))
        
        # Sort by similarity score (descending) and take top N
        suggestions.sort(key=lambda x: x[1], reverse=True)
        suggestions = suggestions[:max_suggestions]
        
        # Cache the result
        self.suggestion_cache[cache_key] = suggestions
        
        return suggestions
    
    def update_dictionary(self, new_words: Set[str]):
        """Update the dictionary with new words and rebuild indices"""
        if not new_words:
            return
        
        # Add new words
        self.dictionary_words.update(new_words)
        
        # Update normalized words mapping
        for word in new_words:
            self.normalized_words[self._normalize_word(word)] = word
        
        # Rebuild character index (could be optimized to only add new words)
        self.char_index = self._build_character_index()
        
        # Clear cache since dictionary changed
        self.suggestion_cache.clear()
    
    def is_word_known(self, word: str) -> bool:
        """Check if word exists in dictionary"""
        normalized = self._normalize_word(word)
        return normalized in self.normalized_words
    
    def get_word_suggestions_with_context(self, unknown_word: str, context_words: List[str] = None) -> List[Dict]:
        """Get suggestions with additional context-based scoring"""
        base_suggestions = self.get_suggestions(unknown_word, max_suggestions=10)
        
        if not context_words:
            # Return top 5 without context scoring
            return [
                {
                    "word": word,
                    "similarity": similarity,
                    "confidence": similarity * 100,
                    "edit_distance": self._levenshtein_distance(
                        self._normalize_word(unknown_word), 
                        self._normalize_word(word)
                    )
                }
                for word, similarity in base_suggestions[:5]
            ]
        
        # Context-based scoring could be added here
        # For now, return base suggestions formatted
        return [
            {
                "word": word,
                "similarity": similarity,
                "confidence": similarity * 100,
                "edit_distance": self._levenshtein_distance(
                    self._normalize_word(unknown_word), 
                    self._normalize_word(word)
                )
            }
            for word, similarity in base_suggestions[:5]
        ] 