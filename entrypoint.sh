#!/bin/sh
set -e

echo "Running database migrations..."
if ! npx drizzle-kit push --force; then
  echo "ERROR: Database migration failed. Container cannot start."
  exit 1
fi

echo "Starting StockTrax..."
exec npm start
