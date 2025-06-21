import os
from dotenv import load_dotenv

# Force reload environment variables
load_dotenv(override=True)

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'dev-key-change-in-production'
    
    # Database Configuration - using DATABASE_URL
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'mysql+pymysql://codex_zero:codex_pass@localhost/codex_db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Google OAuth Configuration
    GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
    GOOGLE_CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
    
    # Security settings
    SESSION_COOKIE_SECURE = True  # Set to True in production with HTTPS
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax' 