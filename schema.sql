-- 项目表：注册的检测项目
CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,       -- 项目唯一标识（如 github-repo-watch, ios-update）
  label      TEXT    NOT NULL DEFAULT '',    -- 显示名称
  type       TEXT    NOT NULL DEFAULT 'generic', -- 类型：generic | version | content | status
  icon       TEXT    NOT NULL DEFAULT '📡',  -- 前端展示用 emoji
  config     TEXT    NOT NULL DEFAULT '{}',  -- JSON 扩展配置
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 更新记录表：每次检测上报的结果
CREATE TABLE IF NOT EXISTS updates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version     TEXT    NOT NULL DEFAULT '',        -- 版本号（version 类型用）
  title       TEXT    NOT NULL DEFAULT '',        -- 标题/摘要
  body        TEXT    NOT NULL DEFAULT '',        -- 详细内容（Markdown）
  status      TEXT    NOT NULL DEFAULT 'ok',      -- ok | changed | error | warning
  diff_url    TEXT    NOT NULL DEFAULT '',        -- 变更链接
  extra       TEXT    NOT NULL DEFAULT '{}',      -- JSON 扩展字段
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- API Token 表
CREATE TABLE IF NOT EXISTS api_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT    NOT NULL UNIQUE,             -- 随机 token
  label      TEXT    NOT NULL DEFAULT '',          -- 备注
  scopes     TEXT    NOT NULL DEFAULT '["read","write"]', -- 权限范围 JSON 数组
  enabled    INTEGER NOT NULL DEFAULT 1,
  last_used  TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_updates_project ON updates(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_updates_created  ON updates(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_token     ON api_tokens(token);
