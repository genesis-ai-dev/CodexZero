#!/usr/bin/env python3
"""
Migration script to update the database schema for fine-tuning and translation model selection.
This script handles:
1. Adding new columns to existing tables
2. Updating existing fine-tuning jobs with new model names
3. Adding translation model selection to projects
"""

from app import app, db
from models import FineTuningJob, Project
from sqlalchemy import text
import sys

def migrate_database():
    """Run all necessary migrations"""
    
    with app.app_context():
        print("Starting database migration...")
        
        # Create all tables (this is safe and won't affect existing tables)
        db.create_all()
        print("✓ Ensured all tables exist")
        
        # Add base_model column to fine_tuning_jobs if it doesn't exist
        try:
            db.session.execute(text("SELECT base_model FROM fine_tuning_jobs LIMIT 1"))
            print("✓ base_model column already exists")
        except Exception:
            print("Adding base_model column to fine_tuning_jobs...")
            db.session.execute(text("ALTER TABLE fine_tuning_jobs ADD COLUMN base_model VARCHAR(255) DEFAULT 'gpt-4o-mini'"))
            db.session.commit()
            print("✓ Added base_model column")
        
        # Add hidden column to fine_tuning_jobs if it doesn't exist
        try:
            db.session.execute(text("SELECT hidden FROM fine_tuning_jobs LIMIT 1"))
            print("✓ hidden column already exists")
        except Exception:
            print("Adding hidden column to fine_tuning_jobs...")
            db.session.execute(text("ALTER TABLE fine_tuning_jobs ADD COLUMN hidden BOOLEAN DEFAULT FALSE"))
            db.session.commit()
            print("✓ Added hidden column")
        
        # Add estimated_cost column to fine_tuning_jobs if it doesn't exist
        try:
            db.session.execute(text("SELECT estimated_cost FROM fine_tuning_jobs LIMIT 1"))
            print("✓ estimated_cost column already exists")
        except Exception:
            print("Adding estimated_cost column to fine_tuning_jobs...")
            db.session.execute(text("ALTER TABLE fine_tuning_jobs ADD COLUMN estimated_cost DECIMAL(10,4)"))
            db.session.commit()
            print("✓ Added estimated_cost column")
        
        # Add display_name column to fine_tuning_jobs if it doesn't exist
        try:
            db.session.execute(text("SELECT display_name FROM fine_tuning_jobs LIMIT 1"))
            print("✓ display_name column already exists")
        except Exception:
            print("Adding display_name column to fine_tuning_jobs...")
            db.session.execute(text("ALTER TABLE fine_tuning_jobs ADD COLUMN display_name VARCHAR(255)"))
            db.session.commit()
            print("✓ Added display_name column")
        
        # Add translation_model column to projects if it doesn't exist
        try:
            db.session.execute(text("SELECT translation_model FROM projects LIMIT 1"))
            print("✓ translation_model column already exists")
        except Exception:
            print("Adding translation_model column to projects...")
            db.session.execute(text("ALTER TABLE projects ADD COLUMN translation_model VARCHAR(255)"))
            db.session.commit()
            print("✓ Added translation_model column")
        
        # Add instruction fine-tuning columns if they don't exist
        try:
            db.session.execute(text("SELECT is_instruction_tuning FROM fine_tuning_jobs LIMIT 1"))
            print("✓ Instruction fine-tuning columns already exist")
        except Exception:
            print("Adding instruction fine-tuning columns...")
            db.session.execute(text("ALTER TABLE fine_tuning_jobs ADD COLUMN is_instruction_tuning BOOLEAN DEFAULT FALSE"))
            db.session.execute(text("ALTER TABLE fine_tuning_jobs ADD COLUMN query_text TEXT"))
            db.session.execute(text("ALTER TABLE fine_tuning_jobs ADD COLUMN max_examples INTEGER"))
            db.session.commit()
            print("✓ Added instruction fine-tuning columns")
        
        # Update existing fine-tuning jobs to use the new model names
        print("Updating existing fine-tuning job base models...")
        old_model_mapping = {
            'gpt-3.5-turbo': 'gpt-4o-mini',
            'gpt-4o-mini': 'gpt-4o-mini',  # Already correct
            'gpt-4o': 'gpt-4o',  # Already correct
            'gpt-4.1-mini-2025-04-14': 'gpt-4o-mini',  # Legacy to new
            'gpt-4.1-2025-04-14': 'gpt-4o',  # Legacy to new
            'gpt-4.1-nano-2025-04-14': 'gpt-4o-mini'  # Legacy nano to mini
        }
        
        jobs_updated = 0
        for job in FineTuningJob.query.all():
            if job.base_model in old_model_mapping:
                old_model = job.base_model
                new_model = old_model_mapping[old_model]
                job.base_model = new_model
                jobs_updated += 1
                print(f"  Updated job {job.id}: {old_model} → {new_model}")
        
        if jobs_updated > 0:
            db.session.commit()
            print(f"✓ Updated {jobs_updated} existing fine-tuning jobs")
        else:
            print("✓ No fine-tuning jobs needed model updates")
        
        # Update projects to use default translation model if none is set
        print("Setting default translation models for projects...")
        projects_updated = 0
        for project in Project.query.all():
            if not project.translation_model:
                # Use the project's method to get the default model
                default_model = project.get_default_translation_model()
                project.translation_model = default_model
                projects_updated += 1
                print(f"  Set project {project.id} ({project.target_language}) to use: {default_model}")
        
        if projects_updated > 0:
            db.session.commit()
            print(f"✓ Updated {projects_updated} projects with default translation models")
        else:
            print("✓ All projects already have translation models set")
        
        print("\n🎉 Migration completed successfully!")
        print("\nNext steps:")
        print("1. Test fine-tuning with new GPT-4o models")
        print("2. Test model selection in translation interface")
        print("3. Verify cost estimates are accurate")

if __name__ == "__main__":
    try:
        migrate_database()
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        print("Please check the error and try again.")
        sys.exit(1) 