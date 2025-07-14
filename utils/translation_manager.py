import os
import sys
import uuid
import chardet
import io
from typing import List, Dict, Optional, Tuple
from datetime import datetime

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
    
    def get_book_chapters(self, book: str) -> List[int]:
        """Get all chapter numbers for a book"""
        chapters = set()
        for ref in self.vref_data:
            if ref.startswith(f"{book} "):
                chapter = int(ref.split()[1].split(':')[0])
                chapters.add(chapter)
        return sorted(list(chapters))
    
    def get_verse_reference(self, verse_index: int) -> Optional[str]:
        """Get verse reference by index (0-based)"""
        if 0 <= verse_index < len(self.vref_data):
            return self.vref_data[verse_index]
        return None





class SourceTextManager:
    """Manages source text files using vref-utils"""
    
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.vref = None
        self._load_source_file()
    
    def _load_source_file(self):
        """Load source file using vref-utils"""
        if os.path.exists(self.file_path):
            self.vref = Vref(self.file_path)
    
    def get_chapter_verses(self, book: str, chapter: int) -> List[Dict]:
        """Get source verses for a chapter"""
        if not self.vref:
            return []
        
        verses = []
        verse_num = 1
        
        while True:
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
        
        return verses
    
    def get_verse(self, book: str, chapter: int, verse: int) -> Optional[str]:
        """Get single verse text"""
        if not self.vref:
            return None
        
        ref = f"{book} {chapter}:{verse}"
        verse_list = self.vref[ref]
        if len(verse_list) > 0:
            return verse_list[0].text
        
        return None 

def safe_decode_content(file_content):
    """Auto-detect encoding to preserve all characters with zero information loss"""
    detected = chardet.detect(file_content)
    encoding = detected['encoding'] if detected and detected['encoding'] else 'utf-8'
    return file_content.decode(encoding) 