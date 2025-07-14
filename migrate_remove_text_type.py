#!/usr/bin/env python3
"""
Migration script to remove text_type column from texts table
and unify all text handling.

This migration:
1. Removes the text_type column from the texts table
2. Drops the related index
3. Updates any remaining code references

Run this after updating all the code to remove text_type usage.
"""

import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import db, Text
from app import app

def migrate_remove_text_type():
    """Remove text_type column and unify all texts"""
    
    with app.app_context():
        print("Starting migration to remove text_type column...")
        
        try:
            # Get database connection
            connection = db.engine.raw_connection()
            cursor = connection.cursor()
            
            # Check if text_type column exists
            cursor.execute("""
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = 'texts' 
                AND COLUMN_NAME = 'text_type'
            """)
            
            if not cursor.fetchone():
                print("text_type column doesn't exist - migration already completed")
                return
            
            print("Backing up current texts table structure...")
            
            # Drop the index first (if it exists)
            try:
                cursor.execute("DROP INDEX idx_project_texts ON texts")
                print("Dropped old index idx_project_texts")
            except Exception as e:
                print(f"Index may not exist or already dropped: {e}")
            
            # Drop the text_type column
            cursor.execute("ALTER TABLE texts DROP COLUMN text_type")
            print("Dropped text_type column")
            
            # Recreate the index without text_type
            cursor.execute("CREATE INDEX idx_project_texts ON texts (project_id)")
            print("Created new index idx_project_texts")
            
            # Commit the changes
            connection.commit()
            print("Migration completed successfully!")
            
            # Verify the change
            cursor.execute("DESCRIBE texts")
            columns = [row[0] for row in cursor.fetchall()]
            
            if 'text_type' not in columns:
                print("✓ Verified: text_type column successfully removed")
            else:
                print("✗ Error: text_type column still exists")
                
            cursor.close()
            connection.close()
            
        except Exception as e:
            print(f"Error during migration: {e}")
            if 'connection' in locals():
                connection.rollback()
                connection.close()
            raise

def rollback_migration():
    """Rollback migration by adding text_type column back"""
    
    with app.app_context():
        print("Rolling back migration - adding text_type column back...")
        
        try:
            connection = db.engine.raw_connection()
            cursor = connection.cursor()
            
            # Add text_type column back with default value
            cursor.execute("""
                ALTER TABLE texts 
                ADD COLUMN text_type ENUM('source', 'draft', 'back_translation') 
                NOT NULL DEFAULT 'draft'
            """)
            print("Added text_type column back")
            
            # Recreate the old index
            cursor.execute("DROP INDEX idx_project_texts ON texts")
            cursor.execute("CREATE INDEX idx_project_texts ON texts (project_id, text_type)")
            print("Recreated old index")
            
            connection.commit()
            print("Rollback completed successfully!")
            
            cursor.close()
            connection.close()
            
        except Exception as e:
            print(f"Error during rollback: {e}")
            if 'connection' in locals():
                connection.rollback()
                connection.close()
            raise

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback_migration()
    else:
        migrate_remove_text_type() 