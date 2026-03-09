-- Cosmic Protocol: D1 Schema

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  alliance_tag TEXT,
  referral_code TEXT UNIQUE,
  referred_by TEXT,
  dark_matter INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER NOT NULL DEFAULT (unixepoch()),
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
  -- Serialized fleet/resource snapshot for expedition history
  ships_json TEXT,
  resources_json TEXT,
  fuel_consumed INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS espionage_reports (
  id TEXT PRIMARY KEY,
  attacker_id TEXT NOT NULL,
  defender_id TEXT,
  target_galaxy INTEGER NOT NULL,
  target_system INTEGER NOT NULL,
  target_position INTEGER NOT NULL,
  target_player_name TEXT NOT NULL DEFAULT 'Unknown',
  resources_json TEXT,
  fleet_json TEXT,
  defenses_json TEXT,
  buildings_json TEXT,
  research_json TEXT,
  counter_chance REAL NOT NULL DEFAULT 0,
  probes_lost INTEGER NOT NULL DEFAULT 0,
  probes_sent INTEGER NOT NULL DEFAULT 1,
  info_level INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_espionage_attacker ON espionage_reports(attacker_id);
CREATE INDEX IF NOT EXISTS idx_espionage_defender ON espionage_reports(defender_id);
CREATE INDEX IF NOT EXISTS idx_espionage_target ON espionage_reports(target_galaxy, target_system, target_position);
CREATE INDEX IF NOT EXISTS idx_espionage_date ON espionage_reports(created_at);

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
  name TEXT NOT NULL UNIQUE,
  tag TEXT NOT NULL UNIQUE,
  founder_id TEXT NOT NULL REFERENCES players(id),
  description TEXT NOT NULL DEFAULT '',
  member_count INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS alliance_members (
  player_id TEXT NOT NULL REFERENCES players(id),
  alliance_id TEXT NOT NULL REFERENCES alliances(id),
  role TEXT NOT NULL DEFAULT 'member',  -- 'founder' | 'officer' | 'member' | 'applicant'
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (player_id, alliance_id)
);
CREATE INDEX IF NOT EXISTS idx_alliance_members ON alliance_members(alliance_id);
CREATE INDEX IF NOT EXISTS idx_alliance_members_player ON alliance_members(player_id);

CREATE TABLE IF NOT EXISTS alliance_applications (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  alliance_id TEXT NOT NULL REFERENCES alliances(id),
  message TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_alliance_applications ON alliance_applications(alliance_id);
CREATE INDEX IF NOT EXISTS idx_alliance_applications_player ON alliance_applications(player_id);

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
-- NFT ASSETS (Solana compressed NFTs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS nft_assets (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  mint_address TEXT,
  asset_type TEXT NOT NULL,       -- 'ship_skin' | 'planet_theme' | 'booster' | 'rare_ship'
  name TEXT NOT NULL,
  image_url TEXT,
  metadata_uri TEXT,
  solana_tx TEXT,
  network TEXT DEFAULT 'devnet',  -- 'devnet' | 'mainnet-beta'
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_nft_player ON nft_assets(player_id);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  from_player_id TEXT,
  from_player_name TEXT NOT NULL DEFAULT 'System',
  to_player_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'player',
  read INTEGER NOT NULL DEFAULT 0,
  deleted_by_sender INTEGER NOT NULL DEFAULT 0,
  deleted_by_recipient INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_to ON messages(to_player_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_player_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(to_player_id, read, deleted_by_recipient);

-- Trade offers
CREATE TABLE IF NOT EXISTS trade_offers (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  planet_id TEXT NOT NULL,
  offer_resource TEXT NOT NULL,
  offer_amount INTEGER NOT NULL,
  want_resource TEXT NOT NULL,
  want_amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  accepted_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trade_offers(status, created_at);
CREATE INDEX IF NOT EXISTS idx_trades_player ON trade_offers(player_id);

-- ============================================================================
-- TOURNAMENT SYSTEM (E-Sport)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'arena_1v1' | 'alliance_war' | 'speed_round' | 'koth'
  max_players INTEGER NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 0,
  total_rounds INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'open' | 'in_progress' | 'completed'
  season_id TEXT REFERENCES seasons(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_season ON tournaments(season_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_date ON tournaments(created_at);

CREATE TABLE IF NOT EXISTS tournament_players (
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  seed_rank INTEGER NOT NULL,
  current_round INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (tournament_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_tournament_players_player ON tournament_players(player_id);
CREATE INDEX IF NOT EXISTS idx_tournament_players_active ON tournament_players(tournament_id, is_active);

CREATE TABLE IF NOT EXISTS brackets (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  round_number INTEGER NOT NULL,
  total_matches INTEGER NOT NULL,
  bracket_data TEXT NOT NULL,  -- JSON bracket tree structure
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_brackets_tournament ON brackets(tournament_id);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  bracket_id TEXT NOT NULL REFERENCES brackets(id),
  player1_id TEXT NOT NULL REFERENCES players(id),
  player2_id TEXT NOT NULL REFERENCES players(id),
  winner_id TEXT REFERENCES players(id),
  loser_id TEXT REFERENCES players(id),
  battle_data TEXT,  -- JSON battle result from battleService
  scheduled_at INTEGER NOT NULL,
  completed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled',  -- 'scheduled' | 'in_progress' | 'completed' | 'forfeited' | 'draw'
  round INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_bracket ON matches(bracket_id);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_round ON matches(tournament_id, round);

CREATE TABLE IF NOT EXISTS seasons (
  id TEXT PRIMARY KEY,
  season_number INTEGER UNIQUE NOT NULL,
  start_date INTEGER NOT NULL,
  end_date INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'closed'
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_seasons_status ON seasons(status);
CREATE INDEX IF NOT EXISTS idx_seasons_number ON seasons(season_number);

CREATE TABLE IF NOT EXISTS season_leaderboard (
  season_id TEXT NOT NULL REFERENCES seasons(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  points INTEGER NOT NULL DEFAULT 0,
  rank INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (season_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_season_leaderboard_rank ON season_leaderboard(season_id, rank);
CREATE INDEX IF NOT EXISTS idx_season_leaderboard_points ON season_leaderboard(season_id, points DESC);

CREATE TABLE IF NOT EXISTS tournament_rewards (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL REFERENCES tournaments(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  placement INTEGER NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  achievement_id TEXT,
  title_earned TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_tournament_rewards_tournament ON tournament_rewards(tournament_id);
CREATE INDEX IF NOT EXISTS idx_tournament_rewards_player ON tournament_rewards(player_id);

-- ============================================================================
-- NOTIFICATION SYSTEM
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  type TEXT NOT NULL,        -- NotificationType enum value
  priority TEXT NOT NULL,    -- 'critical' | 'warning' | 'info'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data TEXT,                 -- optional JSON metadata
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notifications_player ON notifications(player_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(player_id, read);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(player_id, type);
CREATE INDEX IF NOT EXISTS idx_notifications_priority ON notifications(player_id, priority);

CREATE TABLE IF NOT EXISTS notification_preferences (
  player_id TEXT PRIMARY KEY,
  enabled_types TEXT NOT NULL,       -- JSON: Record<NotificationType, boolean>
  minimum_priority TEXT NOT NULL DEFAULT 'info',  -- 'critical' | 'warning' | 'info'
  updated_at INTEGER NOT NULL
);

-- ============================================================================
-- H2M (HUMAN-TO-MACHINE) LEARNING PROTOCOL
-- ============================================================================

CREATE TABLE IF NOT EXISTS override_analysis (
  id TEXT PRIMARY KEY,
  planet_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  agent_build_id TEXT NOT NULL,
  agent_building_id INTEGER NOT NULL,
  agent_level INTEGER NOT NULL,
  agent_reason TEXT,
  manual_build_id TEXT NOT NULL,
  manual_building_id INTEGER NOT NULL,
  manual_level INTEGER NOT NULL,
  time_delta INTEGER NOT NULL,          -- seconds between agent and manual build
  classification TEXT NOT NULL,          -- OverrideClassification enum
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_override_planet ON override_analysis(planet_id);
CREATE INDEX IF NOT EXISTS idx_override_player ON override_analysis(player_id);
CREATE INDEX IF NOT EXISTS idx_override_classification ON override_analysis(classification);
CREATE INDEX IF NOT EXISTS idx_override_date ON override_analysis(created_at);

CREATE TABLE IF NOT EXISTS strategy_history (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  planet_id TEXT,                        -- null = player-wide strategy
  strategy_json TEXT NOT NULL,           -- JSON serialized strategy steps
  source TEXT NOT NULL DEFAULT 'learned', -- 'initial' | 'learned' | 'manual'
  override_count INTEGER NOT NULL DEFAULT 0,
  adoption_rate REAL NOT NULL DEFAULT 0,
  parent_strategy_id TEXT,               -- previous strategy this was derived from
  changes_summary TEXT,                  -- human-readable diff
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_strategy_history_player ON strategy_history(player_id);
CREATE INDEX IF NOT EXISTS idx_strategy_history_planet ON strategy_history(planet_id);
CREATE INDEX IF NOT EXISTS idx_strategy_history_date ON strategy_history(created_at);

-- ============================================================================
-- MODERATION & ADMIN
-- ============================================================================

CREATE TABLE IF NOT EXISTS player_bans (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  reason TEXT NOT NULL,
  banned_by TEXT NOT NULL,              -- Admin user ID
  banned_at INTEGER NOT NULL,           -- Unix timestamp (seconds)
  expires_at INTEGER,                   -- null = permanent, otherwise expiry timestamp
  is_active INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = lifted/expired
  unbanned_by TEXT,                     -- Admin who lifted ban
  unbanned_at INTEGER,                  -- When ban was lifted
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_player_bans_player ON player_bans(player_id);
CREATE INDEX IF NOT EXISTS idx_player_bans_active ON player_bans(player_id, is_active);
CREATE INDEX IF NOT EXISTS idx_player_bans_expires ON player_bans(expires_at);
CREATE INDEX IF NOT EXISTS idx_player_bans_date ON player_bans(banned_at);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES players(id),  -- player who owns the code
  referee_id TEXT NOT NULL REFERENCES players(id),   -- player who applied the code
  code TEXT NOT NULL,                                -- referral code that was applied
  bonus_amount INTEGER NOT NULL DEFAULT 250,         -- dark matter awarded to each side
  applied_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee ON referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_unique_referee ON referrals(referee_id);


-- ============================================================================
-- PROTECTION: Newbie Protection + Bash Rule
-- ============================================================================

CREATE TABLE IF NOT EXISTS attack_log (
  id TEXT PRIMARY KEY,
  attacker_id TEXT NOT NULL,
  defender_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attack_log_pair ON attack_log(attacker_id, defender_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_attack_log_timestamp ON attack_log(timestamp);
CREATE TABLE IF NOT EXISTS player_relations (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  target_id TEXT NOT NULL REFERENCES players(id),
  relation_type TEXT NOT NULL DEFAULT 'neutral' CHECK(relation_type IN ('ally','enemy','neutral')),
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(player_id, target_id)
);
CREATE INDEX IF NOT EXISTS idx_player_relations_player ON player_relations(player_id);

-- ============================================================================
-- PLAYER STATS (E-sport counters)
-- ============================================================================

CREATE TABLE IF NOT EXISTS player_stats (
  player_id TEXT PRIMARY KEY REFERENCES players(id),
  battles_won INTEGER NOT NULL DEFAULT 0,
  battles_lost INTEGER NOT NULL DEFAULT 0,
  battles_draw INTEGER NOT NULL DEFAULT 0,
  ships_destroyed INTEGER NOT NULL DEFAULT 0,
  ships_lost INTEGER NOT NULL DEFAULT 0,
  resources_raided_metal INTEGER NOT NULL DEFAULT 0,
  resources_raided_crystal INTEGER NOT NULL DEFAULT 0,
  resources_raided_deut INTEGER NOT NULL DEFAULT 0,
  resources_lost_metal INTEGER NOT NULL DEFAULT 0,
  resources_lost_crystal INTEGER NOT NULL DEFAULT 0,
  resources_lost_deut INTEGER NOT NULL DEFAULT 0,
  fleets_dispatched INTEGER NOT NULL DEFAULT 0,
  espionage_sent INTEGER NOT NULL DEFAULT 0,
  buildings_built INTEGER NOT NULL DEFAULT 0,
  research_completed INTEGER NOT NULL DEFAULT 0,
  planets_colonized INTEGER NOT NULL DEFAULT 0,
  trades_completed INTEGER NOT NULL DEFAULT 0,
  agent_decisions INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_player_stats_battles_won ON player_stats(battles_won DESC);
CREATE INDEX IF NOT EXISTS idx_player_stats_ships_destroyed ON player_stats(ships_destroyed DESC);
CREATE INDEX IF NOT EXISTS idx_player_stats_fleets ON player_stats(fleets_dispatched DESC);

-- ============================================================================
-- DARK MATTER (premium currency)
-- ============================================================================

CREATE TABLE IF NOT EXISTS dark_matter (
  player_id TEXT PRIMARY KEY REFERENCES players(id),
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS dark_matter_transactions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  amount INTEGER NOT NULL,
  source TEXT NOT NULL,
  balance_before INTEGER NOT NULL DEFAULT 0,
  balance_after INTEGER NOT NULL DEFAULT 0,
  reference TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_dm_transactions_player ON dark_matter_transactions(player_id, created_at);

-- ============================================================================
-- PLAYER ACHIEVEMENTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS player_achievements (
  player_id TEXT NOT NULL REFERENCES players(id),
  achievement_id TEXT NOT NULL,
  unlocked_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (player_id, achievement_id)
);
CREATE INDEX IF NOT EXISTS idx_player_achievements_player ON player_achievements(player_id);
CREATE INDEX IF NOT EXISTS idx_player_achievements_achievement ON player_achievements(achievement_id);

-- ============================================================================
-- TUTORIAL PROGRESS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tutorial_progress (
  player_id TEXT PRIMARY KEY REFERENCES players(id),
  completed_steps TEXT NOT NULL DEFAULT '[]',  -- JSON: string[]
  claimed_steps TEXT NOT NULL DEFAULT '[]',    -- JSON: string[]
  current_step_id TEXT,
  skipped INTEGER NOT NULL DEFAULT 0,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER
);

CREATE TABLE IF NOT EXISTS tutorial_step_log (
  player_id TEXT NOT NULL REFERENCES players(id),
  step_id TEXT NOT NULL,
  completed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (player_id, step_id)
);
CREATE INDEX IF NOT EXISTS idx_tutorial_step_log_player ON tutorial_step_log(player_id);

-- ============================================================================
-- DAILY MISSIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_missions (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  mission_type TEXT NOT NULL,
  date_key TEXT NOT NULL,          -- YYYY-MM-DD UTC
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'completed' | 'claimed'
  progress INTEGER NOT NULL DEFAULT 0,
  target INTEGER NOT NULL,
  assigned_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  claimed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_daily_missions_player ON daily_missions(player_id, date_key);
CREATE INDEX IF NOT EXISTS idx_daily_missions_status ON daily_missions(player_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_missions_unique ON daily_missions(player_id, mission_type, date_key);

-- ============================================================================
-- OFFICERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS officers (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  officer_type TEXT NOT NULL,
  activated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_officers_player ON officers(player_id, officer_type, expires_at);
CREATE INDEX IF NOT EXISTS idx_officers_expires ON officers(expires_at);

-- ============================================================================
-- FRIENDSHIPS
-- ============================================================================

CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  friend_id TEXT NOT NULL REFERENCES players(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_friendships_pair ON friendships(player_id, friend_id);
CREATE INDEX IF NOT EXISTS idx_friendships_player ON friendships(player_id, status);
CREATE INDEX IF NOT EXISTS idx_friendships_friend ON friendships(friend_id, status);
CREATE TABLE IF NOT EXISTS moon_building_levels (
  moon_id TEXT NOT NULL REFERENCES moons(id),
  jump_gate INTEGER NOT NULL DEFAULT 0,
  lunar_base INTEGER NOT NULL DEFAULT 0,
  sensor_phalanx INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (moon_id)
);
CREATE INDEX IF NOT EXISTS idx_moon_building_levels_moon ON moon_building_levels(moon_id);

CREATE TABLE IF NOT EXISTS jump_gate_logs (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  source_moon_id TEXT NOT NULL REFERENCES moons(id),
  destination_moon_id TEXT NOT NULL REFERENCES moons(id),
  ships_json TEXT NOT NULL,
  teleported_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_jump_gate_logs_player ON jump_gate_logs(player_id, teleported_at);
CREATE INDEX IF NOT EXISTS idx_jump_gate_logs_source ON jump_gate_logs(source_moon_id, teleported_at);
CREATE INDEX IF NOT EXISTS idx_jump_gate_logs_dest ON jump_gate_logs(destination_moon_id, teleported_at);
CREATE TABLE IF NOT EXISTS phalanx_scans (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL REFERENCES players(id),
  moon_id TEXT NOT NULL REFERENCES moons(id),
  phalanx_level INTEGER NOT NULL DEFAULT 1,
  target_galaxy INTEGER NOT NULL,
  target_system INTEGER NOT NULL,
  target_position INTEGER NOT NULL,
  deuterium_cost INTEGER NOT NULL DEFAULT 0,
--
CREATE INDEX IF NOT EXISTS idx_phalanx_scans_player ON phalanx_scans(player_id);
CREATE INDEX IF NOT EXISTS idx_phalanx_scans_moon ON phalanx_scans(moon_id);
CREATE INDEX IF NOT EXISTS idx_phalanx_scans_target ON phalanx_scans(target_galaxy, target_system, target_position);

-- ============================================================================
-- NFT ASSETS (Solana compressed NFTs)
-- ============================================================================

CREATE TABLE IF NOT EXISTS nft_assets (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
CREATE TABLE IF NOT EXISTS battle_replays (
  id TEXT PRIMARY KEY,
  attacker_id TEXT NOT NULL REFERENCES players(id),
  defender_id TEXT NOT NULL REFERENCES players(id),
  planet_id TEXT NOT NULL REFERENCES planets(id),
  -- Summary fields for list views
  winner TEXT NOT NULL,          -- 'attacker' | 'defender' | 'draw'
  galaxy INTEGER NOT NULL,
  system INTEGER NOT NULL,
  position INTEGER NOT NULL,
  attacker_name TEXT NOT NULL,
  defender_name TEXT NOT NULL,
  -- Full replay JSON
--
CREATE INDEX IF NOT EXISTS idx_battle_replays_timestamp ON battle_replays(timestamp DESC);
