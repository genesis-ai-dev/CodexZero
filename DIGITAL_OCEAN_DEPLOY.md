# Digital Ocean Deployment Guide

Deploy CodexZero to Digital Ocean App Platform in under 30 minutes.

## Prerequisites

- Digital Ocean account
- GitHub repository with your CodexZero code
- Google OAuth credentials (see step 3)
- OpenAI and Anthropic API keys

## Step 1: Prepare Your Code

1. **Fork/Clone** this repository to your GitHub account
2. **Remove development settings** from `app.py`:

```python
# Comment out or remove these lines at the bottom of app.py:
# if __name__ == '__main__':
#     os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
#     print("Starting Flask app on http://localhost:5000")
#     print("Make sure to access the app via localhost, not 127.0.0.1")
#     app.run(debug=True, host='localhost', port=5000)
```

3. **Create a `run.py` file** in your project root:

```python
from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run()
```

## Step 2: Create Database on Digital Ocean

1. Go to **Digital Ocean Dashboard** → **Databases**
2. Click **Create Database Cluster**
3. Select:
   - **MySQL** (version 8.0+)
   - **Basic** plan ($15/month minimum)
   - **Datacenter region** (choose closest to your users)
4. Name: `codexzero-db`
5. Click **Create Database Cluster**
6. Wait 5-10 minutes for provisioning
7. **Copy the connection string** - you'll need it for Step 5

## Step 3: Setup Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create new project or select existing one
3. Enable **Google+ API**
4. Go to **APIs & Services** → **OAuth consent screen**:
   - User Type: **External**
   - App name: `CodexZero`
   - Add your email for support and developer contact
   - Scopes: `email`, `profile`, `openid`
5. Go to **APIs & Services** → **Credentials**
6. Click **Create Credentials** → **OAuth 2.0 Client IDs**
   - Application type: **Web application**
   - Name: `CodexZero Production`
   - Authorized redirect URIs: `https://YOUR-APP-NAME.ondigitalocean.app/auth/callback`
     (Replace `YOUR-APP-NAME` with your actual app name from Step 4)
7. **Copy Client ID and Secret** - you'll need them for Step 5

## Step 4: Deploy to Digital Ocean App Platform

1. Go to **Digital Ocean Dashboard** → **Apps**
2. Click **Create App**
3. Choose **GitHub** as source
4. Select your **CodexZero repository**
5. Configure your app:
   - **Name**: `codexzero-app` (or your preferred name)
   - **Region**: Same as your database
   - **Branch**: `main`
   - **Autodeploy**: Enable (recommended)

### App Configuration:
- **Runtime**: Python
- **Build Command**: `pip install -r requirements.txt`
- **Run Command**: `gunicorn --bind 0.0.0.0:$PORT run:app`
- **HTTP Port**: 8080

## Step 5: Configure Environment Variables

In the App Platform, go to **Settings** → **App-Level Environment Variables** and add:

### Required Variables:
```
DATABASE_URL=mysql+pymysql://username:password@host:port/database
SECRET_KEY=your-64-character-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
ANTHROPIC_API_KEY=your-anthropic-api-key
OPENAI_API_KEY=your-openai-api-key
STORAGE_TYPE=spaces
```

### Digital Ocean Spaces (File Storage):
```
DO_SPACES_REGION=nyc3
DO_SPACES_ENDPOINT=https://nyc3.digitaloceanspaces.com
DO_SPACES_ACCESS_KEY=your-spaces-access-key
DO_SPACES_SECRET_KEY=your-spaces-secret-key
DO_SPACES_BUCKET=codexzero-files
```

### Generate Secret Key:
```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

## Step 6: Setup Digital Ocean Spaces (File Storage)

1. Go to **Spaces** in Digital Ocean dashboard
2. Click **Create a Space**
3. Choose same region as your app
4. Name: `codexzero-files`
5. Enable **CDN** (recommended)
6. Go to **API** → **Spaces access keys**
7. Generate new key pair
8. Add the keys to your environment variables (Step 5)

## Step 7: Update OAuth Redirect URL

1. Go back to Google Cloud Console
2. Update your OAuth redirect URI to match your deployed app:
   `https://your-app-name.ondigitalocean.app/auth/callback`

## Step 8: Deploy and Test

1. Click **Create Resources** in Digital Ocean
2. Wait 5-10 minutes for deployment
3. Click on your app URL
4. Test the login flow
5. Create a test project to verify everything works

## Step 9: Database Migration (If Needed)

If you have existing data, run the migration:

```bash
# Connect to your app console via Digital Ocean dashboard
python migrate_fine_tuning.py
```

## Troubleshooting

### Common Issues:

**Database Connection Failed:**
- Verify DATABASE_URL format: `mysql+pymysql://user:pass@host:port/dbname`
- Check firewall settings in Digital Ocean database dashboard
- Ensure database and app are in same region

**OAuth Login Failed:**
- Verify redirect URI exactly matches in Google Console
- Check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
- Ensure HTTPS is being used (not HTTP)

**File Upload Failed:**
- Verify Spaces credentials
- Check bucket name and region match
- Ensure STORAGE_TYPE=spaces

**Build Failed:**
- Check build logs in Digital Ocean dashboard
- Verify requirements.txt includes all dependencies
- Ensure Python version compatibility

### Performance Optimization:

1. **Scale up** if needed:
   - Go to your app settings
   - Increase instance size or count
   - Database: upgrade to higher tier for better performance

2. **Enable CDN** for Spaces (already recommended in Step 6)

3. **Monitor resource usage** in Digital Ocean dashboard

## Estimated Costs

- **Basic App**: $12/month (512MB RAM, 1 vCPU)
- **Database**: $15/month (1GB RAM, 1 vCPU, 10GB storage)
- **Spaces**: $5/month (250GB storage, 1TB transfer)
- **Total**: ~$32/month for small-medium usage

## Security Checklist

- ✅ Generated secure SECRET_KEY
- ✅ Database credentials secure
- ✅ HTTPS enabled (automatic with App Platform)
- ✅ OAuth redirect URLs use HTTPS
- ✅ API keys stored as environment variables
- ✅ Debug mode disabled in production

## Next Steps

1. **Setup monitoring** in Digital Ocean dashboard
2. **Configure alerts** for app health and database performance
3. **Setup automated backups** for your database
4. **Consider adding a custom domain** if needed

Your CodexZero app should now be live at `https://your-app-name.ondigitalocean.app`! 