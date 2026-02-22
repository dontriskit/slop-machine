#!/usr/bin/env bash
#
# seed.sh — Insert test player and planet into local D1 database
#
# Usage: cd worker && ./scripts/seed.sh
#
# Creates:
#   - Test player: "TestCommander" (id: test-player-001)
#   - Homeworld planet at [1:100:5] (id: test-planet-001)
#   - Fleet record with zero ships
#
# Safe to run multiple times (uses INSERT OR IGNORE).
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKER_DIR="$(dirname "$SCRIPT_DIR")"

NOW=$(date +%s)

echo "[seed] Seeding test player and planet..."

cd "$WORKER_DIR"

npx wrangler d1 execute og-game --local --command="
INSERT OR IGNORE INTO players (id, name, created_at)
VALUES ('test-player-001', 'TestCommander', $NOW);

INSERT OR IGNORE INTO planets (id, player_id, name, galaxy, system, position, planet_type, temperature, fields, universe_speed, created_at)
VALUES ('test-planet-001', 'test-player-001', 'Homeworld', 1, 100, 5, 'planet', 35, 163, 1, $NOW);

INSERT OR IGNORE INTO fleets (id, planet_id, player_id, updated_at)
VALUES ('test-fleet-001', 'test-planet-001', 'test-player-001', $NOW);
"

echo "[seed] Test player seeded:"
echo "  Player: TestCommander (test-player-001)"
echo "  Planet: Homeworld [1:100:5] (test-planet-001)"
echo ""
echo "  Use POST /api/players/login with body: {\"name\": \"TestCommander\"} to start playing."
