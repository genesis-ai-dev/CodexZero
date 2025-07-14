import pytest
from utils import sanitize_text_input
from utils.file_helpers import detect_usfm_content, validate_text_file


class TestSanitizeTextInput:
    """Test the text input sanitization function for XSS prevention"""
    
    def test_sanitize_normal_text(self):
        """Test normal text passes through unchanged"""
        text = "Hello world"
        result = sanitize_text_input(text)
        assert result == "Hello world"
    
    def test_sanitize_removes_html_tags(self):
        """Test HTML tags are escaped/removed"""
        text = "Hello <script>alert('xss')</script> world"
        result = sanitize_text_input(text)
        assert "<script>" not in result
        # HTML is escaped, so 'alert' becomes part of escaped content
        assert "&lt;" in result or "alert" not in result or len(result) < len(text)
    
    def test_sanitize_removes_dangerous_chars(self):
        """Test dangerous characters are removed"""
        text = 'Hello "quotes" and <brackets> and `backticks`'
        result = sanitize_text_input(text)
        assert '"' not in result
        assert '<' not in result
        assert '>' not in result
        assert '`' not in result
    
    def test_sanitize_respects_max_length(self):
        """Test max_length parameter works"""
        text = "This is a very long text that should be truncated"
        result = sanitize_text_input(text, max_length=10)
        assert len(result) == 10
        assert result == "This is a "
    
    def test_sanitize_handles_none_and_empty(self):
        """Test edge cases with None and empty strings"""
        assert sanitize_text_input(None) is None
        assert sanitize_text_input("") == ""
        assert sanitize_text_input("   ") == ""
    
    def test_sanitize_handles_numbers(self):
        """Test numeric input is converted to string"""
        assert sanitize_text_input(123) == "123"
        assert sanitize_text_input(123.45) == "123.45"


class TestDetectUsfmContent:
    """Test USFM content detection for Biblical text files"""
    
    def test_detect_valid_usfm_content(self):
        """Test detection of valid USFM markers"""
        usfm_content = """\\id ROM
\\h Romans
\\c 1
\\v 1 Paul, a servant of Jesus Christ
\\v 2 Which he had promised before
\\c 2
\\v 1 Therefore you are inexcusable"""
        
        result = detect_usfm_content(usfm_content, "romans.usfm")
        assert result is True
    
    def test_detect_non_usfm_content(self):
        """Test rejection of non-USFM content"""
        plain_text = "This is just regular text without any USFM markers"
        result = detect_usfm_content(plain_text, "regular.txt")
        assert result is False
    
    def test_detect_requires_multiple_markers(self):
        """Test that multiple different USFM markers are required"""
        # Only one type of marker - should be False
        minimal_content = "\\v 1 Some verse text"
        result = detect_usfm_content(minimal_content, "test.usfm")
        assert result is False
        
        # Multiple marker types - should be True
        proper_content = "\\id ROM\\n\\c 1\\n\\v 1 Text\\n\\v 2 More text"
        result = detect_usfm_content(proper_content, "test.usfm")
        assert result is True
    
    def test_detect_wrong_file_extension(self):
        """Test that wrong file extension returns False"""
        usfm_content = "\\id ROM\\n\\c 1\\n\\v 1 Text"
        result = detect_usfm_content(usfm_content, "not_usfm.txt")
        assert result is False
    
    def test_detect_empty_content(self):
        """Test empty content returns False"""
        result = detect_usfm_content("", "test.usfm")
        assert result is False
        
        result = detect_usfm_content("   ", "test.usfm")
        assert result is False


class TestValidateTextFile:
    """Test text file validation for line count and requirements"""
    
    def test_validate_normal_file(self):
        """Test validation of normal text file"""
        content = "Line 1\nLine 2\nLine 3\nLine 4"
        result = validate_text_file(content, "test.txt")
        
        assert result['valid'] is True
        assert result['error'] is None
        assert result['line_count'] == 4
    
    def test_validate_too_few_lines(self):
        """Test rejection of files with too few lines"""
        content = "Only one line"
        result = validate_text_file(content, "test.txt")
        
        assert result['valid'] is False
        assert "must contain at least 2 lines" in result['error']
        assert result['line_count'] == 1
    
    def test_validate_minimum_valid_lines(self):
        """Test acceptance of exactly 2 lines (minimum)"""
        content = "Line 1\nLine 2"
        result = validate_text_file(content, "test.txt")
        
        assert result['valid'] is True
        assert result['error'] is None
        assert result['line_count'] == 2
    
    def test_validate_too_many_lines(self):
        """Test rejection of files with too many lines"""
        # Create content with over 50,000 lines
        lines = ["Line " + str(i) for i in range(50001)]
        content = "\n".join(lines)
        result = validate_text_file(content, "huge.txt")
        
        assert result['valid'] is False
        assert "exceeds maximum of 50,000 lines" in result['error']
        assert result['line_count'] == 50001
    
    def test_validate_empty_file(self):
        """Test rejection of empty files"""
        result = validate_text_file("", "empty.txt")
        
        assert result['valid'] is False
        # Empty string splitlines() gives [] not ['']
        assert result['line_count'] == 0
    
    def test_validate_includes_filename_in_error(self):
        """Test that filename is included in error messages"""
        content = "Only one line"
        result = validate_text_file(content, "my_file.txt")
        
        assert result['valid'] is False
        assert "my_file.txt" in result['error'] 