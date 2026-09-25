-- ============================================================
-- Update Hub 完整建表脚本（与 src/ 代码保持一致）
-- 全新部署：npm run db:init
-- 已有数据库升级：见 migrations/001_schema_sync.sql
-- ============================================================

-- 项目表：注册的检测项目
CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL UNIQUE,             -- 项目唯一标识（如 github-repo-watch）
  label        TEXT    NOT NULL DEFAULT '',          -- 显示名称
  type         TEXT    NOT NULL DEFAULT 'generic',   -- generic | version | content | status
  icon         TEXT    NOT NULL DEFAULT '📡',        -- 前端展示用 emoji
  config       TEXT    NOT NULL DEFAULT '{}',        -- JSON 扩展配置
  health_score REAL    NOT NULL DEFAULT 0,           -- 健康度评分 0~100
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 更新记录表：每次检测上报的结果
CREATE TABLE IF NOT EXISTS updates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version     TEXT    NOT NULL DEFAULT '',
  title       TEXT    NOT NULL DEFAULT '',
  body        TEXT    NOT NULL DEFAULT '',
  status      TEXT    NOT NULL DEFAULT 'ok',         -- ok | changed | error | warning
  diff_url    TEXT    NOT NULL DEFAULT '',
  extra       TEXT    NOT NULL DEFAULT '{}',
  dedup_key   TEXT    NOT NULL DEFAULT '',           -- 去重键（1 小时窗口）
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- API Token 表：只保存 SHA-256 哈希，不存明文
CREATE TABLE IF NOT EXISTS api_tokens (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash   TEXT    UNIQUE,                        -- sha256(token)
  legacy_token TEXT    UNIQUE,                        -- 迁移期明文（自动升级后清空，可择期删除）
  label        TEXT    NOT NULL DEFAULT '',
  scopes       TEXT    NOT NULL DEFAULT '["read","write"]', -- JSON 数组：read/write/admin
  enabled      INTEGER NOT NULL DEFAULT 1,
  last_used    TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Webhook 表
CREATE TABLE IF NOT EXISTS webhooks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  url        TEXT    NOT NULL,                        -- 仅允许 http/https 公网地址
  secret     TEXT    NOT NULL DEFAULT '',              -- HMAC-SHA256 签名密钥
  events     TEXT    NOT NULL DEFAULT '["update"]',    -- JSON 数组
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 邮件订阅表
CREATE TABLE IF NOT EXISTS subscriptions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  email             TEXT    NOT NULL,
  project_id        INTEGER REFERENCES projects(id) ON DELETE CASCADE, -- NULL = 全部项目
  events            TEXT    NOT NULL DEFAULT '["update"]',
  unsubscribe_token TEXT    NOT NULL UNIQUE,           -- 退订凭据
  enabled           INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 标签表 / 项目-标签关联表
CREATE TABLE IF NOT EXISTS project_tags (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS project_tag_relations (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tag_id     INTEGER NOT NULL REFERENCES project_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tag_id)
);

-- API 使用日志
CREATE TABLE IF NOT EXISTS api_usage_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  method     TEXT    NOT NULL,
  path       TEXT    NOT NULL,
  status     INTEGER NOT NULL,
  token_id   INTEGER,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_updates_project ON updates(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_updates_created  ON updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_updates_dedup    ON updates(project_id, dedup_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_hash      ON api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_subs_project     ON subscriptions(project_id);
CREATE INDEX IF NOT EXISTS idx_usage_created    ON api_usage_logs(created_at);
