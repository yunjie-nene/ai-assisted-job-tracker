#!/usr/bin/env bash
set -euo pipefail
umask 077

# Run as root. SQLite's online backup includes committed WAL changes.
database=/var/lib/job-tracker/job-tracker.db
backup_dir=/var/backups/job-tracker
if [[ ! -f "$database" ]]; then
  printf '%s\n' 'Database not found. Start the API before creating a backup.' >&2
  exit 1
fi
install -d -m 0700 "$backup_dir"
backup="$backup_dir/job-tracker-$(date -u +%Y%m%dT%H%M%S)-$$.db"
sqlite3 "$database" ".backup '$backup'"
result=$(sqlite3 "$backup" 'PRAGMA integrity_check;')
if [[ "$result" != 'ok' ]]; then
  printf '%s\n' 'Backup integrity check failed.' >&2
  exit 1
fi
printf 'Verified backup: %s\n' "$backup"
