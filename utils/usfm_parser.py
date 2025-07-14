import re
import os
from typing import Dict, List, Optional


class USFMParser:
    """Parser for USFM/SFM files to extract verses using standard markers."""
    
    def __init__(self):
        pass
        
    def parse_file(self, content: str, filename: str = "") -> Dict[str, str]:
        """
        Parse USFM file content and extract verses using standard markers.
        
        Args:
            content: The USFM file content as a string
            filename: Optional filename for error reporting
            
        Returns:
            Dict mapping verse references (e.g., "ROM 8:1") to verse text
            
        Raises:
            ValueError: If content is not valid USFM format
        """
        if not content or not content.strip():
            raise ValueError("Empty file content provided")
            
        # Validate that this looks like USFM content
        if not self._validate_usfm_content(content):
            raise ValueError("File does not contain valid USFM markers")
        
        verses = {}
        current_book = None
        current_chapter = None
        current_verse_num = None
        current_verse_text = ""
        
        # Split content into lines
        lines = content.split('\n')
        
        for line_num, line in enumerate(lines, 1):
            line = line.strip()
            if not line:
                continue
            
            try:
                # Book marker: \id BOOK_CODE
                book_match = re.search(r'\\id\s+([A-Z0-9]{3})', line)
                if book_match:
                    # Save previous verse if we have one
                    if current_book and current_chapter and current_verse_num and current_verse_text.strip():
                        verse_ref = f"{current_book} {current_chapter}:{current_verse_num}"
                        verses[verse_ref] = self._clean_text(current_verse_text)
                    
                    current_book = book_match.group(1).upper()
                    current_chapter = None
                    current_verse_num = None
                    current_verse_text = ""
                    continue

                # Chapter marker: \c NUMBER
                chapter_match = re.search(r'\\c\s+(\d+)', line)
                if chapter_match:
                    # Save previous verse if we have one
                    if current_book and current_chapter and current_verse_num and current_verse_text.strip():
                        verse_ref = f"{current_book} {current_chapter}:{current_verse_num}"
                        verses[verse_ref] = self._clean_text(current_verse_text)
                    
                    current_chapter = int(chapter_match.group(1))
                    current_verse_num = None
                    current_verse_text = ""
                    continue

                # Verse marker: \v NUMBER TEXT
                verse_match = re.search(r'\\v\s+(\d+)\s*(.*)', line)
                if verse_match:
                    # Save previous verse if we have one
                    if current_book and current_chapter and current_verse_num and current_verse_text.strip():
                        verse_ref = f"{current_book} {current_chapter}:{current_verse_num}"
                        verses[verse_ref] = self._clean_text(current_verse_text)
                    
                    if not current_book:
                        raise ValueError(f"Verse marker found before book identifier at line {line_num}")
                    if not current_chapter:
                        raise ValueError(f"Verse marker found before chapter marker at line {line_num}")
                    
                    current_verse_num = int(verse_match.group(1))
                    current_verse_text = verse_match.group(2)
                    continue

                # Continuation of verse text (any line that doesn't start with a marker)
                if current_verse_num and not line.startswith('\\'):
                    current_verse_text += " " + line
                    
            except Exception as e:
                print(f"Warning: Error processing line {line_num} in {filename}: {e}")
                continue
        
        # Save the last verse
        if current_book and current_chapter and current_verse_num and current_verse_text.strip():
            verse_ref = f"{current_book} {current_chapter}:{current_verse_num}"
            verses[verse_ref] = self._clean_text(current_verse_text)
        
        if not verses:
            raise ValueError("No verses found in USFM file")
        
        return verses
    
    def _validate_usfm_content(self, content: str) -> bool:
        """Validate that content contains basic USFM structure."""
        # Must have at least an \id marker and some verses
        has_id = bool(re.search(r'\\id\s+[A-Z0-9]{3}', content))
        has_verses = bool(re.search(r'\\v\s+\d+', content))
        return has_id and has_verses
    
    def _clean_text(self, text: str) -> str:
        """Clean verse text by removing USFM markers and normalizing whitespace."""
        if not text:
            return ""
        
        # Remove USFM markers (anything starting with backslash)
        text = re.sub(r'\\[a-zA-Z]+\d*\*?', '', text)
        
        # Remove footnotes and cross-references
        text = re.sub(r'\\f\s+.*?\\f\*', '', text)
        text = re.sub(r'\\x\s+.*?\\x\*', '', text)
        
        # Remove character markers like \add...\add*, \nd...\nd*, etc.
        text = re.sub(r'\\[a-zA-Z]+\s+([^\\]*?)\\[a-zA-Z]+\*', r'\1', text)
        
        # Remove any remaining backslash sequences
        text = re.sub(r'\\[^\s]*', '', text)
        
        # Clean up whitespace
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()
        
        return text


class EBibleBuilder:
    """Builder for creating eBible format files from USFM data."""
    
    def __init__(self, vref_file_path: str):
        """
        Initialize with the verse reference file.
        
        Args:
            vref_file_path: Path to the vref.txt file
        """
        self.verse_to_line = {}
        
        with open(vref_file_path, 'r') as f:
            for line_num, verse_ref in enumerate(f, 1):
                verse_ref = verse_ref.strip()
                if verse_ref:
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
        total_verses = len(self.verse_to_line)
        ebible_lines = existing_ebible[:] if existing_ebible else [''] * total_verses
        
        for verse_ref, verse_text in usfm_verses.items():
            if verse_ref in self.verse_to_line:
                line_index = self.verse_to_line[verse_ref] - 1
                if 0 <= line_index < len(ebible_lines):
                    ebible_lines[line_index] = verse_text
                
        return ebible_lines
        
    def get_completion_stats(self, ebible_lines: List[str]) -> Dict:
        """
        Get statistics about Bible completion.
        
        Args:
            ebible_lines: The eBible format lines
            
        Returns:
            Dict with completion statistics
        """
        total_verses = len(ebible_lines)
        filled_verses = sum(1 for line in ebible_lines if line.strip())
        completion_percentage = (filled_verses / total_verses) * 100 if total_verses > 0 else 0
        
        return {
            'total_verses': total_verses,
            'filled_verses': filled_verses,
            'missing_verses': total_verses - filled_verses,
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
            if not line.strip() and i < len(self.verse_to_line):
                missing_refs.append(list(self.verse_to_line.keys())[i])
                
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


# Example usage and simple test
if __name__ == "__main__":
    # Example USFM content
    sample_usfm = """\\id ROM
\\h Romans
\\toc1 The Letter of Paul to the Romans
\\toc2 Romans
\\mt1 Romans
\\c 1
\\v 1 Paul, a servant of Jesus Christ, called to be an apostle, separated unto the gospel of God,
\\v 2 Which he had promised before by his prophets in the holy scriptures,
\\c 8
\\v 1 There is therefore now no condemnation to them which are in Christ Jesus.
\\v 2 For the law of the Spirit of life in Christ Jesus has made me free from the law of sin and death.
"""
    
    parser = USFMParser()
    try:
        verses = parser.parse_file(sample_usfm, "test.usfm")
        print(f"Successfully parsed {len(verses)} verses:")
        for ref, text in sorted(verses.items()):
            print(f"  {ref}: {text[:50]}...")
    except Exception as e:
        print(f"Error parsing USFM: {e}") 