# Cosmic Protocol — API Reference

> Base URL: `https://<worker>.workers.dev`
> All endpoints return JSON. Auth is not yet enforced at the gateway layer; `player_id` is passed as a query parameter or in the request body.

---

## Health

### GET /
Returns service status.

**Response 200:**
```json
{ "status": "ok", "service": "Cosmic Protocol Worker", "version": "0.1.0" }
```

### GET /health
Same as `GET /`.

---

## Planet

### GET /api/planet/:id/state
Get full planet state.

**Response 200:**
```json
{
  "planetId": "string",
  "playerId": "string",
  "coordinate": { "galaxy": 1, "system": 100, "position": 7 },
  "planetType": "planet",
  "name": "string",
  "temperature": 30,
  "fields": 180,
  "universeSpeed": 1,
  "buildings": { "metalMine": 5, "crystalMine": 3, "..." : "..." },
  "resources": { "metal": 50000, "crystal": 20000, "deuterium": 5000 },
  "ships": { "lightFighter": 10, "...": 0 },
  "queue": [],
  "lastTickAt": 1708610000000
}
```

---

### GET /api/planet/:id/resources
Get resources with production rates.

**Response 200:**
```json
{
  "resources": { "metal": 50000, "crystal": 20000, "deuterium": 5000 },
  "production": { "metal": 1200, "crystal": 600, "deuterium": 200 }
}
```

---

### GET /api/planet/:id/buildings
Get building levels.

**Response 200:**
```json
{ "metalMine": 5, "crystalMine": 3, "deutSynth": 2, "...": 0 }
```

---

### GET /api/planet/:id/queue
Get build queue.

**Response 200:**
```json
[
  { "buildingId": 1, "targetLevel": 6, "timeStart": 1708610000, "timeEnd": 1708611200 }
]
```

---

### POST /api/planet/:id/queue
Add building to queue.

**Request:**
```json
{ "buildingId": 1, "targetLevel": 6 }
```

**Response 200:** Updated queue state.
**Response 400:** Insufficient resources or queue full.
**Response 500:** Server error.

---

### POST /api/planet/:id/initialize
Initialize planet with starting state.

**Request:**
```json
{
  "playerId": "string",
  "coordinate": { "galaxy": 1, "system": 50, "position": 7 },
  "temperature": 30,
  "fields": 180
}
```

**Response 200:** Initial planet state.

---

### POST /api/planet/:id/agent/run
Manually trigger AI build agent for this planet.

**Response 200:**
```json
{
  "decision": {
    "action": "build",
    "buildingId": 1,
    "reason": "Metal mine produces high ROI at this level"
  }
}
```

**Response 400:** No strategy assigned.
**Response 500:** Agent failure.

---

### POST /api/planet/:id/agent/enable
Enable automatic cron agent.

**Response 200:**
```json
{ "agent_enabled": true }
```

---

### POST /api/planet/:id/agent/disable
Disable automatic cron agent.

**Response 200:**
```json
{ "agent_enabled": false }
```

---

## Strategies

### GET /api/strategies
List build strategies for a player.

**Query:** `?player_id=<id>`

**Response 200:**
```json
[{ "id": "strat-xxx", "name": "Rush Metal", "steps": [] }]
```

**Response 400:** Missing `player_id`.

---

### GET /api/strategies/:id
Get specific strategy.

**Response 200:**
```json
{
  "id": "strat-xxx",
  "player_id": "p1",
  "name": "Rush Metal",
  "steps": [{ "buildingId": 1, "targetLevel": 10 }]
}
```

**Response 404:** Strategy not found.

---

### POST /api/strategies
Create new strategy.

**Request:**
```json
{
  "playerId": "p1",
  "name": "Rush Metal",
  "steps": [{ "buildingId": 1, "targetLevel": 10 }]
}
```

**Response 201:**
```json
{ "id": "strat-xxx", "playerId": "p1", "name": "Rush Metal", "steps": [] }
```

---

## Fleet

### POST /api/fleet/dispatch
Dispatch a fleet mission.

**Request:**
```json
{
  "fromPlanetId": "planet-1",
  "toCoord": { "galaxy": 1, "system": 101, "position": 5 },
  "ships": { "battleship": 10, "largeCargo": 5 },
  "missionType": "attack",
  "resources": { "metal": 0, "crystal": 0, "deuterium": 0 },
  "speedPercent": 100,
  "playerId": "p1"
}
```

