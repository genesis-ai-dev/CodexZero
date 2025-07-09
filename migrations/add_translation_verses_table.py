#!/usr/bin/env python3
"""Add translation_verses table for storing Bible translations in database"""

import os
import sys
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask
from models import db
from sqlalchemy import text

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'sqlite:///bible_app.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return app

def migrate():
    from flask import has_app_context
    
    def run_migration():
        print("Creating translation_verses table...")
        
        # Create the translation_verses table with MySQL syntax
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS translation_verses (
                id INTEGER PRIMARY KEY AUTO_INCREMENT,
                translation_id INTEGER NOT NULL,
                verse_index INTEGER NOT NULL,
                verse_text TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                
                FOREIGN KEY (translation_id) REFERENCES translations(id) ON DELETE CASCADE,
                UNIQUE KEY unique_translation_verse (translation_id, verse_index),
                INDEX idx_translation_verses_lookup (translation_id, verse_index)
            )
        """))
        
        # Add missing columns to translations table
        columns_to_add = [
            ('storage_type', 'VARCHAR(20) DEFAULT "file"', 'storage type'),
            ('total_verses', 'INTEGER DEFAULT 41899', 'total verses'),
            ('non_empty_verses', 'INTEGER DEFAULT 0', 'non-empty verses'),
            ('progress_percentage', 'FLOAT DEFAULT 0.0', 'progress percentage')
        ]
        
        for col_name, col_definition, description in columns_to_add:
            try:
                db.session.execute(text(f"SELECT {col_name} FROM translations LIMIT 1"))
                print(f"✓ {description} column already exists")
            except Exception:
                print(f"Adding {description} column to translations...")
                db.session.execute(text(f"""
                    ALTER TABLE translations ADD COLUMN {col_name} {col_definition}
                """))
                print(f"✓ Added {description} column")
        
        db.session.commit()
        print("✓ Database schema updated successfully")
    
    if has_app_context():
        run_migration()
    else:
        app = create_app()
        with app.app_context():
            run_migration()

# Run migration when imported
try:
    migrate()
except Exception as e:
    print(f"Translation verses table migration failed: {e}") 