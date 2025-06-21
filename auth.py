import os
import json
from datetime import datetime
from flask import Blueprint, request, redirect, url_for, session, flash, current_app
from flask_login import login_user, logout_user, login_required, current_user
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from google_auth_oauthlib.flow import Flow
import requests

from models import db, User

auth = Blueprint('auth', __name__)

# Google OAuth 2.0 Configuration
GOOGLE_DISCOVERY_URL = "https://accounts.google.com/.well-known/openid_connect_configuration"

def get_google_provider_cfg():
    return requests.get(GOOGLE_DISCOVERY_URL).json()

def create_flow(redirect_uri=None):
    """Create Google OAuth flow"""
    # If no redirect_uri provided, generate it
    if redirect_uri is None:
        redirect_uri = url_for('auth.callback', _external=True)
    
    client_config = {
        "web": {
            "client_id": current_app.config['GOOGLE_CLIENT_ID'],
            "client_secret": current_app.config['GOOGLE_CLIENT_SECRET'],
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs"
        }
    }
    
    
    flow = Flow.from_client_config(
        client_config,
        scopes=[
            "openid",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile"
        ]
    )
    flow.redirect_uri = redirect_uri
    return flow

@auth.route("/login")
def login():
    """Initiate Google OAuth login"""
    if current_user.is_authenticated:
        return redirect(url_for('index'))
    
    # Create flow and store the redirect URI used
    flow = create_flow()
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='select_account'  # Force account selection even if user is logged in
    )
    
    session['state'] = state
    session['redirect_uri'] = flow.redirect_uri  # Store for callback
    return redirect(authorization_url)

@auth.route("/callback")
def callback():
    """Handle Google OAuth callback"""
    # Verify state parameter
    if request.args.get('state') != session.get('state'):
        flash('Invalid state parameter', 'error')
        return redirect(url_for('index'))
    
    # Extract the base redirect URI from the current request
    # This ensures it matches exactly what Google is expecting
    from urllib.parse import urlparse, urlunparse
    parsed = urlparse(request.url)
    redirect_uri = urlunparse((parsed.scheme, parsed.netloc, parsed.path, '', '', ''))
    
    # Create flow with the exact redirect URI
    flow = create_flow(redirect_uri=redirect_uri)
    
    # Fetch token - Google may return different scope names than requested
    # Set the OAuth session to not raise on scope change
    flow.oauth2session.scope = None  # This prevents scope validation
    flow.fetch_token(authorization_response=request.url)
    
    # Get user info from Google
    credentials = flow.credentials
    request_session = google_requests.Request()
    
    idinfo = id_token.verify_oauth2_token(
        credentials.id_token, request_session, current_app.config['GOOGLE_CLIENT_ID']
    )
    
    # Extract user information
    google_id = idinfo.get('sub')
    email = idinfo.get('email')
    name = idinfo.get('name')
    
    if not google_id or not email:
        flash('Failed to get user information from Google', 'error')
        return redirect(url_for('index'))
    
    # Check if user exists, create if not
    user = User.query.filter_by(google_id=google_id).first()
    if not user:
        user = User(
            google_id=google_id,
            email=email,
            name=name,
            created_at=datetime.utcnow()
        )
        db.session.add(user)
    else:
        # Update user info in case it changed
        user.email = email
        user.name = name
    
    user.last_login = datetime.utcnow()
    db.session.commit()
    
    login_user(user, remember=True)
    flash(f'Welcome, {user.name}!', 'success')
    
    # Redirect to next page or home
    next_page = request.args.get('next')
    return redirect(next_page) if next_page else redirect(url_for('index'))

@auth.route("/logout")
@login_required
def logout():
    """Logout user"""
    logout_user()
    # Clear OAuth-related session data
    session.pop('state', None)
    session.pop('redirect_uri', None)
    flash('You have been logged out', 'info')
    return redirect(url_for('index')) 