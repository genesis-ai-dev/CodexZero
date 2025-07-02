import os
from flask import Blueprint, render_template, redirect, url_for, current_app, flash
from flask_login import current_user

main = Blueprint('main', __name__)


@main.route('/')
def index():
    # In development mode, if user is not authenticated, redirect to dev login
    if current_app.config.get('DEVELOPMENT_MODE') and not current_user.is_authenticated:
        return redirect(url_for('auth.dev_login'))
    return render_template('index.html')


@main.route('/dev')
def dev_shortcut():
    """Quick development login shortcut"""
    if not current_app.config.get('DEVELOPMENT_MODE'):
        flash('Development shortcuts not available in production', 'error')
        return redirect(url_for('main.index'))
    return redirect(url_for('auth.dev_login'))


@main.route('/health')
def health():
    """Simple health check endpoint"""
    try:
        # Test database connection with proper SQLAlchemy syntax
        from sqlalchemy import text
        from models import db
        db.session.execute(text('SELECT 1'))
        db_status = "OK"
    except Exception as e:
        db_status = f"ERROR: {str(e)}"
    
    return {
        "status": "OK" if db_status == "OK" else "DEGRADED",
        "database": db_status,
        "database_url": os.environ.get('DATABASE_URL', 'Not set')[:50] + "..." if os.environ.get('DATABASE_URL') else 'Not set',
        "storage_type": os.environ.get('STORAGE_TYPE', 'Not set')
    }


@main.route('/faq')
def faq():
    """FAQ page"""
    return render_template('faq.html') 