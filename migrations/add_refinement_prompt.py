"""Add refinement prompt field to verses table"""

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
import os
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import Config

# Create app instance for migration
app = Flask(__name__)
app.config.from_object(Config)

# Initialize database
db = SQLAlchemy(app)

def run_migration():
    """Add refinement_prompt column to verses table"""
    
    with app.app_context():
        try:
            # Add refinement_prompt column
            from sqlalchemy import text
            db.session.execute(text("""
                ALTER TABLE verses 
                ADD COLUMN refinement_prompt TEXT DEFAULT NULL
            """))
            
            db.session.commit()
            print("✅ Successfully added refinement_prompt column to verses table")
            
        except Exception as e:
            if "Duplicate column name" in str(e) or "duplicate column" in str(e).lower():
                print("ℹ️  refinement_prompt column already exists")
            else:
                print(f"❌ Error adding refinement_prompt column: {e}")
                raise

if __name__ == "__main__":
    run_migration() 