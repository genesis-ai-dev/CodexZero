#!/usr/bin/env python3
"""Migrate existing project files to database storage"""

import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from sqlalchemy import text
from models import db, ProjectFile, ProjectFileVerse
from storage import get_storage
from translation import simple_decode_utf8

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///bible_app.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-key')
    db.init_app(app)
    return app

def should_migrate_file(project_file):
    """Check if a file should be migrated to verse storage"""
    # Skip JSONL files (training data)
    if project_file.original_filename.endswith('.jsonl'):
        return False
    
    # Skip RTF files (these are not plain text)
    if project_file.original_filename.endswith('.rtf'):
        return False
    
    # Only migrate text and eBible files
    if project_file.file_type not in ['text', 'ebible', 'back_translation']:
        return False
    
    return True

def migrate_project_file_to_database(project_file):
    """Migrate a single project file from file storage to database storage"""
    print(f"\nMigrating file: {project_file.original_filename}")
    
    try:
        # Skip if already migrated
        if project_file.storage_type == 'database':
            print("  Already migrated to database")
            return True
        
        # Get the file content
        storage = get_storage()
        file_content = storage.get_file(project_file.storage_path)
        content = simple_decode_utf8(file_content)
        lines = content.split('\n')
        
        print(f"  Found {len(lines)} lines")
        
        # Prepare batch insert data
        verses_data = []
        for i, line in enumerate(lines):
            if line.strip():  # Only store non-empty lines
                verses_data.append({
                    'project_file_id': project_file.id,
                    'verse_index': i,
                    'verse_text': line.strip()
                })
        
        print(f"  Storing {len(verses_data)} non-empty verses")
        
        # Bulk insert verses
        if verses_data:
            # Use bulk_insert_mappings for better performance
            db.session.bulk_insert_mappings(ProjectFileVerse, verses_data)
        
        # Update the project file to indicate database storage
        project_file.storage_type = 'database'
        db.session.add(project_file)
        db.session.commit()
        
        print(f"  ✓ Successfully migrated {len(verses_data)} verses")
        return True
        
    except Exception as e:
        print(f"  ✗ Error migrating file: {str(e)}")
        db.session.rollback()
        return False

def main():
    app = create_app()
    
    with app.app_context():
        print("Starting project file migration to database...")
        
        # Get all project files that are still using file storage
        project_files = ProjectFile.query.filter(
            (ProjectFile.storage_type == 'file') | (ProjectFile.storage_type == None)
        ).all()
        
        if not project_files:
            print("No project files to migrate!")
            return
        
        # Filter files that should be migrated
        files_to_migrate = [f for f in project_files if should_migrate_file(f)]
        
        print(f"Found {len(files_to_migrate)} Bible text files to migrate (skipping {len(project_files) - len(files_to_migrate)} non-Bible files)")
        
        success_count = 0
        failed_count = 0
        
        for project_file in files_to_migrate:
            if migrate_project_file_to_database(project_file):
                success_count += 1
            else:
                failed_count += 1
        
        print(f"\nMigration complete!")
        print(f"  Successfully migrated: {success_count}")
        print(f"  Failed: {failed_count}")
        
        if failed_count > 0:
            print("\n⚠️  Some files failed to migrate. Check the errors above.")
        else:
            print("\n✓ All Bible text files successfully migrated to database storage!")

if __name__ == '__main__':
    main() 