-- 默认 API Token（部署后建议替换或删除）
INSERT OR IGNORE INTO api_tokens (token, label, scopes)
VALUES ('uh_default_demo_token_2026', '默认 Token', '["read","write","admin"]');

-- 示例项目
INSERT OR IGNORE INTO projects (name, label, type, icon) VALUES
  ('github-repo-watch', 'GitHub 仓库监控', 'version', '🐙'),
  ('ios-update-check', 'iOS 系统更新', 'version', '🍎'),
  ('website-monitor', '网页内容监控', 'content', '🌐'),
  ('api-health', 'API 服务状态', 'status', '💚');
