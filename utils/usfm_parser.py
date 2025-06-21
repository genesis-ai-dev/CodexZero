import re
import os
from typing import Dict, List, Tuple, Optional


class USFMParser:
    """Parser for USFM (Unified Standard Format Markers) files to extract verses."""
    
    # Common USFM book abbreviations to standard 3-letter codes
    BOOK_MAPPINGS = {
        'GEN': 'GEN', 'EXO': 'EXO', 'LEV': 'LEV', 'NUM': 'NUM', 'DEU': 'DEU',
        'JOS': 'JOS', 'JDG': 'JDG', 'RUT': 'RUT', '1SA': '1SA', '2SA': '2SA',
        '1KI': '1KI', '2KI': '2KI', '1CH': '1CH', '2CH': '2CH', 'EZR': 'EZR',
        'NEH': 'NEH', 'EST': 'EST', 'JOB': 'JOB', 'PSA': 'PSA', 'PRO': 'PRO',
        'ECC': 'ECC', 'SNG': 'SNG', 'ISA': 'ISA', 'JER': 'JER', 'LAM': 'LAM',
        'EZK': 'EZK', 'DAN': 'DAN', 'HOS': 'HOS', 'JOL': 'JOL', 'AMO': 'AMO',
        'OBA': 'OBA', 'JON': 'JON', 'MIC': 'MIC', 'NAM': 'NAM', 'HAB': 'HAB',
        'ZEP': 'ZEP', 'HAG': 'HAG', 'ZEC': 'ZEC', 'MAL': 'MAL',
        'MAT': 'MAT', 'MRK': 'MRK', 'LUK': 'LUK', 'JHN': 'JHN', 'ACT': 'ACT',
        'ROM': 'ROM', '1CO': '1CO', '2CO': '2CO', 'GAL': 'GAL', 'EPH': 'EPH',
        'PHP': 'PHP', 'COL': 'COL', '1TH': '1TH', '2TH': '2TH', '1TI': '1TI',
        '2TI': '2TI', 'TIT': 'TIT', 'PHM': 'PHM', 'HEB': 'HEB', 'JAS': 'JAS',
        '1PE': '1PE', '2PE': '2PE', '1JN': '1JN', '2JN': '2JN', '3JN': '3JN',
        'JUD': 'JUD', 'REV': 'REV'
    }
    
    def __init__(self):
        self.current_book = None
        self.current_chapter = None
        
    def parse_file(self, file_content: str) -> Dict[str, str]:
        """
        Parse a USFM file and extract verses.
        
        Args:
            file_content: The USFM file content as a string
            
        Returns:
            Dict mapping verse references (e.g., "GEN 1:1") to verse text
        """
        verses = {}
        lines = file_content.split('\n')
        
        current_verse_text = ""
        current_verse_ref = None
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
                
            # Book marker (e.g., \id GEN)
            if line.startswith('\\id '):
                book_code = line[4:].strip().split()[0].upper()
                self.current_book = self.BOOK_MAPPINGS.get(book_code, book_code)
                continue
                
            # Chapter marker (e.g., \c 1)
            if line.startswith('\\c '):
                chapter_match = re.search(r'\\c\s+(\d+)', line)
                if chapter_match:
                    self.current_chapter = int(chapter_match.group(1))
                    # Save any pending verse
                    if current_verse_ref and current_verse_text.strip():
                        verses[current_verse_ref] = self._clean_verse_text(current_verse_text)
                    current_verse_text = ""
                    current_verse_ref = None
                continue
                
            # Verse marker (e.g., \v 1 or \v 1-2)
            verse_match = re.search(r'\\v\s+(\d+)(?:-\d+)?\s*(.*)', line)
            if verse_match:
                # Save previous verse if exists
                if current_verse_ref and current_verse_text.strip():
                    verses[current_verse_ref] = self._clean_verse_text(current_verse_text)
                
                verse_num = int(verse_match.group(1))
                verse_text = verse_match.group(2)
                
                if self.current_book and self.current_chapter is not None:
                    current_verse_ref = f"{self.current_book} {self.current_chapter}:{verse_num}"
                    current_verse_text = verse_text
                continue
                
            # Continuation of verse text
            if current_verse_ref:
                current_verse_text += " " + line
                
        # Save the last verse
        if current_verse_ref and current_verse_text.strip():
            verses[current_verse_ref] = self._clean_verse_text(current_verse_text)
            
        return verses
        
    def _clean_verse_text(self, text: str) -> str:
        """
        Clean verse text by removing USFM markers, Strong's numbers, and other markup.
        Preserves plain text across all languages and scripts.
        """
        # Remove Strong's numbers and word markup (e.g., |strong="H4480", \w*)
        text = re.sub(r'\|strong="[^"]*"', '', text)  # Remove |strong="H4480" patterns
        text = re.sub(r'\\w\*', '', text)  # Remove \w* markers
        
        # Remove common USFM markers
        text = re.sub(r'\\[a-zA-Z]+\d*\*?(\s|$)', ' ', text)  # Remove markers like \p, \q, \m, \v, \c
        text = re.sub(r'\\[a-zA-Z]+\d*\s+[^\\]*?\\[a-zA-Z]+\d*\*', ' ', text)  # Remove paired markers
        
        # Remove footnotes and cross-references
        text = re.sub(r'\\f\s+.*?\\f\*', '', text)  # Remove footnotes
        text = re.sub(r'\\x\s+.*?\\x\*', '', text)  # Remove cross-references
        
        # Handle special markup patterns more carefully
        text = re.sub(r'\+[^+]*\+', '', text)  # Remove + markers
        
        # Handle ◄...► patterns more carefully to preserve text inside
        text = re.sub(r'◄\s*([^►\\]*?)(?:\\w\*)?/?\s*([^►\\]*?)(?:\\w\*)?►', r'\1 \2', text)  # Extract text from ◄...►
        text = re.sub(r'◄[^►]*►', '', text)  # Remove any remaining ◄...► patterns
        text = re.sub(r'◄[^\\]*\\w\*', '', text)  # Remove ◄...\\w* patterns
        text = re.sub(r'►[^\\]*\\w\*', '', text)  # Remove ►...\\w* patterns
        
        # Remove any remaining backslash markers
        text = re.sub(r'\\[a-zA-Z]+\d*\*?', '', text)  # Clean up any remaining markers
        
        # Remove pipe characters that might be left from markup
        text = re.sub(r'\|+', '', text)  # Remove standalone pipes
        
        # Clean up punctuation and spacing issues
        text = re.sub(r'\s*\*\s*', ' ', text)  # Remove standalone asterisks
        text = re.sub(r'\s*\/\s*', ' ', text)  # Remove standalone slashes
        text = re.sub(r'\s+', ' ', text)  # Normalize whitespace
        text = re.sub(r'\s+([,.;:!?])', r'\1', text)  # Fix spacing before punctuation
        text = re.sub(r'([,.;:!?])\s*([,.;:!?])', r'\1 \2', text)  # Fix double punctuation
        
        # Clean up quotes and special characters
        text = re.sub(r'"\s*"', '"', text)  # Remove empty quotes
        text = re.sub(r'"\s*([A-Za-z])', r'" \1', text)  # Fix quote spacing before letters
        text = re.sub(r'([A-Za-z])\s*"', r'\1"', text)  # Fix quote spacing after letters
        
        # Fix common spacing issues
        text = re.sub(r'([a-zA-Z])"([a-zA-Z])', r'\1" \2', text)  # Add space after quotes
        text = re.sub(r'([.!?])"?\s*([A-Z])', r'\1 \2', text)  # Fix sentence spacing
        
        # Final cleanup
        text = text.strip()
        
        # Remove any leading/trailing punctuation that might be artifacts
        text = re.sub(r'^[,.\s]+|[,.\s]+$', '', text)
        
        # Ensure proper sentence ending
        if text and not text[-1] in '.!?':
            text += '.'
        
        return text


