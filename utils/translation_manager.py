import os
import sys
import uuid
from typing import List, Dict, Optional, Tuple

# Add project root to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import packages after path setup
from vref_utils import Vref
from storage import get_storage


class VerseReferenceManager:
    """Handles verse reference operations using vref-utils"""
    
    def __init__(self):
        # Load the vref.txt as a simple verse reference lookup
        self.vref_data = self._load_vref_data()
        self.verse_to_index = {verse: i for i, verse in enumerate(self.vref_data)}
    
    def _load_vref_data(self):
        """Load verse references from data/vref.txt"""
        vref_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'vref.txt')
        with open(vref_path, 'r', encoding='utf-8') as f:
            return [line.strip() for line in f.readlines()]
    
    def get_verse_index(self, book: str, chapter: int, verse: int) -> Optional[int]:
        """Convert book/chapter/verse to line index"""
        ref = f"{book} {chapter}:{verse}"
        return self.verse_to_index.get(ref)
    
    def get_chapter_verses(self, book: str, chapter: int) -> List[Dict]:
        """Get all verses for a chapter with their indices"""
        verses = []
        verse_num = 1
        
        while True:
            ref = f"{book} {chapter}:{verse_num}"
            if ref not in self.verse_to_index:
                break
            
            verses.append({
                'verse': verse_num,
                'reference': ref,
                'index': self.verse_to_index[ref]
            })
            verse_num += 1
        
        return verses
    
    def parse_verse_ref(self, ref_string: str) -> Optional[Tuple[str, int, int]]:
        """Parse 'GEN 1:1' format into (book, chapter, verse)"""
        try:
            parts = ref_string.split()
            if len(parts) != 2:
                return None
            
            book = parts[0]
            chapter_verse = parts[1].split(':')
            if len(chapter_verse) != 2:
                return None
            
            chapter = int(chapter_verse[0])
            verse = int(chapter_verse[1])
            
            return book, chapter, verse
        except (ValueError, IndexError):
            return None
    
    def get_book_chapters(self, book: str) -> List[int]:
        """Get all chapter numbers for a book"""
        chapters = set()
        for ref in self.vref_data:
            if ref.startswith(f"{book} "):
                try:
                    chapter = int(ref.split()[1].split(':')[0])
                    chapters.add(chapter)
                except (ValueError, IndexError):
                    continue
        return sorted(list(chapters))
    
    def get_verse_reference(self, verse_index: int) -> Optional[str]:
        """Get verse reference by index (0-based)"""
        if 0 <= verse_index < len(self.vref_data):
            return self.vref_data[verse_index]
        return None


class TranslationFileManager:
    """Manages translation files stored as eBible format (31170 lines)"""
    
    def __init__(self, storage_path: str):
        self.storage_path = storage_path
        self.storage = get_storage()
        self.lines = None
        self._verse_ref_manager = VerseReferenceManager()
    
    def load_translation_file(self) -> List[str]:
        """Load translation file as list of lines (31170 lines)"""
        if self.lines is not None:
            return self.lines
        
        try:
            file_content = self.storage.get_file(self.storage_path)
            content = safe_decode_content(file_content)
            self.lines = content.split('\n')
            
            # Ensure we have exactly 31170 lines
            while len(self.lines) < 31170:
                self.lines.append('')
            
            # Trim to exactly 31170 lines
            self.lines = self.lines[:31170]
            
        except Exception:
            # File doesn't exist, create empty translation
            self.lines = [''] * 31170
        
        return self.lines
    
    def save_verse(self, verse_index: int, text: str) -> bool:
        """Save single verse at specific index"""
        if verse_index < 0 or verse_index >= 31170:
            return False
        
        lines = self.load_translation_file()
        lines[verse_index] = text.strip()
        
        # Save immediately
        return self.save_translation_file()
    
    def get_verse(self, verse_index: int) -> str:
        """Get verse text at specific index"""
        if verse_index < 0 or verse_index >= 31170:
            return ''
        
        lines = self.load_translation_file()
        return lines[verse_index]
    
    def get_chapter_verses(self, verse_indices: List[int]) -> List[str]:
        """Get multiple verses by indices"""
        lines = self.load_translation_file()
        return [lines[i] if 0 <= i < 31170 else '' for i in verse_indices]
    
    def save_translation_file(self) -> bool:
        """Save entire translation file"""
        try:
            content = '\n'.join(self.lines)
            self.storage.store_file_content(content, self.storage_path)
            return True
        except Exception as e:
            print(f"Error saving translation file: {e}")
            return False
    
    def calculate_progress(self) -> Tuple[int, float]:
        """Calculate translation progress"""
        lines = self.load_translation_file()
        translated_count = sum(1 for line in lines if line.strip())
        progress_percentage = (translated_count / 31170) * 100
        return translated_count, progress_percentage
    
    @classmethod
    def create_new_translation_file(cls, project_id: int, name: str) -> str:
        """Create a new empty translation file and return storage path"""
        file_id = str(uuid.uuid4())
        sanitized_name = "".join(c for c in name if c.isalnum() or c in (' ', '-', '_')).strip()
        sanitized_name = sanitized_name.replace(' ', '_')
        
        storage_path = f"translations/{project_id}/{file_id}_{sanitized_name}.txt"
        
        # Create empty file
        storage = get_storage()
        empty_content = '\n'.join([''] * 31170)
        storage.store_file_content(empty_content, storage_path)
        
        return storage_path


class SourceTextManager:
    """Manages source text files using vref-utils"""
    
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.vref = None
        self._load_source_file()
    
    def _load_source_file(self):
        """Load source file using vref-utils"""
        try:
            # For now, we'll use the file path directly
            # In production, you might need to download from storage first
            if os.path.exists(self.file_path):
                self.vref = Vref(self.file_path)
        except Exception as e:
            print(f"Error loading source file: {e}")
            self.vref = None
    
    def get_chapter_verses(self, book: str, chapter: int) -> List[Dict]:
        """Get source verses for a chapter"""
        if not self.vref:
            return []
        
        verses = []
        verse_num = 1
        
        while True:
            try:
                ref = f"{book} {chapter}:{verse_num}"
                verse_list = self.vref[ref]
                
                if len(verse_list) == 0:
                    break
                
                verse = verse_list[0]
                verses.append({
                    'verse': verse_num,
                    'reference': verse.reference,
                    'text': verse.text
                })
                verse_num += 1
                
            except (KeyError, IndexError, Exception):
                break
        
        return verses
    
    def get_verse(self, book: str, chapter: int, verse: int) -> Optional[str]:
        """Get single verse text"""
        if not self.vref:
            return None
        
        try:
            ref = f"{book} {chapter}:{verse}"
            verse_list = self.vref[ref]
            if len(verse_list) > 0:
                return verse_list[0].text
        except (KeyError, IndexError, Exception):
            pass
        
        return None 

def safe_decode_content(file_content):
    """Simple UTF-8 decode that ignores problematic bytes"""
    return file_content.decode('utf-8', errors='ignore') 