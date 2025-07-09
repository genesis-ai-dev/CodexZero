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
    app = create_app()
    
    with app.app_context():
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
        
        # Check if storage_type column exists before adding it
        result = db.session.execute(text("""
            SELECT COUNT(*) 
            FROM information_schema.COLUMNS 
            WHERE TABLE_SCHEMA = DATABASE() 
            AND TABLE_NAME = 'project_files' 
            AND COLUMN_NAME = 'storage_type'
        """))
        
        if result.scalar() == 0:
            print("Adding storage_type column to project_files table...")
            db.session.execute(text("""
                ALTER TABLE project_files 
                ADD COLUMN storage_type VARCHAR(20) DEFAULT 'file'
            """))
        else:
            print("storage_type column already exists")
        
        db.session.commit()
        print("Migration completed successfully!")

if __name__ == '__main__':
    migrate() 