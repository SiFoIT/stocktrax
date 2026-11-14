#!/bin/sh
set -e

# Same database path as src/lib/db/index.ts and drizzle.config.ts:
# STOCKTRAX_DB_PATH when set, else ./data/stocktrax.db (/app/data in Docker).
DB_PATH="${STOCKTRAX_DB_PATH:-./data/stocktrax.db}"
BACKUP_DIR="$(dirname "$DB_PATH")/backups"
# Safety copies taken before each schema push. Named so they never match the
# app's JSON backups (stocktrax-backup-YYYY-MM-DD[-N].json) and vice versa.
KEEP_PRE_MIGRATE=3

# `drizzle-kit push --force` auto-approves data-loss statements, so copy the
# database first, every start. The app is not running yet, and SQLite's online
# backup API (via better-sqlite3, already a dependency) folds in any -wal
# content, giving one self-contained file.
backup_before_migrate() {
  if [ ! -f "$DB_PATH" ]; then
    echo "No database at $DB_PATH yet; nothing to back up."
    return 0
  fi
  mkdir -p "$BACKUP_DIR" || return 1
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  dest="$BACKUP_DIR/pre-migrate-$stamp.db"
  [ -e "$dest" ] && dest="$BACKUP_DIR/pre-migrate-$stamp-$$.db"
  tmp="$BACKUP_DIR/.pre-migrate-$stamp-$$.tmp"

  echo "Backing up $DB_PATH to $dest..."
  if ! node -e '
    const Database = require("better-sqlite3");
    const [src, out] = process.argv.slice(1);
    const db = new Database(src, { fileMustExist: true });
    db.backup(out)
      .then(() => { db.close(); })
      .catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
  ' "$DB_PATH" "$tmp"; then
    rm -f "$tmp"
    return 1
  fi
  mv "$tmp" "$dest" || return 1

  # Keep the newest $KEEP_PRE_MIGRATE; the UTC stamp sorts lexically.
  ls -1 "$BACKUP_DIR" | grep -E '^pre-migrate-[0-9]{8}-[0-9]{6}(-[0-9]+)?\.db$' | sort -r \
    | tail -n +$((KEEP_PRE_MIGRATE + 1)) | while read -r old; do
      rm -f "$BACKUP_DIR/$old"
    done
}

if ! backup_before_migrate; then
  echo "ERROR: Could not back up the database before migrating. Container will not start."
  exit 1
fi

echo "Running database migrations..."
if ! npx drizzle-kit push --force; then
  echo "ERROR: Database migration failed. Container cannot start."
  echo "The pre-migration copy is in $BACKUP_DIR."
  exit 1
fi

echo "Starting StockTrax..."
exec npm start
