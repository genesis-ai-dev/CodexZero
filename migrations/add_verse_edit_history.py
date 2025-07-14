#!/usr/bin/env python3
"""
Migration: Add Verse Edit History System

This migration adds:
1. verse_edit_history table for tracking all verse edits
2. Enhanced verses table with edit tracking fields
3. Proper indexes for performance

Run with: python migrations/add_verse_edit_history.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models import db
from app import create_app

def run_migration():
    """Run the verse edit history migration"""
    app = create_app()
    
    with app.app_context():
        try:
            print("Starting verse edit history migration...")
            
            # Create verse_edit_history table
            with db.engine.connect() as conn:
                conn.execute(db.text("""
                    CREATE TABLE verse_edit_history (
                        id INT AUTO_INCREMENT PRIMARY KEY,
                        text_id INT NOT NULL,
                        verse_index INT NOT NULL,
                        previous_text TEXT,
                        new_text TEXT NOT NULL,
                        edited_by INT NOT NULL,
                        edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        edit_type ENUM('create', 'update', 'delete', 'revert') NOT NULL DEFAULT 'update',
                        edit_source ENUM('manual', 'ai_translation', 'import', 'bulk_operation') NOT NULL DEFAULT 'manual',
                        edit_comment TEXT,
                        confidence_score DECIMAL(3,2),
                        
                        FOREIGN KEY (text_id) REFERENCES texts(id) ON DELETE CASCADE,
                        FOREIGN KEY (edited_by) REFERENCES users(id) ON DELETE SET NULL,
                        
                        INDEX idx_verse_history (text_id, verse_index, edited_at),
                        INDEX idx_user_edits (edited_by, edited_at),
                        INDEX idx_text_recent (text_id, edited_at DESC)
                    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
                """))
                conn.commit()
            print("✓ Created verse_edit_history table")
            
            # Add tracking columns to verses table
            with db.engine.connect() as conn:
                conn.execute(db.text("""
                    ALTER TABLE verses ADD COLUMN 
                        last_edited_by INT,
                    ADD COLUMN 
                        last_edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    ADD COLUMN 
                        edit_count INT DEFAULT 0,
                    ADD CONSTRAINT fk_verses_last_edited_by 
                        FOREIGN KEY (last_edited_by) REFERENCES users(id) ON DELETE SET NULL,
                    ADD INDEX idx_verse_last_edited (last_edited_by, last_edited_at);
                """))
                conn.commit()
            print("✓ Enhanced verses table with tracking fields")
            
            print("Migration completed successfully!")
            
        except Exception as e:
            print(f"Migration failed: {e}")
            raise

if __name__ == "__main__":
    run_migration() 