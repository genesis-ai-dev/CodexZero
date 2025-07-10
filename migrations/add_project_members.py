#!/usr/bin/env python3
"""
Migration to add multi-member support to projects
"""

import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask
from sqlalchemy import text
from models import db

def create_app():
    app = Flask(__name__)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'mysql+pymysql://codex_zero:codex_pass@localhost/codex_db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-key')
    db.init_app(app)
    return app

def migrate():
    app = create_app()
    
    with app.app_context():
        print("Adding multi-member support to projects...")
        
        # Create project_members table
        db.session.execute(text("""
            CREATE TABLE IF NOT EXISTS project_members (
                id INT AUTO_INCREMENT PRIMARY KEY,
                project_id INT NOT NULL,
                user_id INT NOT NULL,
                role ENUM('owner', 'editor', 'viewer') NOT NULL DEFAULT 'viewer',
                invited_by INT,
                invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                accepted_at TIMESTAMP NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
                
                UNIQUE KEY unique_project_user (project_id, user_id),
                INDEX idx_project_members_project (project_id),
                INDEX idx_project_members_user (user_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """))
        
        # Add created_by column to projects table (for tracking original creator)
        try:
            db.session.execute(text("SELECT created_by FROM projects LIMIT 1"))
            print("✓ created_by column already exists")
        except Exception:
            print("Adding created_by column to projects...")
            db.session.execute(text("""
                ALTER TABLE projects 
                ADD COLUMN created_by INT,
                ADD FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
            """))
            print("✓ Added created_by column")
        
        db.session.commit()
        print("✓ Multi-member support migration completed")

def migrate_existing_projects():
    """Migrate existing single-owner projects to multi-member system"""
    app = create_app()
    
    with app.app_context():
        print("Migrating existing projects to multi-member system...")
        
        # Set created_by for existing projects
        db.session.execute(text("""
            UPDATE projects 
            SET created_by = user_id 
            WHERE created_by IS NULL
        """))
        
        # Create owner memberships for existing projects
        db.session.execute(text("""
            INSERT INTO project_members (project_id, user_id, role, invited_by, accepted_at)
            SELECT p.id, p.user_id, 'owner', p.user_id, p.created_at
            FROM projects p
            LEFT JOIN project_members pm ON p.id = pm.project_id AND p.user_id = pm.user_id
            WHERE pm.id IS NULL
        """))
        
        db.session.commit()
        print("✓ Existing projects migrated to multi-member system")

if __name__ == '__main__':
    migrate()
    migrate_existing_projects() 