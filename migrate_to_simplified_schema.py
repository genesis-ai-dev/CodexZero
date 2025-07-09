#!/usr/bin/env python3
"""Migrate to simplified schema: consolidate ProjectFile/Translation into Text/Verse"""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from sqlalchemy import text
from models import db

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///bible_app.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-key')
    db.init_app(app)
    return app

def create_simplified_tables():
    """Create the new simplified tables"""
    print("Creating simplified tables...")
    
    # Create texts table
    db.session.execute(text("""
        CREATE TABLE IF NOT EXISTS texts (
            id INT PRIMARY KEY AUTO_INCREMENT,
            project_id INT NOT NULL,
            name VARCHAR(255) NOT NULL,
            text_type ENUM('source', 'draft', 'back_translation') NOT NULL,
            description TEXT,
            
            total_verses INT DEFAULT 31170,
            non_empty_verses INT DEFAULT 0,
            progress_percentage DECIMAL(5,2) DEFAULT 0.0,
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
            INDEX idx_project_texts (project_id, text_type)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """))
    
    # Create verses table
    db.session.execute(text("""
        CREATE TABLE IF NOT EXISTS verses (
            id INT PRIMARY KEY AUTO_INCREMENT,
            text_id INT NOT NULL,
            verse_index INT NOT NULL,
            verse_text TEXT NOT NULL DEFAULT '',
            
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            
            FOREIGN KEY (text_id) REFERENCES texts(id) ON DELETE CASCADE,
            UNIQUE KEY unique_text_verse (text_id, verse_index),
            INDEX idx_verse_lookup (text_id, verse_index)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """))
    
    db.session.commit()
    print("✓ Created simplified tables")

def migrate_project_files():
    """Migrate ProjectFile + ProjectFileVerse to Text + Verse"""
    print("\nMigrating project files...")
    
    # Get all project files with their verses
    files_result = db.session.execute(text("""
        SELECT id, project_id, original_filename, created_at, file_type
        FROM project_files 
        WHERE storage_type = 'database' OR storage_type IS NULL
    """))
    
    total_files = 0
    total_verses = 0
    
    for file_row in files_result:
        file_id, project_id, filename, created_at, file_type = file_row
        
        # Determine text_type based on file_type
        if file_type == 'back_translation':
            text_type = 'back_translation'
        else:
            text_type = 'source'
        
        # Create text record
        db.session.execute(text("""
            INSERT INTO texts (project_id, name, text_type, created_at)
            VALUES (:project_id, :name, :text_type, :created_at)
        """), {
            'project_id': project_id,
            'name': filename,
            'text_type': text_type,
            'created_at': created_at
        })
        
        text_id = db.session.execute(text("SELECT LAST_INSERT_ID()")).scalar()
        
        # Migrate verses
        verses_result = db.session.execute(text("""
            SELECT verse_index, verse_text
            FROM project_file_verses 
            WHERE project_file_id = :file_id
            ORDER BY verse_index
        """), {'file_id': file_id})
        
        verse_count = 0
        for verse_row in verses_result:
            verse_index, verse_text = verse_row
            
            db.session.execute(text("""
                INSERT INTO verses (text_id, verse_index, verse_text)
                VALUES (:text_id, :verse_index, :verse_text)
            """), {
                'text_id': text_id,
                'verse_index': verse_index,
                'verse_text': verse_text
            })
            verse_count += 1
        
        # Update progress
        progress = (verse_count / 31170) * 100
        db.session.execute(text("""
            UPDATE texts 
            SET non_empty_verses = :count, progress_percentage = :progress
            WHERE id = :text_id
        """), {
            'count': verse_count,
            'progress': progress,
            'text_id': text_id
        })
        
        total_files += 1
        total_verses += verse_count
        print(f"  ✓ {filename}: {verse_count} verses")
    
    db.session.commit()
    print(f"✓ Migrated {total_files} files ({total_verses:,} verses)")

def migrate_translations():
    """Migrate Translation + TranslationVerse to Text + Verse"""
    print("\nMigrating translations...")
    
    # Get all translations with their verses
    trans_result = db.session.execute(text("""
        SELECT id, project_id, name, created_at, description
        FROM translations 
        WHERE storage_type = 'database' OR storage_type IS NULL
    """))
    
    total_translations = 0
    total_verses = 0
    
    for trans_row in trans_result:
        trans_id, project_id, name, created_at, description = trans_row
        
        # Create text record
        db.session.execute(text("""
            INSERT INTO texts (project_id, name, text_type, description, created_at)
            VALUES (:project_id, :name, 'draft', :description, :created_at)
        """), {
            'project_id': project_id,
            'name': name,
            'description': description,
            'created_at': created_at
        })
        
        text_id = db.session.execute(text("SELECT LAST_INSERT_ID()")).scalar()
        
        # Migrate verses
        verses_result = db.session.execute(text("""
            SELECT verse_index, verse_text
            FROM translation_verses 
            WHERE translation_id = :trans_id
            ORDER BY verse_index
        """), {'trans_id': trans_id})
        
        verse_count = 0
        for verse_row in verses_result:
            verse_index, verse_text = verse_row
            
            db.session.execute(text("""
                INSERT INTO verses (text_id, verse_index, verse_text)
                VALUES (:text_id, :verse_index, :verse_text)
            """), {
                'text_id': text_id,
                'verse_index': verse_index,
                'verse_text': verse_text
            })
            verse_count += 1
        
        # Update progress
        progress = (verse_count / 31170) * 100
        db.session.execute(text("""
            UPDATE texts 
            SET non_empty_verses = :count, progress_percentage = :progress
            WHERE id = :text_id
        """), {
            'count': verse_count,
            'progress': progress,
            'text_id': text_id
        })
        
        total_translations += 1
        total_verses += verse_count
        print(f"  ✓ {name}: {verse_count} verses")
    
    db.session.commit()
    print(f"✓ Migrated {total_translations} translations ({total_verses:,} verses)")

def update_verse_audio_references():
    """Update VerseAudio to use new text IDs"""
    print("\nUpdating audio references...")
    
    # Update file_ references
    db.session.execute(text("""
        UPDATE verse_audio va
        JOIN project_files pf ON pf.id = CAST(SUBSTRING(va.text_id, 6) AS UNSIGNED)
        JOIN texts t ON t.project_id = pf.project_id AND t.name = pf.original_filename
        SET va.text_id = CONCAT('text_', t.id)
        WHERE va.text_id LIKE 'file_%'
    """))
    
    # Update translation_ references  
    db.session.execute(text("""
        UPDATE verse_audio va
        JOIN translations tr ON tr.id = CAST(SUBSTRING(va.text_id, 13) AS UNSIGNED)
        JOIN texts t ON t.project_id = tr.project_id AND t.name = tr.name AND t.text_type = 'draft'
        SET va.text_id = CONCAT('text_', t.id)
        WHERE va.text_id LIKE 'translation_%'
    """))
    
    db.session.commit()
    print("✓ Updated audio references")

def main():
    app = create_app()
    
    with app.app_context():
        print("🚀 Migrating to simplified schema")
        print("=" * 50)
        
        create_simplified_tables()
        migrate_project_files()
        migrate_translations()
        update_verse_audio_references()
        
        print("\n" + "=" * 50)
        print("✅ Migration completed successfully!")
        print("\nNext steps:")
        print("1. Update models.py with simplified Text/Verse models")
        print("2. Update application code to use new structure")
        print("3. Drop old tables when ready")

if __name__ == '__main__':
    main() 