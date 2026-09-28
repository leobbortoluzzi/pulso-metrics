PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS integrations (
  provider TEXT PRIMARY KEY CHECK (provider IN ('meta', 'hotmart', 'kiwify')),
  credentials_ciphertext TEXT,
  access_token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  token_expires_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  connected_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ad_accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_status INTEGER,
  currency TEXT NOT NULL,
  timezone_name TEXT NOT NULL,
  business_name TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS ad_metrics (
  account_id TEXT NOT NULL REFERENCES ad_accounts(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  adset_id TEXT NOT NULL DEFAULT '',
  adset_name TEXT NOT NULL DEFAULT '',
  ad_id TEXT NOT NULL DEFAULT '',
  ad_name TEXT NOT NULL DEFAULT '',
  spend REAL NOT NULL DEFAULT 0,
  spend_brl REAL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  ctr REAL NOT NULL DEFAULT 0,
  cpc REAL NOT NULL DEFAULT 0,
  cpm REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (account_id, date, campaign_id, adset_id, ad_id)
);

CREATE INDEX IF NOT EXISTS ad_metrics_date_account_idx ON ad_metrics(date, account_id);
CREATE INDEX IF NOT EXISTS ad_metrics_campaign_idx ON ad_metrics(campaign_id, date);
CREATE INDEX IF NOT EXISTS ad_metrics_adset_idx ON ad_metrics(adset_id, date);
CREATE INDEX IF NOT EXISTS ad_metrics_ad_idx ON ad_metrics(ad_id, date);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL CHECK (provider IN ('hotmart', 'kiwify')),
  external_id TEXT NOT NULL,
  status TEXT NOT NULL,
  product_id TEXT,
  product_name TEXT NOT NULL DEFAULT 'Produto não identificado',
  currency TEXT NOT NULL DEFAULT 'BRL',
  amount_minor INTEGER NOT NULL DEFAULT 0,
  amount_brl REAL,
  occurred_at TEXT NOT NULL,
  attribution_date TEXT NOT NULL,
  account_id TEXT,
  campaign_id TEXT,
  adset_id TEXT,
  ad_id TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE(provider, external_id)
);

CREATE INDEX IF NOT EXISTS sales_date_idx ON sales(attribution_date, status);
CREATE INDEX IF NOT EXISTS sales_campaign_idx ON sales(campaign_id, attribution_date);
CREATE INDEX IF NOT EXISTS sales_adset_idx ON sales(adset_id, attribution_date);
CREATE INDEX IF NOT EXISTS sales_ad_idx ON sales(ad_id, attribution_date);
CREATE INDEX IF NOT EXISTS sales_account_idx ON sales(account_id, attribution_date);

CREATE TABLE IF NOT EXISTS webhook_events (
  provider TEXT NOT NULL,
  event_key TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  processed_at TEXT,
  PRIMARY KEY (provider, event_key)
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('meta', 'gateways')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'partial', 'failed')),
  date_from TEXT NOT NULL,
  date_to TEXT NOT NULL,
  account_ids_json TEXT NOT NULL DEFAULT '[]',
  requested_count INTEGER NOT NULL DEFAULT 0,
  completed_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at TEXT,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS sync_run_accounts (
  sync_id TEXT NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  rows_written INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  PRIMARY KEY(sync_id, account_id)
);

CREATE TABLE IF NOT EXISTS fx_rates (
  currency TEXT NOT NULL,
  date TEXT NOT NULL,
  selling_rate REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'BCB PTAX',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY(currency, date)
);

CREATE INDEX IF NOT EXISTS fx_rates_latest_idx ON fx_rates(currency, date DESC);
