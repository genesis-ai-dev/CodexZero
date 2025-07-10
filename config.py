import os
from dotenv import load_dotenv

# Force reload environment variables
load_dotenv(override=True)

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-key-change-in-production'
    
    # Development mode flag
    DEVELOPMENT_MODE = os.environ.get('FLASK_ENV') == 'development' or os.environ.get('DEVELOPMENT_MODE') == 'true'
    
    # Database Configuration - using DATABASE_URL
    database_url = os.environ.get('DATABASE_URL') or 'mysql+pymysql://codex_zero:codex_pass@localhost/codex_db'
    # Ensure we use pymysql driver instead of MySQLdb
    if database_url.startswith('mysql://'):
        database_url = database_url.replace('mysql://', 'mysql+pymysql://', 1)
    SQLALCHEMY_DATABASE_URI = database_url
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Google OAuth Configuration
    GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
    GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
    
    # Security settings - relaxed for development
    SESSION_COOKIE_SECURE = not DEVELOPMENT_MODE  # False in development
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'  # Changed from 'Strict' to allow OAuth redirects
    PERMANENT_SESSION_LIFETIME = 24 * 60 * 60  # 24 hours 