class EBibleBuilder:
    """Builder for creating eBible format files from USFM data."""
    
    def __init__(self, vref_file_path: str):
        """
        Initialize with the verse reference file.
        
        Args:
            vref_file_path: Path to the vref.txt file
        """
        self.verse_order = []
        self.verse_to_line = {}
        
        with open(vref_file_path, 'r') as f:
            for line_num, verse_ref in enumerate(f, 1):
                verse_ref = verse_ref.strip()
                if verse_ref:
                    self.verse_order.append(verse_ref)
                    self.verse_to_line[verse_ref] = line_num
                    
    def create_ebible_from_usfm_verses(self, usfm_verses: Dict[str, str], 
                                      existing_ebible: Optional[List[str]] = None) -> List[str]:
        """
        Create or update an eBible format list from USFM verses.
        
        Args:
            usfm_verses: Dict mapping verse references to verse text
            existing_ebible: Existing eBible lines (if updating)
            
        Returns:
            List of strings representing the eBible format (one verse per line)
        """
        # Initialize with existing content or empty lines
        if existing_ebible:
            ebible_lines = existing_ebible[:]
        else:
            ebible_lines = [''] * len(self.verse_order)
            
        # Map USFM verses to correct line positions
        for verse_ref, verse_text in usfm_verses.items():
            if verse_ref in self.verse_to_line:
                line_index = self.verse_to_line[verse_ref] - 1  # Convert to 0-based index
                ebible_lines[line_index] = verse_text
                
        return ebible_lines
        
    def get_completion_stats(self, ebible_lines: List[str]) -> Dict[str, any]:
        """
        Get statistics about Bible completion.
        
        Args:
            ebible_lines: The eBible format lines
            
        Returns:
            Dict with completion statistics
        """
        total_verses = len(ebible_lines)
        filled_verses = sum(1 for line in ebible_lines if line.strip())
        missing_verses = total_verses - filled_verses
        completion_percentage = (filled_verses / total_verses) * 100 if total_verses > 0 else 0
        
        return {
            'total_verses': total_verses,
            'filled_verses': filled_verses,
            'missing_verses': missing_verses,
            'completion_percentage': completion_percentage
        }
        
    def get_missing_verse_ranges(self, ebible_lines: List[str]) -> List[str]:
        """
        Get a list of missing verse ranges for user feedback.
        
        Args:
            ebible_lines: The eBible format lines
            
        Returns:
            List of missing verse reference ranges
        """
        missing_refs = []
        for i, line in enumerate(ebible_lines):
            if not line.strip() and i < len(self.verse_order):
                missing_refs.append(self.verse_order[i])
                
        # Group consecutive missing verses into ranges
        if not missing_refs:
            return []
            
        ranges = []
        current_range_start = missing_refs[0]
        current_range_end = missing_refs[0]
        
        for i in range(1, len(missing_refs)):
            current_ref = missing_refs[i]
            prev_ref = missing_refs[i-1]
            
            # Check if consecutive (same book, consecutive verses)
            if self._are_consecutive_verses(prev_ref, current_ref):
                current_range_end = current_ref
            else:
                # End current range, start new one
                if current_range_start == current_range_end:
                    ranges.append(current_range_start)
                else:
                    ranges.append(f"{current_range_start} - {current_range_end}")
                current_range_start = current_ref
                current_range_end = current_ref
                
        # Add the last range
        if current_range_start == current_range_end:
            ranges.append(current_range_start)
        else:
            ranges.append(f"{current_range_start} - {current_range_end}")
            
        return ranges[:20]  # Limit to first 20 ranges for display
        
    def _are_consecutive_verses(self, ref1: str, ref2: str) -> bool:
        """Check if two verse references are consecutive."""
        try:
            parts1 = ref1.split()
            parts2 = ref2.split()
            
            if len(parts1) != 2 or len(parts2) != 2:
                return False
                
            book1, verse1 = parts1[0], parts1[1]
            book2, verse2 = parts2[0], parts2[1]
            
            if book1 != book2:
                return False
                
            chapter1, verse_num1 = verse1.split(':')
            chapter2, verse_num2 = verse2.split(':')
            
            if chapter1 != chapter2:
                return False
                
            return int(verse_num2) == int(verse_num1) + 1
            
        except (ValueError, IndexError):
            return False 