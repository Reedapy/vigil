-- ─── Vigil Database Schema ───────────────────────────────────────────────────
-- Applied automatically by Docker Compose on first PostgreSQL start.
-- Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE).

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── servers ──────────────────────────────────────────────────────────────────
-- One row per monitored server. agent_key authenticates metric POST requests.

CREATE TABLE IF NOT EXISTS servers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(255) NOT NULL,
  hostname     VARCHAR(255) NOT NULL,
  agent_key    VARCHAR(128) UNIQUE NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_servers_agent_key ON servers(agent_key);

-- ── metrics ───────────────────────────────────────────────────────────────────
-- Time-series table — one row per collection tick per server.
-- Partitioning and TimescaleDB are drop-in upgrades for high-volume deployments.

CREATE TABLE IF NOT EXISTS metrics (
  id                 BIGSERIAL   PRIMARY KEY,
  server_id          UUID        NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  collected_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cpu_percent        FLOAT       NOT NULL CHECK (cpu_percent        BETWEEN 0 AND 100),
  memory_percent     FLOAT       NOT NULL CHECK (memory_percent     BETWEEN 0 AND 100),
  memory_used_bytes  BIGINT      NOT NULL,
  memory_total_bytes BIGINT      NOT NULL,
  disk_percent       FLOAT       NOT NULL CHECK (disk_percent       BETWEEN 0 AND 100),
  disk_used_bytes    BIGINT      NOT NULL,
  disk_total_bytes   BIGINT      NOT NULL,
  net_bytes_sent     BIGINT      NOT NULL DEFAULT 0,
  net_bytes_recv     BIGINT      NOT NULL DEFAULT 0,
  load_avg_1         FLOAT       NOT NULL DEFAULT 0,
  -- GPU / temperature columns are nullable: NULL means the metric wasn't
  -- available on that host (e.g. no NVIDIA GPU, or no CPU temp sensor).
  gpu_percent        FLOAT,
  vram_used_bytes    BIGINT,
  vram_total_bytes   BIGINT,
  vram_percent       FLOAT,
  gpu_temp_c         FLOAT,
  cpu_temp_c         FLOAT,
  gpu_power_watts    FLOAT,
  gpu_fan_percent    FLOAT,
  net_tx_bytes_sec   FLOAT,
  net_rx_bytes_sec   FLOAT,
  -- Variable-length current-state breakdowns stored as JSON.
  cpu_per_core       JSONB,
  disks              JSONB,
  top_processes      JSONB
);

CREATE INDEX IF NOT EXISTS idx_metrics_server_collected
  ON metrics(server_id, collected_at DESC);

-- Upgrade path for databases created before GPU/temperature support was added.
-- These are no-ops on a fresh install and idempotent on existing ones.
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS gpu_percent      FLOAT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS vram_used_bytes  BIGINT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS vram_total_bytes BIGINT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS vram_percent     FLOAT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS gpu_temp_c       FLOAT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS cpu_temp_c       FLOAT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS gpu_power_watts  FLOAT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS gpu_fan_percent  FLOAT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS net_tx_bytes_sec FLOAT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS net_rx_bytes_sec FLOAT;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS cpu_per_core     JSONB;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS disks            JSONB;
ALTER TABLE metrics ADD COLUMN IF NOT EXISTS top_processes    JSONB;

-- ── alerts ────────────────────────────────────────────────────────────────────
-- Threshold rules. When a metric crosses the threshold an alert_event is fired.

CREATE TABLE IF NOT EXISTS alerts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id   UUID        NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  metric      VARCHAR(50) NOT NULL CHECK (metric IN ('cpu_percent','memory_percent','disk_percent','load_avg_1','gpu_percent','vram_percent','gpu_temp_c','cpu_temp_c')),
  condition   VARCHAR(10) NOT NULL CHECK (condition IN ('above','below')),
  threshold   FLOAT       NOT NULL,
  channel     VARCHAR(50) NOT NULL CHECK (channel IN ('slack','email','discord','webhook')),
  destination TEXT        NOT NULL,   -- Slack webhook URL or email address
  enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Upgrade path: widen the allowed alert metrics on pre-existing databases.
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_metric_check;
ALTER TABLE alerts ADD  CONSTRAINT alerts_metric_check
  CHECK (metric IN ('cpu_percent','memory_percent','disk_percent','load_avg_1','gpu_percent','vram_percent','gpu_temp_c','cpu_temp_c'));

-- Upgrade path: widen the allowed notification channels on pre-existing databases.
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_channel_check;
ALTER TABLE alerts ADD  CONSTRAINT alerts_channel_check
  CHECK (channel IN ('slack','email','discord','webhook'));

-- ── alert_events ─────────────────────────────────────────────────────────────
-- Audit log of every alert that fired.

CREATE TABLE IF NOT EXISTS alert_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id     UUID        NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  server_id    UUID        NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  metric_value FLOAT       NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ             -- NULL = still active
);

CREATE INDEX IF NOT EXISTS idx_alert_events_server
  ON alert_events(server_id, triggered_at DESC);
