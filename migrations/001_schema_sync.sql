-- ============================================================
-- migrations/001_schema_sync.sql
-- 从旧版 schema（仅 projects / updates / api_tokens 三张表）升级到完整结构。
-- 用法：
--   npx wrangler d1 execute update-hub-db --remote --file=migrations/001_schema_sync.sql
-- 执行后旧 token 仍然可用（legacy_token 自动升级为哈希），无需重新签发。
-- ============================================================

-- 1. projects / updates 补列
ALTER TABLE projects ADD COLUMN health_score REAL NOT NULL DEFAULT 0;
ALTER TABLE updates  ADD COLUMN dedup_key   TEXT NOT NULL DEFAULT '';
UPDATE updates SET dedup_key =
    (SELECT p.name FROM projects p WHERE p.id = updates.project_id)
    || ':' || version || ':' || title || ':' || status
  WHERE dedup_key = '';

-- 2. api_tokens 改为哈希存储（重建表：旧明文挪到 legacy_token，认证时自动升级）
CREATE TABLE api_tokens_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash   TEXT    UNIQUE,
  legacy_token TEXT    UNIQUE,
  label        TEXT    NOT NULL DEFAULT '',
  scopes       TEXT    NOT NULL DEFAULT '["read","write"]',
  enabled      INTEGER NOT NULL DEFAULT 1,
  last_used    TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO api_tokens_new (id, legacy_token, label, scopes, enabled, last_used, created_at)
  SELECT id, token, label, scopes, enabled, last_used, created_at FROM api_tokens;
DROP TABLE api_tokens;
ALTER TABLE api_tokens_new RENAME TO api_tokens;

-- 3. 补齐缺失的表
CREATE TABLE IF NOT EXISTS webhooks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  url        TEXT    NOT NULL,
  secret     TEXT    NOT NULL DEFAULT '',
  events     TEXT    NOT NULL DEFAULT '["update"]',
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT    NOT NULL,
  project_id        INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  events            TEXT    NOT NULL DEFAULT '["update"]',
  unsubscribe_token TEXT    NOT NULL UNIQUE,
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS project_tag_relations (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES project_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

CREATE TABLE IF NOT EXISTS api_usage_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  method     TEXT    NOT NULL,
  path       TEXT    NOT NULL,
  status     INTEGER NOT NULL,
  token_id   INTEGER,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 4. 补索引
CREATE INDEX IF NOT EXISTS idx_updates_project ON updates(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_updates_created  ON updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_updates_dedup    ON updates(project_id, dedup_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_hash      ON api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_subs_project     ON subscriptions(project_id);
CREATE INDEX IF NOT EXISTS idx_usage_created    ON api_usage_logs(created_at);

-- 5. （可选，确认业务正常后执行）删除历史明文 token 列
-- ALTER TABLE api_tokens DROP COLUMN legacy_token;

-- 4. 认证失败计数表（限速用）
CREATE TABLE IF NOT EXISTS auth_attempts (
  key        TEXT    PRIMARY KEY,
  failures   INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
