#!/usr/bin/env bash
#
# Back up everything that matters: the SQLite database and the stored files.
#
#   sudo ./scripts/backup.sh [destination-directory]
#
# Add to root's crontab for a nightly copy:
#   15 3 * * * /opt/workbench/scripts/backup.sh /var/backups/workbench

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${APP_DIR}/data"
DEST="${1:-${APP_DIR}/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="${DEST}/workbench-${STAMP}.tar.gz"

[[ -d "$DATA_DIR" ]] || { echo "No data directory at $DATA_DIR" >&2; exit 1; }
mkdir -p "$DEST"

# Checkpoint the WAL first so the copied database is complete.
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "${DATA_DIR}/webtools.db" "PRAGMA wal_checkpoint(TRUNCATE);" >/dev/null
fi

tar -czf "$ARCHIVE" -C "$APP_DIR" data
echo "Wrote $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))"

# Keep the last 14 archives.
ls -1t "${DEST}"/workbench-*.tar.gz 2>/dev/null | tail -n +15 | xargs -r rm --
