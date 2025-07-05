#!/usr/bin/env python3
"""
Migration script to replace file pairing system with file purpose system.
This script:
1. Adds purpose_description and file_purpose columns to project_files table
2. Migrates existing FilePair data to file purposes
3. Removes the file_pairs table
"""

import os
import sys
from sqlalchemy import create_engine, text, inspect

def run_migration():
    """Migrate from file pairing system to file purpose system."""
    
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
        inspector = inspect(engine)
        
        # Check if migration has already been applied
        project_files_columns = [col['name'] for col in inspector.get_columns('project_files')]
        
        if 'purpose_description' in project_files_columns:
            print("✓ Migration already applied: purpose system columns exist")
            return
        
        with engine.connect() as conn:
            print("Starting migration from file pairing to file purpose system...")
            
            # Step 1: Add new columns to project_files table
            print("1. Adding purpose columns to project_files table...")
            conn.execute(text("""
                ALTER TABLE project_files 
                ADD COLUMN purpose_description TEXT,
                ADD COLUMN file_purpose VARCHAR(100)
            """))
            
            # Step 2: Migrate existing file pair data if file_pairs table exists
            tables = inspector.get_table_names()
            if 'file_pairs' in tables:
                print("2. Migrating existing file pair data...")
                
                # Get all file pairs with their instructions
                pairs_result = conn.execute(text("""
                    SELECT fp.file1_id, fp.file2_id, fp.instructions, 
                           pf1.original_filename as file1_name,
                           pf2.original_filename as file2_name
                    FROM file_pairs fp
                    JOIN project_files pf1 ON fp.file1_id = pf1.id
                    JOIN project_files pf2 ON fp.file2_id = pf2.id
                """))
                
                pairs = pairs_result.fetchall()
                migrated_pairs = 0
                
                for pair in pairs:
                    file1_id, file2_id, instructions, file1_name, file2_name = pair
                    
                    # Create purpose descriptions based on pair instructions
                    if instructions and instructions.strip():
                        # Use the pair instructions as context for both files
                        purpose_context = instructions.strip()
                        file1_purpose = f"Source text - {purpose_context}"
                        file2_purpose = f"Target text - {purpose_context}"
                    else:
                        # Generic purposes if no instructions
                        file1_purpose = f"Source text (paired with {file2_name})"
                        file2_purpose = f"Target text (paired with {file1_name})"
                    
                    # Update file1
                    conn.execute(text("""
                        UPDATE project_files 
                        SET purpose_description = :purpose, file_purpose = 'source'
                        WHERE id = :file_id AND purpose_description IS NULL
                    """), {"purpose": file1_purpose, "file_id": file1_id})
                    
                    # Update file2
                    conn.execute(text("""
                        UPDATE project_files 
                        SET purpose_description = :purpose, file_purpose = 'target'
                        WHERE id = :file_id AND purpose_description IS NULL
                    """), {"purpose": file2_purpose, "file_id": file2_id})
                    
                    migrated_pairs += 1
                
                print(f"   Migrated {migrated_pairs} file pairs to purpose descriptions")
                
                # Step 3: Set default purposes for unpaired files
                print("3. Setting default purposes for unpaired files...")
                unpaired_result = conn.execute(text("""
                    UPDATE project_files 
                    SET purpose_description = 'Reference text',
                        file_purpose = 'reference'
                    WHERE purpose_description IS NULL
                """))
                
                unpaired_count = unpaired_result.rowcount
                print(f"   Set default purposes for {unpaired_count} unpaired files")
                
                # Step 4: Drop the file_pairs table
                print("4. Removing file_pairs table...")
                conn.execute(text("DROP TABLE file_pairs"))
                print("   ✓ Removed file_pairs table")
                
            else:
                print("2. No file_pairs table found, setting default purposes...")
                # If no file_pairs table, just set default purposes
                conn.execute(text("""
                    UPDATE project_files 
                    SET purpose_description = 'Reference text',
                        file_purpose = 'reference'
                    WHERE purpose_description IS NULL
                """))
            
            # Commit all changes
            conn.commit()
            print("✓ Migration completed successfully!")
            print("\nSummary:")
            print("- Added purpose_description and file_purpose columns to project_files")
            print("- Migrated existing file pair data to file purposes")
            print("- Removed file_pairs table")
            print("- Set default purposes for all files")
            
    except Exception as e:
        print(f"ERROR during migration: {str(e)}")
        sys.exit(1)
    finally:
        engine.dispose()

print("Running file pairing to file purpose migration...")
run_migration()
print("Migration complete!") 