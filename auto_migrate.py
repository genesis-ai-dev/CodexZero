"""Automatic database migration for verse storage"""

import os
from flask import Flask
from sqlalchemy import text
from models import db

def run_migrations(app):
    """Run all necessary migrations for verse storage"""
    with app.app_context():
        try:
            # Check if migrations already ran
            result = db.session.execute(text(
                "SELECT COUNT(*) FROM information_schema.tables "
                "WHERE table_schema = DATABASE() "
                "AND table_name = 'translation_verses'"
            ))
            
            if result.scalar() == 0:
                print("Running database migrations for verse storage...")
                
                # Create translation_verses table
                db.session.execute(text("""
                    CREATE TABLE IF NOT EXISTS translation_verses (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        translation_id INT NOT NULL,
                        verse_index INT NOT NULL,
                        verse_text TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (translation_id) REFERENCES translations(id) ON DELETE CASCADE,
                        UNIQUE KEY unique_translation_verse (translation_id, verse_index),
                        INDEX idx_translation_verses_lookup (translation_id, verse_index)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """))
                
                # Create project_file_verses table
                db.session.execute(text("""
                    CREATE TABLE IF NOT EXISTS project_file_verses (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        project_file_id INT NOT NULL,
                        verse_index INT NOT NULL,
                        verse_text TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (project_file_id) REFERENCES project_files(id) ON DELETE CASCADE,
                        UNIQUE KEY unique_file_verse (project_file_id, verse_index),
                        INDEX idx_file_verses (project_file_id, verse_index)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
                """))
                
                # Add storage_type columns if they don't exist
                for table in ['translations', 'project_files']:
                    col_check = db.session.execute(text(f"""
                        SELECT COUNT(*) FROM information_schema.COLUMNS 
                        WHERE TABLE_SCHEMA = DATABASE() 
                        AND TABLE_NAME = '{table}' 
                        AND COLUMN_NAME = 'storage_type'
                    """))
                    
                    if col_check.scalar() == 0:
                        db.session.execute(text(f"""
                            ALTER TABLE {table} 
                            ADD COLUMN storage_type VARCHAR(20) DEFAULT 'file'
                        """))
                
                db.session.commit()
                print("✓ Database migrations completed successfully!")
                
                # Optionally run data migration in background
                if os.getenv('AUTO_MIGRATE_DATA', 'false').lower() == 'true':
                    print("Note: Set AUTO_MIGRATE_DATA=true to automatically migrate existing data")
                
        except Exception as e:
            print(f"Migration check/run failed: {e}")
            # Don't crash the app if migrations fail
            db.session.rollback() 