**Response 201:**
```json
{
  "mission": {
    "id": "fleet-xxx",
    "missionType": "attack",
    "missionStatus": "in_transit",
    "timeDeparture": 1708610000,
    "timeArrival": 1708613600,
    "fuelConsumed": 250,
    "ships": { "battleship": 10 },
    "targetCoordinate": { "galaxy": 1, "system": 101, "position": 5 }
  }
}
```

**Response 400:** Missing fields or fleet validation failure.
**Response 404:** Source planet not found.

---

### POST /api/fleet/send
Legacy fleet send endpoint.

**Response 501:** `{ "error": "Fleet send not yet implemented — use POST /api/fleet/dispatch instead" }`

---

### GET /api/fleet/missions
List fleet missions for a player.

**Query:** `?player_id=<id>`

**Response 200:**
```json
[{
  "id": "fleet-xxx",
  "mission_type": "attack",
  "mission_status": "in_transit",
  "time_departure": 1708610000,
  "time_arrival": 1708613600,
  "planet_id_from": "planet-1",
  "galaxy_to": 1,
  "system_to": 101,
  "position_to": 5
}]
```

**Response 400:** Missing `player_id`.

---

### GET /api/fleet/missions/:id
Get mission details.

**Response 200:** Full fleet_missions row.
**Response 404:** Mission not found.

---

### POST /api/fleet/missions/:id/recall
Recall a fleet.

**Response 501:** `{ "error": "Fleet recall not yet implemented" }`

---

## Battle Reports

### GET /api/battle-reports
List battle reports for a player.

**Query:** `?player_id=<id>`

**Response 200:**
```json
[{
  "id": "battle-xxx",
  "attacker_id": "p1",
  "defender_id": "p2",
  "winner": "attacker",
  "rounds_fought": 3,
  "attacker_loss_metal": 1500,
  "attacker_loss_crystal": 500,
  "attacker_loss_deuterium": 0,
  "defender_loss_metal": 6000,
  "defender_loss_crystal": 2000,
  "defender_loss_deuterium": 0,
  "loot_metal": 1000,
  "loot_crystal": 500,
  "loot_deuterium": 0,
  "created_at": 1708610000
}]
```

**Response 400:** Missing `player_id`.

---

### GET /api/battle-reports/:id
Get full battle report with round-level data.

**Response 200:**
```json
{
  "...all columns...",
  "battle_data": { "rounds": [], "debrisField": {} }
}
```

**Response 404:** Report not found.

---

## Shipyard

### POST /api/planet/:id/ships/build
Build ships at this planet's shipyard.

**Request:**
```json
{ "shipType": "lightFighter", "count": 10 }
```

**Response 200:** Updated shipyard queue.
**Response 400:** Prerequisites not met or insufficient resources.

---

### GET /api/planet/:id/ships/queue
Get shipyard build queue.

**Response 200:**
```json
{
  "currentOrder": {
    "shipType": "lightFighter",
    "count": 10,
    "buildTimePer": 120,
    "totalTime": 1200,
    "totalCost": { "metal": 30000, "crystal": 10000, "deuterium": 0 }
  },
  "orders": [],
  "currentProgress": 3,
  "startedAt": 1708610000000
}
```

---

### POST /api/planet/:id/ships/cancel
Cancel a queued ship order (refunds resources).

**Request:**
```json
{ "orderIndex": 0 }
```

**Response 200:** Cancelled order details.
**Response 400:** Invalid index.

---

### GET /api/planet/:id/ships/available
List all ship types with buildability for this planet.

**Response 200:**
```json
[{
  "shipType": "lightFighter",
  "name": "Light Fighter",
  "canBuild": true,
  "cost": { "metal": 3000, "crystal": 1000, "deuterium": 0 },
  "buildTime": 120
}]
```

---

## Galaxy Map

### GET /api/galaxy/:galaxy/:system
Get 15-slot system view.

**Response 200:**
```json
{
  "galaxy": 1,
  "system": 50,
  "slots": [
    { "position": 1, "occupied": false },
    { "position": 2, "occupied": true, "planetName": "...", "playerName": "...", "allianceTag": "SEM" }
  ]
}
```

