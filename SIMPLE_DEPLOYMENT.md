# Simple Deployment Guide

## Automatic Migration

The database migration now runs automatically when the app starts! Just deploy your code and restart the app.

## Deployment Steps

1. **Deploy the code** (however you normally do it - git pull, upload, etc.)

2. **Restart the application**:
   ```bash
   # If using supervisor
   supervisorctl restart codexzero
   
   # If using systemd
   systemctl restart codexzero
   
   # If running directly
   # Just restart your Python process
   ```

3. **Check the logs** to confirm migration ran:
   ```bash
   # You should see:
   # "Database tables created successfully"
   # "✓ Database migrations completed successfully!"
   ```

That's it! The migration runs automatically on startup.

## Optional: Migrate Existing Data

To also migrate your existing files to the database:

```bash
# SSH to your server and run:
cd /path/to/CodexZero
source venv/bin/activate
python migrate_translations_to_db.py
python migrate_project_files_to_db.py
```

## What Happens Automatically

- Creates new database tables if they don't exist
- Adds storage_type columns to existing tables
- New uploads automatically use database storage
- Old files continue to work (backward compatible)

## Rollback

If something goes wrong, just deploy the previous version and restart. The old files are still there as backup. 