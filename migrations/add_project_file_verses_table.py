#!/usr/bin/env python3
"""Add project_file_verses table for storing imported Bible texts in database"""

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
        print("Creating project_file_verses table...")
        
        # Create the project_file_verses table with MySQL syntax
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
        
        # Add missing columns to project_files table
        columns_to_add = [
            ('storage_type', 'VARCHAR(20) DEFAULT "file"', 'storage type'),
            ('line_count', 'INTEGER DEFAULT 0', 'line count'),
            ('paired_with_id', 'INTEGER', 'paired with ID'),
            ('purpose', 'VARCHAR(100)', 'purpose'),
            ('created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP', 'created at'),
            ('updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'updated at')
        ]
        
        for col_name, col_definition, description in columns_to_add:
            result = db.session.execute(text(f"""
                SELECT COUNT(*) 
                FROM information_schema.COLUMNS 
                WHERE TABLE_SCHEMA = DATABASE() 
                AND TABLE_NAME = 'project_files' 
                AND COLUMN_NAME = '{col_name}'
            """))
            
            if result.scalar() == 0:
                print(f"Adding {description} column to project_files table...")
                db.session.execute(text(f"""
                    ALTER TABLE project_files 
                    ADD COLUMN {col_name} {col_definition}
                """))
                print(f"✓ Added {description} column")
            else:
                print(f"✓ {description} column already exists")
        
        db.session.commit()
        print("Migration completed successfully!")
    
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
    print(f"Project file verses table migration failed: {e}") 