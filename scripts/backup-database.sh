#!/bin/bash
# Database Backup Script for HFSP Labs
# Backs up SQLite databases to S3 or local storage

set -e

# Configuration
BACKUP_DIR="/home/clawd/.openclaw/workspace/backups"
DATA_DIR="/home/clawd/.openclaw/workspace/hfsp-labs-colosseum/data"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="hfsp_labs_backup_${DATE}.tar.gz"
RETENTION_DAYS=30

# AWS S3 Configuration (optional)
S3_BUCKET="${S3_BUCKET:-}"
AWS_PROFILE="${AWS_PROFILE:-default}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Create backup archive
echo "Creating backup: $BACKUP_NAME"
tar -czf "$BACKUP_DIR/$BACKUP_NAME" -C "$DATA_DIR" .

# Verify backup
if [ -f "$BACKUP_DIR/$BACKUP_NAME" ]; then
    echo "Backup created successfully: $BACKUP_DIR/$BACKUP_NAME"
    ls -lh "$BACKUP_DIR/$BACKUP_NAME"
else
    echo "ERROR: Backup failed!"
    exit 1
fi

# Upload to S3 if configured
if [ -n "$S3_BUCKET" ]; then
    echo "Uploading to S3: s3://$S3_BUCKET/backups/"
    aws s3 cp "$BACKUP_DIR/$BACKUP_NAME" "s3://$S3_BUCKET/backups/$BACKUP_NAME" --profile "$AWS_PROFILE"
    echo "S3 upload complete"
fi

# Clean up old backups (local)
echo "Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -name "hfsp_labs_backup_*.tar.gz" -mtime +$RETENTION_DAYS -delete

# Clean up old backups (S3)
if [ -n "$S3_BUCKET" ]; then
    echo "Cleaning up S3 backups older than $RETENTION_DAYS days..."
    aws s3 ls "s3://$S3_BUCKET/backups/" --profile "$AWS_PROFILE" | \
        awk '{print $4}' | \
        while read -r file; do
            # Extract date from filename
            file_date=$(echo "$file" | grep -oP '\d{8}_\d{6}' || true)
            if [ -n "$file_date" ]; then
                # Convert to epoch and compare
                file_epoch=$(date -d "${file_date:0:8} ${file_date:9:2}:${file_date:11:2}:${file_date:13:2}" +%s 2>/dev/null || echo 0)
                cutoff_epoch=$(date -d "$RETENTION_DAYS days ago" +%s)
                if [ "$file_epoch" -lt "$cutoff_epoch" ]; then
                    echo "Deleting old backup: $file"
                    aws s3 rm "s3://$S3_BUCKET/backups/$file" --profile "$AWS_PROFILE"
                fi
            fi
        done
fi

echo "Backup complete!"
