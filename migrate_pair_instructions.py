#!/usr/bin/env python3
"""
Migration script to add instructions column to file_pairs table.
Run this before starting the application to ensure the database schema is up to date.
"""

import os
import sys
from sqlalchemy import create_engine, text, inspect

def run_migration():
    """Add instructions column to file_pairs table if it doesn't exist."""
    
    # Get database URL from environment or config
    database_url = os.environ.get('DATABASE_URL')
    
    if not database_url:
        # Try to load from config if not in environment
        try:
            from config import Config
            database_url = Config.SQLALCHEMY_DATABASE_URI
        except ImportError:
            print("ERROR: Could not find database URL. Set DATABASE_URL environment variable.")
            sys.exit(1)
    
    # Create engine
    engine = create_engine(database_url)
    
    try:
        # Check if the column already exists
        inspector = inspect(engine)
        columns = [col['name'] for col in inspector.get_columns('file_pairs')]
        
        if 'instructions' in columns:
            print("✓ Migration already applied: 'instructions' column exists in file_pairs table")
            return
        
        # Add the instructions column
        with engine.connect() as conn:
            print("Adding 'instructions' column to file_pairs table...")
            conn.execute(text("""
                ALTER TABLE file_pairs 
                ADD COLUMN instructions TEXT
            """))
            conn.commit()
            print("✓ Successfully added 'instructions' column to file_pairs table")
            
    except Exception as e:
        print(f"ERROR during migration: {str(e)}")
        sys.exit(1)
    finally:
        engine.dispose()

if __name__ == "__main__":
    print("Running file_pairs instructions migration...")
    run_migration()
    print("Migration complete!") 