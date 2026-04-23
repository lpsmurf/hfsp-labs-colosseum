#!/bin/bash
# Automated database backup script
# Run daily via cron: 0 2 * * * /path/to/backup-database.sh

BACKUP_DIR="/data/hfsp/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_PATH="/data/hfsp/agents.db"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Check if database exists in Docker volume
CONTAINER_ID=$(docker ps --filter "name=hfsp-provisioning-engine" --quiet)

if [ -z "$CONTAINER_ID" ]; then
  echo "[ERROR] Container not running"
  exit 1
fi

# Backup from container
docker exec "$CONTAINER_ID" sh -c "cp /app/data/agents.db /app/data/agents.db.backup"
docker cp "$CONTAINER_ID:/app/data/agents.db.backup" "$BACKUP_DIR/agents.db.$TIMESTAMP.backup"

# Compress
gzip "$BACKUP_DIR/agents.db.$TIMESTAMP.backup"

# Cleanup old backups (keep last 7 days)
find "$BACKUP_DIR" -name "agents.db.*.backup.gz" -mtime +7 -delete

echo "[SUCCESS] Database backed up: $BACKUP_DIR/agents.db.$TIMESTAMP.backup.gz"
