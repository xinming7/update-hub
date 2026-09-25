-- 旧版 schema（迁移测试用）：迁移脚本 migrations/001_schema_sync.sql 的输入
CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  label      TEXT    NOT NULL DEFAULT '',
  type       TEXT    NOT NULL DEFAULT 'generic',
  icon       TEXT    NOT NULL DEFAULT '📡',
  config     TEXT    NOT NULL DEFAULT '{}',
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS updates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version     TEXT    NOT NULL DEFAULT '',
  title       TEXT    NOT NULL DEFAULT '',
  body        TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'ok',
  diff_url    TEXT    NOT NULL DEFAULT '',
  extra       TEXT    NOT NULL DEFAULT '{}',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT    NOT NULL UNIQUE,
  label      TEXT    NOT NULL DEFAULT '',
  scopes     TEXT    NOT NULL DEFAULT '["read","write"]',
  enabled    INTEGER NOT NULL DEFAULT 1,
  last_used  TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO api_tokens (token, label, scopes) VALUES ('uh_legacy_plaintext_token', '旧版明文 Token', '["read","write"]');
INSERT INTO projects (name, label, type) VALUES ('legacy-project', '旧项目', 'generic');
INSERT INTO updates (project_id, title, status) VALUES (1, '旧记录', 'ok');
