#!/usr/bin/env bash
#
# init-db.sh — Initialize the local D1 database with schema.sql
#
# Usage: cd worker && ./scripts/init-db.sh
#
# This runs schema.sql against the local wrangler D1 database.
# Safe to run multiple times (uses CREATE TABLE IF NOT EXISTS).
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$(dirname "$SCRIPT_DIR")"
SCHEMA_FILE="$WORKER_DIR/src/db/schema.sql"

if [ ! -f "$SCHEMA_FILE" ]; then
  echo "ERROR: schema.sql not found at $SCHEMA_FILE"
  exit 1
fi

echo "[init-db] Applying schema.sql to local D1 database..."
cd "$WORKER_DIR"
npx wrangler d1 execute og-game --local --file="$SCHEMA_FILE"
echo "[init-db] Schema applied successfully."
