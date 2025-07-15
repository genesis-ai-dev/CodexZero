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
    app.register_blueprint(flags)
    app.register_blueprint(notifications)
    
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
            
            # Run automatic migrations (remove this section after deployment)
            print("Running automatic migrations...")
            
            # 1. Drop title and priority columns from verse_flags if they exist
            try:
                from sqlalchemy import text
                # Check if columns exist before dropping them
                result = db.session.execute(text("SHOW COLUMNS FROM verse_flags LIKE 'title'"))
                if result.fetchone():
                    db.session.execute(text("ALTER TABLE verse_flags DROP COLUMN title"))
                    print("✓ Dropped title column from verse_flags")
                
                result = db.session.execute(text("SHOW COLUMNS FROM verse_flags LIKE 'priority'"))
                if result.fetchone():
                    db.session.execute(text("ALTER TABLE verse_flags DROP COLUMN priority"))
                    print("✓ Dropped priority column from verse_flags")
                    
            except Exception as e:
                print(f"Schema migration warning: {e}")
            
            # 2. Add missing ProjectMember entries for existing projects
            try:
                from models import Project, ProjectMember
                from datetime import datetime
                
                missing_count = 0
                for project in Project.query.all():
                    existing_member = ProjectMember.query.filter_by(
                        project_id=project.id, 
                        user_id=project.user_id
                    ).first()
                    
                    if not existing_member:
                        member = ProjectMember(
                            project_id=project.id,
                            user_id=project.user_id,
                            role='owner',
                            invited_by=project.user_id,
                            accepted_at=project.created_at or datetime.utcnow()
                        )
                        db.session.add(member)
                        missing_count += 1
                
                if missing_count > 0:
                    db.session.commit()
                    print(f"✓ Added {missing_count} missing ProjectMember entries")
                else:
                    print("✓ All projects already have ProjectMember entries")
                    
            except Exception as e:
                print(f"ProjectMember migration warning: {e}")
            
            # 3. Ensure user_notifications table exists with proper indexes
            try:
                from sqlalchemy import text
                # Check if user_notifications table exists
                result = db.session.execute(text("SHOW TABLES LIKE 'user_notifications'"))
                if not result.fetchone():
                    # Create the table - db.create_all() should handle this
                    db.create_all()
                    print("✓ Created user_notifications table")
                else:
                    print("✓ user_notifications table already exists")
                    
            except Exception as e:
                print(f"Notifications migration warning: {e}")
                
            print("Migrations completed!")
            
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