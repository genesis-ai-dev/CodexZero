# CodexZero Setup Instructions

## 1. Install Dependencies

```bash
pip install -r requirements.txt
```

## 2. Database Setup

Create a MySQL database and user for the project:

```sql
CREATE DATABASE codex_db;
CREATE USER 'codex_zero'@'localhost' IDENTIFIED BY 'codex_pass';
GRANT ALL PRIVILEGES ON codex_db.* TO 'codex_zero'@'localhost';
FLUSH PRIVILEGES;
```

## 3. Environment Configuration

1. Copy `env_template.txt` to `.env`
2. Update the `DATABASE_URL` with your actual database credentials
3. Set up Google OAuth (see below)
4. Generate a secure secret key for production

### Generate Secret Key
```python
import secrets
print(secrets.token_hex(32))
```

### Database URL Format
```
DATABASE_URL=mysql+pymysql://username:password@host/database_name
```

## 4. Google OAuth Setup

Follow these steps to set up Google OAuth using the [official Google OAuth 2.0 documentation](https://developers.google.com/identity/protocols/oauth2):

### 4.1 Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable the Google+ API or Google Identity services

### 4.2 Configure OAuth Consent Screen
1. Go to APIs & Services > OAuth consent screen
2. Choose "External" user type
3. Fill in required fields:
   - Application name: "CodexZero"
   - User support email: your email
   - Developer contact: your email
4. Add scopes: `email`, `profile`, `openid`
5. Save and continue

### 4.3 Create OAuth 2.0 Credentials
1. Go to APIs & Services > Credentials
2. Click "Create Credentials" > "OAuth 2.0 Client IDs"
3. Application type: "Web application"
4. Name: "CodexZero Web Client"
5. Authorized redirect URIs:
   - `http://localhost:5000/auth/callback` (development)
   - Add production URLs when deploying
6. Copy the Client ID and Client Secret to your `.env` file

## 5. Run the Application

```bash
python app.py
```

Visit `http://localhost:5000` to see the application.

## 6. Security Notes

- Never commit `.env` file to version control
- Use strong, unique secret keys in production
- Enable HTTPS in production (set `SESSION_COOKIE_SECURE = True`)
- Consider using environment-specific config files for deployment

## 7. Deployment Notes

### PythonAnywhere
- Upload your code
- Create a MySQL database through their interface
- Set environment variables in the web app configuration
- Update OAuth redirect URIs to include your domain
- Use their DATABASE_URL format in environment variables

### Digital Ocean
- Use their App Platform or Droplets
- Set up MySQL instance or use managed database
- Configure environment variables in app settings
- Ensure SSL/HTTPS is enabled
- Update DATABASE_URL with production database credentials 