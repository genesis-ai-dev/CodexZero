import os
import sys

# Ensure project root is in Python path
project_root = os.path.dirname(os.path.abspath(__file__))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run()