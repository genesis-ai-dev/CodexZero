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
            

            
        except Exception as e:
            print(f"Database connection failed during startup: {e}")
            print("App will start without database initialization")
    
    return app


app = create_app()


@app.route('/api/translate', methods=['POST'])
@login_required
def translate_passage():
    """Translate a Bible passage using AI"""
    try:
        data = request.get_json()
        
        # Get form data
        passage_key = data.get('passage')
        target_language = data.get('target_language', '')
        audience = data.get('audience', '')
        style = data.get('style', '')
        model = data.get('model')  # Optional model override
        
        # Bible passages mapping
        passages = {
            'john3:16': 'For God so loved the world that he gave his one and only Son, that whoever believes in him shall not perish but have eternal life.',
            'genesis1:1': 'In the beginning God created the heavens and the earth.',
            'psalm23:1': 'The Lord is my shepherd, I lack nothing.',
            'matthew28:19': 'Therefore go and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit.',
            'romans3:23': 'For all have sinned and fall short of the glory of God.',
            'revelation21:4': 'He will wipe every tear from their eyes. There will be no more death or mourning or crying or pain, for the old order of things has passed away.'
        }
        
        original_text = passages.get(passage_key)
        
        # Create chatbot instance with conservative temperature
        chatbot = Chatbot()
        
        # Translate using AI
        def run_translation():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                return loop.run_until_complete(
                    chatbot.translate_text(
                        text=original_text,
                        target_language=target_language,
                        audience=audience,
                        style=style,
                        context=f"Bible verse ({passage_key})",
                        model=model,
                    )
                )
            finally:
                loop.close()
        
        translation = run_translation()
        
        return jsonify({
            'success': True,
            'translation': translation,
            'passage': passage_key,
            'original': original_text
        })
        
    except Exception as e:
        print(f"Translation error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


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