-- Run once: npx wrangler d1 execute bamfieldsurfreport --remote --file=./schema.sql

CREATE TABLE IF NOT EXISTS peer_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spot_key TEXT NOT NULL,
  day_ymd TEXT NOT NULL,
  residual_ft REAL NOT NULL,
  model_ft REAL,
  period_s REAL,
  energy_kj REAL,
  swell_dir_deg REAL,
  wind_dir_deg REAL,
  wind_speed_kmh REAL,
  wind_swell_angle_deg REAL,
  observed_ft REAL,
  viewer_id TEXT,
  ts INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_peer_spot_ts ON peer_reviews (spot_key, ts DESC);
CREATE INDEX IF NOT EXISTS idx_peer_spot_day ON peer_reviews (spot_key, day_ymd);
