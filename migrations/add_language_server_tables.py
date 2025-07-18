"""
Migration: Add Language Server Tables
Adds ProjectDictionary and VerseAnalysis tables for language server functionality
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask
from sqlalchemy import text
from config import Config
from models import db

def create_language_server_tables():
    """Create the language server tables"""
    
    # ProjectDictionary table
    project_dictionary_sql = """
    CREATE TABLE IF NOT EXISTS project_dictionaries (
        id INT AUTO_INCREMENT PRIMARY KEY,
        project_id INT NOT NULL,
        word VARCHAR(255) NOT NULL,
        approved BOOLEAN DEFAULT TRUE,
        category VARCHAR(50) DEFAULT 'user',
        definition TEXT,
        alternatives TEXT,
        added_by INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE CASCADE,
        
        UNIQUE KEY unique_project_word (project_id, word),
        INDEX idx_project_dict (project_id, word),
        INDEX idx_project_dict_approved (project_id, approved)
    );
    """
    
    try:
        # Execute SQL statements
        db.session.execute(text(project_dictionary_sql))
        db.session.commit()
        
        print("✅ Language server tables created successfully!")
        return True
        
    except Exception as e:
        print(f"❌ Error creating language server tables: {e}")
        db.session.rollback()
        return False


def run_migration():
    """Run the migration"""
    app = Flask(__name__)
    app.config.from_object(Config)
    
    db.init_app(app)
    
    with app.app_context():
        print("🔄 Adding language server tables...")
        success = create_language_server_tables()
        
        if success:
            print("🎉 Migration completed successfully!")
        else:
            print("💥 Migration failed!")
            return False
    
    return True


if __name__ == '__main__':
    run_migration() 