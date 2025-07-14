import os
from flask import Flask, send_file, request, jsonify, render_template
from flask_login import LoginManager, login_required
from datetime import datetime
import asyncio

from config import Config
from models import db, User
from auth import auth
from translation import translation
from routes.main import main
from routes.projects import projects
from routes.files import files
from routes.api import api
from routes.fine_tuning import fine_tuning
from routes.admin import admin
from routes.audio import audio
from routes.members import members
from ai.bot import Chatbot

def run_performance_migrations():
    """Run critical performance migrations automatically"""
    try:
        # Check what tables exist first
        inspector = db.inspect(db.engine)
        existing_tables = inspector.get_table_names()
        
        indexes_added = 0
        migrations_run = 0
        
        # Helper function to create index safely
        def create_index_safe(index_name, table_name, columns):
            try:
                sql = f"CREATE INDEX {index_name} ON {table_name}({columns});"
                with db.engine.connect() as conn:
                    conn.execute(db.text(sql))
                    conn.commit()
                return True
            except Exception as e:
                error_msg = str(e).lower()
                if "duplicate key name" in error_msg or "already exists" in error_msg:
                    return True  # Index already exists
                else:
                    print(f"Could not add {index_name}: {e}")
                    return False
        
        # Run verse edit history migration
        def run_verse_edit_history_migration():
            try:
                local_migrations = 0
                with db.engine.connect() as conn:
                    # Check if verse_edit_history table exists
                    result = conn.execute(db.text(
                        "SELECT COUNT(*) as count FROM information_schema.tables "
                        "WHERE table_schema = DATABASE() AND table_name = 'verse_edit_history'"
                    )).fetchone()
                    
                    if result.count == 0:
                        # Create verse_edit_history table
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
                            )
                        """))
                        print("✅ Created verse_edit_history table")
                        local_migrations += 1
                    
                    # Check if tracking columns exist in verses table
                    if 'verses' in existing_tables:
                        result = conn.execute(db.text(
                            "SELECT COUNT(*) as count FROM information_schema.columns "
                            "WHERE table_schema = DATABASE() AND table_name = 'verses' AND column_name = 'last_edited_by'"
                        )).fetchone()
                        
                        if result.count == 0:
                            # Add tracking columns to verses table
                            conn.execute(db.text("""
                                ALTER TABLE verses 
                                ADD COLUMN last_edited_by INT,
                                ADD COLUMN last_edited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                                ADD COLUMN edit_count INT DEFAULT 0,
                                ADD FOREIGN KEY (last_edited_by) REFERENCES users(id) ON DELETE SET NULL,
                                ADD INDEX idx_verse_last_edited (last_edited_by, last_edited_at)
                            """))
                            print("✅ Added edit tracking columns to verses table")
                            local_migrations += 1
                    
                    conn.commit()
                    return local_migrations
            except Exception as e:
                print(f"⚠️  Verse edit history migration warning: {e}")
                return 0
        
        # Run fine-tuning table migration  
        def run_fine_tuning_migration():
            try:
                local_migrations = 0
                if 'fine_tuning_jobs' not in existing_tables:
                    return 0
                    
                with db.engine.connect() as conn:
                    # List of columns to check and add
                    columns_to_add = [
                        ('source_text_id', 'INT'),
                        ('target_text_id', 'INT'),
                        ('display_name', 'VARCHAR(255)'),
                        ('hidden', 'BOOLEAN DEFAULT FALSE'),
                        ('is_instruction_tuning', 'BOOLEAN DEFAULT FALSE'),
                        ('query_text', 'TEXT'),
                        ('max_examples', 'INT'),
                        ('estimated_cost', 'DECIMAL(10,4)'),
                        ('actual_cost', 'DECIMAL(10,4)'),
                        ('trained_tokens', 'INT'),
                        ('started_at', 'TIMESTAMP NULL'),
                        ('completed_at', 'TIMESTAMP NULL')
                    ]
                    
                    # Check and add each column individually
                    for column_name, column_def in columns_to_add:
                        result = conn.execute(db.text(
                            "SELECT COUNT(*) as count FROM information_schema.columns "
                            "WHERE table_schema = DATABASE() AND table_name = 'fine_tuning_jobs' "
                            f"AND column_name = '{column_name}'"
                        )).fetchone()
                        
                        if result.count == 0:
                            conn.execute(db.text(f"ALTER TABLE fine_tuning_jobs ADD COLUMN {column_name} {column_def}"))
                            print(f"✅ Added {column_name} column to fine_tuning_jobs")
                            local_migrations += 1
                    
                    # Add foreign keys if columns were added
                    if local_migrations > 0:
                        # Check if foreign keys exist
                        for fk_column in ['source_text_id', 'target_text_id']:
                            try:
                                conn.execute(db.text(f"""
                                    ALTER TABLE fine_tuning_jobs 
                                    ADD FOREIGN KEY ({fk_column}) REFERENCES texts(id) ON DELETE SET NULL
                                """))
                                print(f"✅ Added foreign key for {fk_column}")
                            except Exception:
                                pass  # Foreign key might already exist
                        
                        # Clean up orphaned jobs with missing text references
                        try:
                            result = conn.execute(db.text("""
                                DELETE FROM fine_tuning_jobs 
                                WHERE source_text_id IS NULL OR target_text_id IS NULL
                            """))
                            if result.rowcount > 0:
                                print(f"✅ Cleaned up {result.rowcount} orphaned fine-tuning jobs")
                        except Exception as e:
                            print(f"⚠️  Could not clean up orphaned jobs: {e}")
                    
                    conn.commit()
                    return local_migrations
            except Exception as e:
                print(f"⚠️  Fine-tuning migration warning: {e}")
                return 0
        
        # Run migrations first
        migrations_run = run_verse_edit_history_migration()
        migrations_run += run_fine_tuning_migration()
        
        # CRITICAL: The most important indexes for verse lookups
        if 'verses' in existing_tables:
            if create_index_safe('idx_verses_text_lookup', 'verses', 'text_id, verse_index'):
                indexes_added += 1
        
        if 'project_file_verses' in existing_tables:
            if create_index_safe('idx_project_file_verses_lookup', 'project_file_verses', 'project_file_id, verse_index'):
                indexes_added += 1
        
        if 'translation_verses' in existing_tables:
            if create_index_safe('idx_translation_verses_lookup', 'translation_verses', 'translation_id, verse_index'):
                indexes_added += 1
        
        if 'texts' in existing_tables:
            if create_index_safe('idx_texts_project_type', 'texts', 'project_id, text_type'):
                indexes_added += 1
        
        if 'projects' in existing_tables:
            if create_index_safe('idx_projects_user_updated', 'projects', 'user_id, updated_at'):
                indexes_added += 1
        
        # Summary message
        if migrations_run > 0 or indexes_added > 0:
            print(f"✅ Database setup complete: {migrations_run} migrations, {indexes_added} indexes")
        else:
            print("✅ Database already up to date")
            
    except Exception as e:
        print(f"⚠️  Could not run performance migrations: {e}")

def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    
    # Initialize extensions
    db.init_app(app)
    
    # Setup Login Manager
    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = 'Please log in to access this page.'
    login_manager.login_message_category = 'info'
    
    @login_manager.user_loader
    def load_user(user_id):
        return db.session.get(User, int(user_id))
    
    # Security headers
    @app.after_request
    def add_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline' cdn.tailwindcss.com cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' cdn.tailwindcss.com cdnjs.cloudflare.com fonts.googleapis.com; font-src 'self' fonts.gstatic.com cdnjs.cloudflare.com; img-src 'self' data:; media-src 'self' *.digitaloceanspaces.com; connect-src 'self';"
        return response
    
    # Error handlers to prevent information disclosure
    @app.errorhandler(404)
    def not_found_error(error):
        return render_template('base.html', error_title='Page Not Found', 
                             error_message='The requested page could not be found.'), 404
    
    @app.errorhandler(403)
    def forbidden_error(error):
        return render_template('base.html', error_title='Access Forbidden', 
                             error_message='You do not have permission to access this resource.'), 403
    
    @app.errorhandler(500)
    def internal_error(error):
        db.session.rollback()
        if app.config.get('DEBUG'):
            # In debug mode, show the actual error
            return render_template('base.html', error_title='Server Error', 
                                 error_message=str(error)), 500
        else:
            # In production, show generic message
            return render_template('base.html', error_title='Server Error', 
                                 error_message='An internal server error occurred. Please try again later.'), 500
    
    # Register blueprints
    app.register_blueprint(auth, url_prefix='/auth')
    app.register_blueprint(translation)
    app.register_blueprint(main)
    app.register_blueprint(projects)
    app.register_blueprint(files)
    app.register_blueprint(api)
    app.register_blueprint(fine_tuning)
    app.register_blueprint(admin)
    app.register_blueprint(audio)
    app.register_blueprint(members)
    
    # Static file serving routes
    @app.route('/static/<path:filename>')
    def serve_static(filename):
        """Serve static files"""
        return send_file(os.path.join('static', filename))

    @app.route('/favicon.ico')
    def favicon():
        """Serve favicon with proper headers"""
        response = send_file('static/favicon.ico', mimetype='image/vnd.microsoft.icon')
        response.headers['Cache-Control'] = 'public, max-age=86400'  # Cache for 1 day
        return response
    
    # Create database tables and run migrations
    with app.app_context():
        try:
            db.create_all()
            print("Database tables created successfully")
            
            # PERFORMANCE: Run critical performance migrations automatically
            run_performance_migrations()
            
        except Exception as e:
            print(f"Database connection failed during startup: {e}")
            print("App will start without database initialization")
    
    return app


app = create_app()

# Legacy demo translation endpoint removed - use project-based translation workflow instead
# The hardcoded Bible passages approach was not production-ready

if __name__ == '__main__':
    # Set development environment
    os.environ['FLASK_ENV'] = 'development'
    os.environ['DEVELOPMENT_MODE'] = 'true'
    
    # For development only - disable in production
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
    
    print("=" * 60)
    print("🚀 Starting CodexZero in DEVELOPMENT MODE")
    print("=" * 60)
    print("📍 App URL: http://localhost:5000")
    print("🔧 Dev Login: http://localhost:5000/dev")
    print("👤 Auto-login: Visit any page to automatically log in as 'Development User'")
    print("📚 Dashboard: http://localhost:5000/dashboard")
    print("")
    print("💡 To use Google OAuth instead, set DEVELOPMENT_MODE=false")
    print("=" * 60)
    
    app.run(debug=True, host='localhost', port=5000) 