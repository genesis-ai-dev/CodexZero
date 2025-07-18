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
from routes.flags import flags
from routes.notifications import notifications
from routes.language_server import language_server
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
    
    # Security headers
    @app.after_request
    def add_security_headers(response):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['X-XSS-Protection'] = '1; mode=block'
        response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline' cdn.tailwindcss.com cdnjs.cloudflare.com cloud.umami.is; style-src 'self' 'unsafe-inline' cdn.tailwindcss.com cdnjs.cloudflare.com fonts.googleapis.com; font-src 'self' fonts.gstatic.com cdnjs.cloudflare.com; img-src 'self' data:; media-src 'self' *.digitaloceanspaces.com; connect-src 'self' cloud.umami.is;"
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
    app.register_blueprint(flags)
    app.register_blueprint(notifications)
    app.register_blueprint(language_server)
    
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
    
    # Initialize database tables
    with app.app_context():
        try:
            db.create_all()
            print("Database tables initialized successfully")
            
            # Run automatic migrations
            print("Running automatic migrations...")
            run_migrations(app)
            print("✅ All migrations completed successfully!")
            
        except Exception as e:
            print(f"❌ CRITICAL: Database initialization or migration failed: {e}")
            print("The application cannot start without a properly initialized database.")
            raise  # Re-raise to prevent app from starting
    
    return app


def run_migrations(app):
    """Run all database migrations. Raises exception on failure."""
    from sqlalchemy import text
    
    migrations_run = []
    
    try:
        # Migration 1: Drop obsolete columns from verse_flags
        try:
            result = db.session.execute(text("SHOW COLUMNS FROM verse_flags LIKE 'title'"))
            if result.fetchone():
                db.session.execute(text("ALTER TABLE verse_flags DROP COLUMN title"))
                migrations_run.append("Dropped title column from verse_flags")
            
            result = db.session.execute(text("SHOW COLUMNS FROM verse_flags LIKE 'priority'"))
            if result.fetchone():
                db.session.execute(text("ALTER TABLE verse_flags DROP COLUMN priority"))
                migrations_run.append("Dropped priority column from verse_flags")
                
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise Exception(f"Failed to drop obsolete columns from verse_flags: {e}")
            
        # Migration 2: Ensure all projects have ProjectMember entries
        try:
            from models import Project, ProjectMember
            projects_without_member = db.session.query(Project).outerjoin(
                ProjectMember, 
                (Project.id == ProjectMember.project_id) & 
                (Project.user_id == ProjectMember.user_id)
            ).filter(ProjectMember.id.is_(None)).all()
            
            missing_count = 0
            for project in projects_without_member:
                member = ProjectMember(
                    project_id=project.id,
                    user_id=project.user_id,
                    role='owner',
                    created_at=project.created_at
                )
                db.session.add(member)
                missing_count += 1
            
            if missing_count > 0:
                db.session.commit()
                migrations_run.append(f"Added {missing_count} missing ProjectMember entries")
        except Exception as e:
            db.session.rollback()
            raise Exception(f"Failed to create ProjectMember entries: {e}")
            
        # Migration 3: Ensure user_notifications table exists
        try:
            result = db.session.execute(text("SHOW TABLES LIKE 'user_notifications'"))
            if not result.fetchone():
                # This should be handled by db.create_all() above
                raise Exception("user_notifications table was not created by db.create_all()")
        except Exception as e:
            raise Exception(f"Failed to verify user_notifications table: {e}")
            
        # Migration 4: Ensure flag_resolutions table exists
        try:
            result = db.session.execute(text("SHOW TABLES LIKE 'flag_resolutions'"))
            if not result.fetchone():
                # This should be handled by db.create_all() above
                raise Exception("flag_resolutions table was not created by db.create_all()")
        except Exception as e:
            raise Exception(f"Failed to verify flag_resolutions table: {e}")
            
        # Migration 5: Ensure project_dictionaries table exists
        try:
            result = db.session.execute(text("SHOW TABLES LIKE 'project_dictionaries'"))
            if not result.fetchone():
                # This should be handled by db.create_all() above
                raise Exception("project_dictionaries table was not created by db.create_all()")
        except Exception as e:
            raise Exception(f"Failed to verify project_dictionaries table: {e}")
        
        # Print summary of migrations run
        if migrations_run:
            for migration in migrations_run:
                print(f"  ✓ {migration}")
        else:
            print("  ✓ No migrations needed - database is up to date")
            
    except Exception as e:
        # Log the specific migration that failed
        print(f"\n❌ Migration failed: {e}")
        print("\nTo fix this issue:")
        print("1. Check your database connection settings")
        print("2. Ensure the database user has proper permissions")
        print("3. Review the specific error message above")
        print("4. You may need to run manual SQL commands to fix the schema")
        raise  # Re-raise to prevent app from starting


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