ALTER TABLE sales ADD COLUMN last_event_at TEXT;
ALTER TABLE sync_run_accounts ADD COLUMN cursor_json TEXT;
ALTER TABLE sync_run_accounts ADD COLUMN cursor_version INTEGER NOT NULL DEFAULT 0;