**Response 400:** Non-integer galaxy/system.

---

### GET /api/galaxy/:galaxy
Get galaxy occupancy summary.

**Response 200:**
```json
{
  "galaxy": 1,
  "systems": [
    { "system": 1, "occupied": 3 },
    { "system": 2, "occupied": 0 }
  ]
}
```

**Response 400:** Non-integer galaxy.

---

### POST /api/galaxy/colonize
Colonize an empty position.

**Request:**
```json
{
  "playerId": "p1",
  "fromPlanetId": "planet-1",
  "galaxy": 2,
  "system": 100,
  "position": 8
}
```

**Response 201:**
```json
{ "success": true, "planetId": "planet-new-xxx" }
```

**Response 400:** Position occupied, fleet validation failed, or missing fields.

---

## NFT / Solana

### POST /api/nft/mint
Mint a compressed NFT on Solana devnet.

**Request:**
```json
{
  "playerId": "p1",
  "assetType": "ship_skin",
  "name": "Nebula Striker",
  "imageUrl": "https://r2.cosmic-protocol.dev/ship-skins/nebula.png",
  "ownerPublicKey": "4Nd1m..."
}
```

**Response 201:**
```json
{
  "asset": {
    "id": "nft-xxx",
    "playerId": "p1",
    "mintAddress": "...",
    "assetType": "ship_skin",
    "name": "Nebula Striker",
    "solanaTx": "5xkW...",
    "network": "devnet",
    "createdAt": 1708610000
  },
  "signature": "5xkW...",
  "assetId": "..."
}
```

**Response 400:** Missing fields, invalid `assetType`, or invalid `ownerPublicKey`.
**Auth:** None (caller must provide valid ownerPublicKey).

---

### GET /api/nft/list
List NFT assets for a player.

**Query:** `?player_id=<id>`

**Response 200:** Array of NFTAsset records (up to 100).
**Response 400:** Missing `player_id`.

---

### GET /api/nft/:id
Get single NFT asset by ID.

**Response 200:** NFTAsset record.
**Response 404:** Not found.

---

## AI Asset Generation

### POST /api/assets/generate
Generate an AI-powered game asset image.

**Request:**
```json
{
  "assetType": "ship_skin",
  "style": "cyberpunk",
  "rarity": "rare"
}
```

**Response 201:**
```json
{
  "imageUrl": "https://r2.cosmic-protocol.dev/...",
  "imageBase64": "...",
  "name": "Cyberpunk Strike Fighter",
  "description": "A rare cyberpunk ship skin...",
  "attributes": [
    { "trait_type": "rarity", "value": "rare" },
    { "trait_type": "style", "value": "cyberpunk" }
  ]
}
```

**Response 400:** Invalid `assetType`, `style`, or `rarity`.
**Response 503:** R2 not configured.

---

## Achievements & Stats

### GET /api/achievements
List all achievement definitions (static, no auth).

**Response 200:**
```json
[{
  "id": "first_blood",
  "name": "First Blood",
  "description": "Win your first battle.",
  "category": "combat",
  "icon": "...",
  "requirement": { "type": "first_battle", "threshold": 1 },
  "points": 10
}]
```

---

### GET /api/player/:id/achievements
List achievements unlocked by a player.

**Response 200:**
```json
[{
  "achievementId": "warrior",
  "playerId": "p1",
  "unlockedAt": 1708610000,
  "progress": 100,
  "achievement": { "...full Achievement object..." }
}]
```

---

### POST /api/player/:id/check-achievements
Evaluate all achievements and unlock newly earned ones.

**Response 200:**
```json
{
  "newlyUnlocked": ["warrior", "first_colony"],
  "checkedAt": 1708610000
}
```

---

### GET /api/player/:id/stats
Get full player e-sport stats.

**Response 200:**
```json
{
  "battlesWon": 15,
  "battlesLost": 3,
  "battlesDraw": 1,
  "shipsDestroyed": 2400,
  "shipsLost": 890,
  "resourcesRaided": 5000000,
  "fleetsDispatched": 80,
  "espionageSent": 45,
  "buildingsBuilt": 120,
  "researchCompleted": 9,
  "planetsColonized": 3,
  "tradesCompleted": 12,
  "agentDecisions": 240,
  "playTimeDays": 14,
  "allianceJoined": true,
  "deathstarsBuilt": 0
}
```

