import os
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timedelta

class FileVerseCache:
    """Cache system for efficiently accessing verses from large Bible files"""
    
    def __init__(self, cache_duration_minutes: int = 30):
        self._cache: Dict[str, Dict[int, str]] = {}  # file_path -> {verse_index: verse_text}
        self._cache_metadata: Dict[str, datetime] = {}  # file_path -> last_access_time
        self._cache_duration = timedelta(minutes=cache_duration_minutes)
        self._file_lines: Dict[str, List[str]] = {}  # Full file cache for active files
    
    def get_verses(self, file_path: str, verse_indices: List[int], file_content: bytes = None) -> List[str]:
        """Get specific verses from a file, using cache when possible"""
        
        # Clean expired cache entries
        self._clean_expired_cache()
        
        # Check if we have this file in cache
        if file_path not in self._file_lines and file_content:
            # Decode and cache the file
            from translation import simple_decode_utf8
            content = simple_decode_utf8(file_content)
            self._file_lines[file_path] = content.split('\n')
            self._cache_metadata[file_path] = datetime.utcnow()
        
        # Get verses from cache
        if file_path in self._file_lines:
            lines = self._file_lines[file_path]
            verses = []
            for idx in verse_indices:
                if 0 <= idx < len(lines):
                    verses.append(lines[idx])
                else:
                    verses.append('')
            
            # Update last access time
            self._cache_metadata[file_path] = datetime.utcnow()
            return verses
        
        return [''] * len(verse_indices)
    
    def preload_file(self, file_path: str, file_content: bytes) -> None:
        """Preload a file into cache"""
        from translation import simple_decode_utf8
        content = simple_decode_utf8(file_content)
        self._file_lines[file_path] = content.split('\n')
        self._cache_metadata[file_path] = datetime.utcnow()
    
    def _clean_expired_cache(self) -> None:
        """Remove expired entries from cache"""
        now = datetime.utcnow()
        expired_paths = []
        
        for file_path, last_access in self._cache_metadata.items():
            if now - last_access > self._cache_duration:
                expired_paths.append(file_path)
        
        for path in expired_paths:
            if path in self._file_lines:
                del self._file_lines[path]
            if path in self._cache:
                del self._cache[path]
            del self._cache_metadata[path]
    
    def clear_cache(self) -> None:
        """Clear all cached data"""
        self._cache.clear()
        self._cache_metadata.clear()
        self._file_lines.clear()

# Global cache instance
_file_verse_cache = FileVerseCache()

def get_file_verse_cache() -> FileVerseCache:
    """Get the global file verse cache instance"""
    return _file_verse_cache 