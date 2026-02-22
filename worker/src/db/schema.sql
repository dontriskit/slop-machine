-- Cosmic Protocol: D1 Schema

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  alliance_tag TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS planets (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  name TEXT NOT NULL DEFAULT 'Homeworld',
  galaxy INTEGER NOT NULL,
  system INTEGER NOT NULL,
  position INTEGER NOT NULL,
  planet_type TEXT NOT NULL DEFAULT 'planet',  -- 'planet' | 'moon' | 'expedition'
  temperature INTEGER NOT NULL DEFAULT 30,
  fields INTEGER NOT NULL DEFAULT 163,
  universe_speed INTEGER NOT NULL DEFAULT 1,
  agent_enabled INTEGER NOT NULL DEFAULT 0,  -- 1 = auto build-order active
  strategy_id TEXT REFERENCES build_strategies(id),
  abandoned_at INTEGER,  -- null = active, timestamp = abandoned time
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(galaxy, system, position)
);

CREATE TABLE IF NOT EXISTS build_strategies (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  name TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '[]',  -- JSON: [{buildingId, targetLevel}]
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS build_history (
  id TEXT PRIMARY KEY,
  planet_id TEXT NOT NULL REFERENCES planets(id),
  building_id INTEGER NOT NULL,
  level INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',  -- 'agent' | 'manual'
  ai_reason TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS fleets (
  id TEXT PRIMARY KEY,
  planet_id TEXT NOT NULL REFERENCES planets(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  -- Ship units (quantities at this location)
  light_fighter INTEGER NOT NULL DEFAULT 0,
  heavy_fighter INTEGER NOT NULL DEFAULT 0,
  cruiser INTEGER NOT NULL DEFAULT 0,
  battleship INTEGER NOT NULL DEFAULT 0,
  battlecruiser INTEGER NOT NULL DEFAULT 0,
  bomber INTEGER NOT NULL DEFAULT 0,
  destroyer INTEGER NOT NULL DEFAULT 0,
  deathstar INTEGER NOT NULL DEFAULT 0,
  small_cargo INTEGER NOT NULL DEFAULT 0,
  large_cargo INTEGER NOT NULL DEFAULT 0,
  colony_ship INTEGER NOT NULL DEFAULT 0,
  recycler INTEGER NOT NULL DEFAULT 0,
  espionage_probe INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS fleet_missions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  planet_id_from TEXT NOT NULL REFERENCES planets(id),
  planet_id_to TEXT REFERENCES planets(id),  -- null if expedition/colonize to empty coords
  galaxy_to INTEGER,  -- for colonization to empty position
  system_to INTEGER,
  position_to INTEGER,
  mission_type TEXT NOT NULL,  -- 'attack' | 'transport' | 'colonize' | 'expedition' | 'return'
  mission_status TEXT NOT NULL DEFAULT 'in_transit',  -- 'in_transit' | 'arrived' | 'returned' | 'canceled'
  time_departure INTEGER NOT NULL,  -- unix seconds
  time_arrival INTEGER NOT NULL,    -- unix seconds
  hold_time INTEGER NOT NULL DEFAULT 0,  -- holding duration at target in hours
  -- Resources
  metal INTEGER NOT NULL DEFAULT 0,
  crystal INTEGER NOT NULL DEFAULT 0,
  deuterium INTEGER NOT NULL DEFAULT 0,
  -- Ships (same columns as fleets table)
  light_fighter INTEGER NOT NULL DEFAULT 0,
  heavy_fighter INTEGER NOT NULL DEFAULT 0,
  cruiser INTEGER NOT NULL DEFAULT 0,
  battleship INTEGER NOT NULL DEFAULT 0,
  battlecruiser INTEGER NOT NULL DEFAULT 0,
  bomber INTEGER NOT NULL DEFAULT 0,
  destroyer INTEGER NOT NULL DEFAULT 0,
  deathstar INTEGER NOT NULL DEFAULT 0,
  small_cargo INTEGER NOT NULL DEFAULT 0,
  large_cargo INTEGER NOT NULL DEFAULT 0,
  colony_ship INTEGER NOT NULL DEFAULT 0,
  recycler INTEGER NOT NULL DEFAULT 0,
  espionage_probe INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS defenses (
  id TEXT PRIMARY KEY,
  planet_id TEXT NOT NULL REFERENCES planets(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  -- Defense units (quantities at this location)
  small_shield INTEGER NOT NULL DEFAULT 0,
  large_shield INTEGER NOT NULL DEFAULT 0,
  small_laser INTEGER NOT NULL DEFAULT 0,
  big_laser INTEGER NOT NULL DEFAULT 0,
  gauss_cannon INTEGER NOT NULL DEFAULT 0,
  ion_cannon INTEGER NOT NULL DEFAULT 0,
  anti_ballistic_missile INTEGER NOT NULL DEFAULT 0,
  interplanetary_missile INTEGER NOT NULL DEFAULT 0,
  plasma_turret INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS battle_reports (
  id TEXT PRIMARY KEY,
  attacker_id TEXT NOT NULL REFERENCES players(id),
  defender_id TEXT NOT NULL REFERENCES players(id),
  attacker_planet_id TEXT REFERENCES planets(id),
  defender_planet_id TEXT NOT NULL REFERENCES planets(id),
  mission_id TEXT REFERENCES fleet_missions(id),
  -- Battle outcome
  winner TEXT NOT NULL,  -- 'attacker' | 'defender' | 'draw'
  rounds_fought INTEGER NOT NULL,
  -- Losses (in resources)
  attacker_loss_metal INTEGER NOT NULL DEFAULT 0,
  attacker_loss_crystal INTEGER NOT NULL DEFAULT 0,
  attacker_loss_deuterium INTEGER NOT NULL DEFAULT 0,
  defender_loss_metal INTEGER NOT NULL DEFAULT 0,
  defender_loss_crystal INTEGER NOT NULL DEFAULT 0,
  defender_loss_deuterium INTEGER NOT NULL DEFAULT 0,
  -- Loot for attacker
  loot_metal INTEGER NOT NULL DEFAULT 0,
  loot_crystal INTEGER NOT NULL DEFAULT 0,
  loot_deuterium INTEGER NOT NULL DEFAULT 0,
  -- Raw battle data (JSON)
  battle_data TEXT,  -- JSON serialized battle report
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS moons (
  id TEXT PRIMARY KEY,
  planet_id TEXT NOT NULL REFERENCES planets(id),
  name TEXT NOT NULL DEFAULT 'Moon',
  fields INTEGER NOT NULL DEFAULT 1,
  size INTEGER NOT NULL DEFAULT 0,  -- moon size in km
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(planet_id)
);

CREATE TABLE IF NOT EXISTS debris_fields (
  galaxy INTEGER NOT NULL,
  system INTEGER NOT NULL,
  position INTEGER NOT NULL,
  metal INTEGER NOT NULL DEFAULT 0,
  crystal INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (galaxy, system, position)
);

CREATE TABLE IF NOT EXISTS alliances (
  id TEXT PRIMARY KEY,
  tag TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  founder_id TEXT NOT NULL REFERENCES players(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_planets_player ON planets(player_id);
CREATE INDEX IF NOT EXISTS idx_planets_agent ON planets(agent_enabled);
CREATE INDEX IF NOT EXISTS idx_planets_coord ON planets(galaxy, system, position);
CREATE INDEX IF NOT EXISTS idx_build_history_planet ON build_history(planet_id);
CREATE INDEX IF NOT EXISTS idx_strategies_player ON build_strategies(player_id);
CREATE INDEX IF NOT EXISTS idx_fleets_planet ON fleets(planet_id);
CREATE INDEX IF NOT EXISTS idx_fleets_player ON fleets(player_id);
CREATE INDEX IF NOT EXISTS idx_fleet_missions_player ON fleet_missions(player_id);
CREATE INDEX IF NOT EXISTS idx_fleet_missions_from ON fleet_missions(planet_id_from);
CREATE INDEX IF NOT EXISTS idx_fleet_missions_status ON fleet_missions(mission_status, time_arrival);
CREATE INDEX IF NOT EXISTS idx_defenses_planet ON defenses(planet_id);
CREATE INDEX IF NOT EXISTS idx_defenses_player ON defenses(player_id);
CREATE INDEX IF NOT EXISTS idx_battle_reports_attacker ON battle_reports(attacker_id);
CREATE INDEX IF NOT EXISTS idx_battle_reports_defender ON battle_reports(defender_id);
CREATE INDEX IF NOT EXISTS idx_battle_reports_planet ON battle_reports(defender_planet_id);
CREATE INDEX IF NOT EXISTS idx_battle_reports_date ON battle_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_moons_planet ON moons(planet_id);
CREATE INDEX IF NOT EXISTS idx_debris_fields_coord ON debris_fields(galaxy, system);

-- ============================================================================
-- MARKETPLACE: Trade Offers
-- ============================================================================

CREATE TABLE IF NOT EXISTS trade_offers (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  planet_id TEXT NOT NULL REFERENCES planets(id),
  offer_resource TEXT NOT NULL,   -- 'metal' | 'crystal' | 'deuterium'
  offer_amount INTEGER NOT NULL,
  want_resource TEXT NOT NULL,    -- 'metal' | 'crystal' | 'deuterium'
  want_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',  -- 'open' | 'accepted' | 'cancelled'
  accepted_by TEXT REFERENCES players(id),
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_trades_status ON trade_offers(status, created_at);
CREATE INDEX IF NOT EXISTS idx_trades_player ON trade_offers(player_id);
CREATE INDEX IF NOT EXISTS idx_trades_planet ON trade_offers(planet_id);
