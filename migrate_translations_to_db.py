#!/usr/bin/env python3
"""Migrate existing file-based translations to database storage"""

import os
import sys
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from sqlalchemy import text
from models import db, Translation, TranslationVerse, Project
from utils.translation_manager import TranslationFileManager
from storage import get_storage

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///bible_app.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-key')
    db.init_app(app)
    return app

def migrate_translation_to_database(translation):
    """Migrate a single translation from file to database"""
    print(f"\n  Migrating translation: {translation.name} (ID: {translation.id})")
    
    if not translation.storage_path:
        print("    ⚠️  No storage path found, skipping")
        return False
    
    try:
        # Load existing file data
        manager = TranslationFileManager(translation.storage_path)
        verses = manager.load_translation_file()
        
        # Count non-empty verses
        non_empty_count = sum(1 for v in verses if v.strip())
        print(f"    📖 Found {non_empty_count:,} non-empty verses out of {len(verses):,} total")
        
        # Prepare verses for bulk insert
        verse_objects = []
        for i, verse_text in enumerate(verses):
            if verse_text.strip():  # Only insert non-empty verses
                verse_objects.append({
                    'translation_id': translation.id,
                    'verse_index': i,
                    'verse_text': verse_text.strip()
                })
        
        # Bulk insert all verses at once
        if verse_objects:
            batch_size = 1000
            for i in range(0, len(verse_objects), batch_size):
                batch = verse_objects[i:i + batch_size]
                db.session.bulk_insert_mappings(TranslationVerse, batch)
                print(f"    ✓ Inserted batch {i//batch_size + 1}/{(len(verse_objects) + batch_size - 1)//batch_size} ({len(batch)} verses)")
        
        # Update translation metadata
        translation.storage_type = 'database'
        translation.translated_verses = len(verse_objects)
        translation.progress_percentage = (len(verse_objects) / 31170) * 100
        translation.updated_at = datetime.utcnow()
        
        db.session.commit()
        print(f"    ✅ Successfully migrated {len(verse_objects):,} verses")
        return True
        
    except Exception as e:
        print(f"    ❌ Error: {str(e)}")
        db.session.rollback()
        return False

def main():
    app = create_app()
    
    with app.app_context():
        print("🚀 Starting translation migration to database storage")
        print("=" * 60)
        
        # Get all translations that are still file-based
        file_translations = Translation.query.filter(
            (Translation.storage_type == None) | (Translation.storage_type == 'file')
        ).all()
        
        if not file_translations:
            print("No file-based translations found. Nothing to migrate!")
            return
        
        print(f"Found {len(file_translations)} translations to migrate")
        
        # Group by project for better organization
        projects = {}
        for trans in file_translations:
            if trans.project_id not in projects:
                project = Project.query.get(trans.project_id)
                projects[trans.project_id] = {
                    'project': project,
                    'translations': []
                }
            projects[trans.project_id]['translations'].append(trans)
        
        # Migrate each project's translations
        total_success = 0
        total_failed = 0
        
        for project_id, data in projects.items():
            project = data['project']
            translations = data['translations']
            
            print(f"\n📁 Project: {project.target_language} (ID: {project_id})")
            print(f"   User: {project.user.email}")
            print(f"   Translations: {len(translations)}")
            
            for translation in translations:
                if migrate_translation_to_database(translation):
                    total_success += 1
                else:
                    total_failed += 1
        
        # Summary
        print("\n" + "=" * 60)
        print("📊 Migration Summary:")
        print(f"   ✅ Successful: {total_success}")
        print(f"   ❌ Failed: {total_failed}")
        print(f"   📈 Total: {total_success + total_failed}")
        
        if total_failed > 0:
            print("\n⚠️  Some translations failed to migrate. Check the errors above.")
        else:
            print("\n🎉 All translations migrated successfully!")

if __name__ == '__main__':
    start_time = time.time()
    main()
    elapsed = time.time() - start_time
    print(f"\n⏱️  Migration completed in {elapsed:.1f} seconds") 