#!/usr/bin/env python3
"""
Basic test runner for CodexZero
Tests core functionality: user authentication and project creation
"""

import subprocess
import sys

def main():
    print("🧪 Running CodexZero Basic Tests")
    print("=" * 50)
    print("Testing:")
    print("  ✓ User login functionality")
    print("  ✓ Project creation")
    print("  ✓ Basic route access")
    print("=" * 50)
    
    try:
        # Run the basic tests
        result = subprocess.run([
            sys.executable, "-m", "pytest", 
            "tests/test_simple.py", "-v", "--tb=short"
        ], check=True)
        
        print("\n" + "=" * 50)
        print("✅ All basic tests passed!")
        print("🎉 Core functionality is working correctly")
        print("\nTested successfully:")
        print("  • Development login creates users")
        print("  • Project creation works") 
        print("  • Authentication is enforced")
        print("  • Dashboard displays projects")
        print("  • Basic routes are accessible")
        
    except subprocess.CalledProcessError:
        print("\n" + "=" * 50)
        print("❌ Some tests failed!")
        print("Please check the output above for details.")
        sys.exit(1)

if __name__ == "__main__":
    main() 