---

### GET /api/stats/top
Leaderboard for a specific stat.

**Query:** `?stat=battles_won&limit=10`

**Valid stat values:** `battles_won`, `ships_destroyed`, `resources_raided_metal`, `fleets_dispatched`, `planets_colonized`, `research_completed`, `buildings_built`, `trades_completed`, `agent_decisions`

**Response 200:**
```json
{
  "stat": "battles_won",
  "leaderboard": [
    { "player_id": "p1", "player_name": "Alice", "value": 250 }
  ]
}
```

**Response 400:** Missing or invalid `stat`, or non-positive `limit`.

---

## Espionage

### POST /api/espionage/send
Send espionage probes.

**Request:**
```json
{
  "fromPlanetId": "planet-1",
  "targetGalaxy": 1,
  "targetSystem": 100,
  "targetPosition": 5,
  "probeCount": 5,
  "playerId": "p1"
}
```

**Response 201:**
```json
{
  "report": {
    "id": "esp-xxx",
    "infoLevel": 2,
    "resources": { "metal": 150000, "crystal": 75000, "deuterium": 30000 },
    "fleet": { "lightFighter": 20 },
    "defenses": { "rocketLauncher": 50 },
    "buildings": null,
    "research": null,
    "counterChance": 12,
    "probesSent": 5,
    "probesLost": 0,
    "targetCoordinate": { "galaxy": 1, "system": 100, "position": 5 }
  }
}
```

**Response 400:** Missing fields, not enough probes, target is own planet.
**Response 404:** Source planet not found or no planet at target.

---

### GET /api/espionage/reports
List espionage reports for a player.

**Query:** `?player_id=<id>&limit=50` (max 100)

**Response 200:** Array of deserialized EspionageReport objects.
**Response 400:** Missing `player_id`.

---

### GET /api/espionage/reports/:id
Get single espionage report.

**Response 200:** Full EspionageReport object.
**Response 404:** Report not found.

---

## Messages

### POST /api/messages/send
Send a message to another player.

**Request:**
```json
{
  "fromPlayerId": "p1",
  "toPlayerId": "p2",
  "subject": "Alliance offer",
  "body": "Join us!"
}
```

**Response 201:** GameMessage object.
**Response 400:** Empty subject/body, self-send, sender/recipient not found.

---

### GET /api/messages/inbox
Get paginated inbox.

**Query:** `?player_id=<id>&page=1&limit=20`

**Response 200:**
```json
{
  "messages": [],
  "total": 5,
  "page": 1,
  "totalPages": 1
}
```

**Response 400:** Missing `player_id`.

---

### GET /api/messages/outbox
Get paginated sent messages.

**Query:** `?player_id=<id>&page=1&limit=20`

**Response 200:** Same shape as inbox.
**Response 400:** Missing `player_id`.

---

### GET /api/messages/unread-count
Get unread message count.

**Query:** `?player_id=<id>`

**Response 200:**
```json
{ "unreadCount": 3 }
```

**Response 400:** Missing `player_id`.

---

### POST /api/messages/mark-all-read
Mark all inbox messages as read.

**Query:** `?player_id=<id>`

**Response 200:**
```json
{ "updated": 3 }
```

**Response 400:** Missing `player_id`.

---

### GET /api/messages/:id
Get a single message and mark as read.

**Query:** `?player_id=<id>`

**Response 200:** GameMessage object.
**Response 404:** Not found or unauthorized.
**Response 400:** Missing `player_id`.

---

### DELETE /api/messages/:id
Soft-delete a message.

**Query:** `?player_id=<id>`

**Response 200:**
```json
{ "deleted": true }
```

**Response 404:** Not found or unauthorized.
**Response 400:** Missing `player_id`.

---

## Error Responses

All endpoints return a consistent error envelope on failure:

```json
{ "error": "Human-readable error message" }
```

| Status | Meaning |
|--------|---------|
| 400 | Bad request (validation, missing params) |
| 404 | Resource not found |
| 500 | Internal server error |
| 501 | Not implemented (legacy endpoints) |
| 503 | Service unavailable (R2 not configured) |
