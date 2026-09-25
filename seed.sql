-- 示例数据（只含无害的演示项目，不创建任何 Token）
-- Token 请通过 API 创建或设置主 Token：
--   wrangler secret put API_TOKEN
--   或 curl -X POST .../api/tokens -H "Authorization: Bearer <主Token>"
INSERT OR IGNORE INTO projects (name, label, type, icon) VALUES
  ('github-repo-watch', 'GitHub 仓库监控', 'version', '🐙'),
  ('ios-update-check', 'iOS 系统更新', 'version', '🍎'),
  ('website-monitor', '网页内容监控', 'content', '🌐'),
  ('api-health', 'API 服务状态', 'status', '💚');
