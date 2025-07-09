# Deployment Checklist: Database Migration to Digital Ocean

## Pre-Deployment Checks

- [ ] Backup the production database
- [ ] Test migration scripts locally
- [ ] Ensure all code changes are committed
- [ ] Review server logs for any current errors
- [ ] Check available disk space on server (need ~2x current DB size)

## Deployment Steps

### 1. Prepare the Server
```bash
# SSH into server
ssh root@your-server-ip

# Create database backup
mysqldump -u your_user -p your_database > backup_$(date +%Y%m%d_%H%M%S).sql

# Check disk space
df -h

# Navigate to project
cd /path/to/CodexZero
source venv/bin/activate
```

### 2. Deploy Code Changes
```bash
# Stash any local changes
git stash

# Pull latest code
git checkout production
git pull origin production

# Install any new dependencies
pip install -r requirements.txt
```

### 3. Run Database Migrations
```bash
# Create new tables for translations
python migrations/add_translation_verses_table.py

# Create new tables for project files  
python migrations/add_project_file_verses_table.py

# Check if tables were created successfully
mysql -u your_user -p your_database -e "SHOW TABLES LIKE '%verses';"
```

### 4. Migrate Existing Data
```bash
# Run in screen/tmux in case connection drops
screen -S migration

# Migrate translations (monitor output)
python migrate_translations_to_db.py

# Migrate project files (monitor output)
python migrate_project_files_to_db.py

# Exit screen
# Ctrl+A, D
```

### 5. Verify Migration
```bash
# Check verse counts
mysql -u your_user -p your_database -e "
  SELECT COUNT(*) as translation_verses FROM translation_verses;
  SELECT COUNT(*) as file_verses FROM project_file_verses;
"

# Test the application
curl http://localhost:5000/health  # or your health check endpoint
```

### 6. Restart Application
```bash
# If using supervisor
supervisorctl restart codexzero

# If using systemd
systemctl restart codexzero

# Check status
supervisorctl status codexzero
# or
systemctl status codexzero
```

### 7. Monitor Application
```bash
# Watch logs for errors
tail -f /var/log/codexzero/error.log
tail -f /var/log/codexzero/access.log

# Check application responsiveness
curl -w "\n%{time_total}s\n" http://your-domain.com/
```

## Post-Deployment Verification

- [ ] Test loading translation page - should be fast
- [ ] Test saving a verse
- [ ] Test uploading a new file
- [ ] Test downloading a translation
- [ ] Check error logs for any issues
- [ ] Monitor server resources (CPU, Memory, Disk)

## Rollback Plan

If issues occur:

```bash
# Restore database from backup
mysql -u your_user -p your_database < backup_YYYYMMDD_HHMMSS.sql

# Revert code changes
git checkout previous_commit_hash

# Restart application
supervisorctl restart codexzero
```

## Performance Metrics to Track

Before migration:
- Page load time: ~3 seconds
- Memory usage per request: ~40MB
- Database size: X GB

After migration:
- Page load time: <0.5 seconds (expected)
- Memory usage per request: <5MB (expected)
- Database size: X + Y GB (verse storage)

## Notes

- Migration may take 10-30 minutes depending on data size
- The system maintains backward compatibility
- File storage is kept as backup (can be removed later)
- Monitor disk space - database will grow with verse storage 