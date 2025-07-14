# CodexZero Testing

Simple test suite for CodexZero focusing on critical functionality.

## Quick Start

Run all tests:
```bash
python run_tests.py
```

Or run tests manually:
```bash
pip install -r requirements-test.txt
python -m pytest tests/ -v
```

## What We Test

### 🛠️ **Utility Functions** (`test_utils.py`)
- **Text sanitization** - XSS prevention and input cleaning
- **USFM detection** - Biblical file format identification  
- **File validation** - Line count and size limits

### 🔐 **Project Access Control** (`test_project_access.py`)
- **Permission checking** - Role-based access control
- **Role hierarchy** - Owner > Editor > Viewer permissions
- **Security validation** - Unauthorized access prevention

## Test Structure

```
tests/
├── conftest.py           # Test configuration & fixtures
├── test_utils.py         # Utility function tests
└── test_project_access.py # Access control tests
```

## Key Features

- **Isolated testing** - Uses SQLite in-memory database
- **No external APIs** - Tests pure Python logic only
- **Fast execution** - Runs in under 10 seconds
- **Simple setup** - Just install and run

## Running Specific Tests

```bash
# Run only utility tests
python -m pytest tests/test_utils.py -v

# Run only access control tests  
python -m pytest tests/test_project_access.py -v

# Run tests with coverage
python -m pytest tests/ --cov=utils --cov=models

# Run a specific test function
python -m pytest tests/test_utils.py::TestSanitizeTextInput::test_sanitize_normal_text -v
```

## Why These Tests Matter

1. **Security** - Prevents XSS attacks and unauthorized access
2. **Reliability** - Ensures file handling works correctly
3. **Confidence** - Catch bugs before they reach production
4. **Documentation** - Tests show how functions should work

## Adding More Tests

To add tests for new functionality:

1. Create `test_new_feature.py` in the `tests/` directory
2. Import the functions you want to test
3. Write test classes and methods following existing patterns
4. Run `python -m pytest tests/test_new_feature.py -v`

Keep tests simple, focused, and fast! 