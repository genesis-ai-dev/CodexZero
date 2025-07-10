import os
from flask import Flask, send_file, request, jsonify
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
    
    # Create database tables (only if database is accessible)
    with app.app_context():
        try:
            db.create_all()
            print("Database tables created successfully")
            
            # Run migrations if needed
            try:
                from sqlalchemy import text
                # Check if project_members table exists
                result = db.session.execute(text("SHOW TABLES LIKE 'project_members'")).fetchone()
                if not result:
                    print("Running project members migration...")
                    from migrations.add_project_members import migrate, migrate_existing_projects
                    migrate()
                    migrate_existing_projects()
                    print("✓ Migration completed successfully")
                
                # Check if created_by column exists in projects table
                try:
                    db.session.execute(text("SELECT created_by FROM projects LIMIT 1"))
                except Exception:
                    print("Adding missing created_by column to projects table...")
                    db.session.execute(text("""
                        ALTER TABLE projects 
                        ADD COLUMN created_by INT,
                        ADD FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
                    """))
                    db.session.execute(text("""
                        UPDATE projects 
                        SET created_by = user_id 
                        WHERE created_by IS NULL
                    """))
                    db.session.commit()
                    print("✓ Added created_by column successfully")
                    
            except Exception as e:
                print(f"Migration check failed (this is normal for new installations): {e}")
                
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