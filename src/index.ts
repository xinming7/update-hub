import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, Project, Update } from './types';
import { authMiddleware, requireWrite, authAny } from './auth';
import { dashboardHTML } from './html/dashboard';
import { getProjectFeed, getGlobalFeed } from './features/rss';
import { triggerWebhooks } from './features/webhooks';
import { logApiUsage, getUsageStats } from './features/usage';
import { notifySubscribers } from './features/subscriptions';
import { calculateHealthScore, refreshAllHealthScores, cleanupOldLogs } from './features/health';

const VALID_STATUSES = new Set(['ok', 'changed', 'error', 'warning']);
const VALID_TYPES = new Set(['generic', 'version', 'content', 'status']);

const app = new Hono<{ Bindings: Env }>();

// 全局错误处理
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: '服务器内部错误' }, 500);
});

// Security Headers 中间件
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-XSS-Protection', '1; mode=block');
});

// API 使用统计中间件（仅记录 /api 路由，排除 health 和 public）
app.use('/api/*', async (c, next) => {
  await next();
  const path = new URL(c.req.url).pathname;
  if (path !== '/api/health' && !path.startsWith('/api/public/')) {
    const tokenId = (c as any).get('tokenId') as number | undefined;
    logApiUsage(c.env, c.req.method, path, c.res.status, tokenId);
  }
});

// 安全解析 JSON body
async function safeJson<T>(c: { req: { json: () => Promise<any> } }): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = (await c.req.json()) as T;
    return { data, error: null };
  } catch {
    return { data: null, error: '请求体不是合法 JSON' };
  }
}

// #6 公共密码检查函数
function checkDashPassword(c: any): Response | null {
  const dashPwd = c.env.DASHBOARD_PASSWORD;
  if (!dashPwd) return null;
  const auth = c.req.header('Authorization');
  const key = c.req.query('key');
  if (auth === `Bearer ${dashPwd}` || key === dashPwd) return null;
  return c.json({ error: '需要访问密码，请通过 ?key=xxx 或 Authorization header 提供' }, 401);
}

// CORS
app.use('/api/*', cors());

// ─────────── 前端页面 ───────────

app.get('/', (c) => c.html(dashboardHTML()));

// ─────────── 公开 API（无需鉴权）───────────

app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

// RSS Feed
app.get('/api/feed', (c) => getGlobalFeed(c));
app.get('/api/projects/:name/feed', (c) => getProjectFeed(c));

// 前端仪表盘数据 — 仅在设置了 DASHBOARD_PASSWORD 时才鉴权
app.get('/api/public/overview', async (c) => {
  const denied = checkDashPassword(c);
  if (denied) return denied;

  const projects = await c.env.DB.prepare(
    `SELECT p.*,
       (SELECT COUNT(*) FROM updates WHERE project_id = p.id) AS update_count,
       (SELECT created_at FROM updates WHERE project_id = p.id ORDER BY created_at DESC LIMIT 1) AS last_update
     FROM projects p ORDER BY p.updated_at DESC`
  ).all<Project & { update_count: number; last_update: string | null }>();

  const recent = await c.env.DB.prepare(
    `SELECT u.*, p.name AS project_name, p.icon AS project_icon, p.label AS project_label
     FROM updates u JOIN projects p ON u.project_id = p.id
     ORDER BY u.created_at DESC LIMIT 50`
  ).all<Update & { project_name: string; project_icon: string; project_label: string }>();

  return c.json({ projects: projects.results, recent_updates: recent.results });
});

// 更新趋势数据（30 天）
app.get('/api/public/trends', async (c) => {
  const denied = checkDashPassword(c);
  if (denied) return denied;

  const daily = await c.env.DB.prepare(
    `SELECT date(created_at) as day, status, COUNT(*) as cnt
     FROM updates WHERE created_at >= datetime('now', '-30 days')
     GROUP BY day, status ORDER BY day`
  ).all<{ day: string; status: string; cnt: number }>();

  return c.json({ daily: daily.results });
});

// 每日汇总
app.get('/api/daily-digest', async (c) => {
  const denied = await authAny(c);
  if (denied) return denied;

  // UTC+8 时区：取北京时间 0 点
  const now = new Date();
  const bjNow = new Date(now.getTime() + 8 * 3600000);
  bjNow.setUTCHours(0, 0, 0, 0);
  const since = bjNow.toISOString().replace('T', ' ').slice(0, 19);

  const rows = await c.env.DB.prepare(
    `SELECT u.*, p.name AS project_name, p.icon AS project_icon, p.label AS project_label
     FROM updates u JOIN projects p ON u.project_id = p.id
     WHERE u.created_at >= ?
     ORDER BY u.created_at DESC`
  ).bind(since).all<Update & { project_name: string; project_icon: string; project_label: string }>();

  const updates = rows.results;
  const grouped: Record<string, { label: string; icon: string; items: typeof updates }> = {};
  for (const u of updates) {
    if (!grouped[u.project_name]) {
      grouped[u.project_name] = { label: u.project_label, icon: u.project_icon, items: [] };
    }
    grouped[u.project_name].items.push(u);
  }

  const changed = updates.filter(u => u.status === 'changed').length;
  const errors = updates.filter(u => u.status === 'error' || u.status === 'warning').length;
  const ok = updates.filter(u => u.status === 'ok').length;

  return c.json({
    date: since,
    total: updates.length,
    stats: { changed, errors, ok },
    projects: Object.entries(grouped).map(([name, g]) => ({
      name, label: g.label, icon: g.icon, count: g.items.length,
      updates: g.items.map(u => ({
        title: u.title || u.version || '(无标题)',
        version: u.version, status: u.status, body: u.body, diff_url: u.diff_url,
      })),
    })),
  });
});

// ─────────── 受保护 API（需要 Token）───────────

// 项目列表
app.get('/api/projects', authMiddleware, async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all<Project>();
  return c.json(rows.results);
});

// 创建项目
app.post('/api/projects', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  const { data: body, error } = await safeJson<{ name: string; label?: string; type?: string; icon?: string; config?: object }>(c);
  if (error) return c.json({ error }, 400);
  if (!body!.name) return c.json({ error: 'name 必填' }, 400);

  const projectType = body!.type || 'generic';
  if (!VALID_TYPES.has(projectType)) {
    return c.json({ error: `type 无效，可选值: ${[...VALID_TYPES].join(', ')}` }, 400);
  }

  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO projects (name, label, type, icon, config) VALUES (?, ?, ?, ?, ?)'
    ).bind(body!.name, body!.label || body!.name, projectType, body!.icon || '📡', JSON.stringify(body!.config || {})).run();
    return c.json({ id: result.meta.last_row_id, name: body!.name }, 201);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: `项目 "${body!.name}" 已存在` }, 409);
    throw e;
  }
});

// 编辑项目
app.patch('/api/projects/:id', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  const { data: body, error } = await safeJson<{ label?: string; type?: string; icon?: string; config?: object }>(c);
  if (error) return c.json({ error }, 400);

  const id = Number(c.req.param('id'));
  if (!id) return c.json({ error: 'id 无效' }, 400);

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body!.label !== undefined) { sets.push('label = ?'); vals.push(body!.label); }
  if (body!.type !== undefined) {
    if (!VALID_TYPES.has(body!.type)) return c.json({ error: `type 无效，可选值: ${[...VALID_TYPES].join(', ')}` }, 400);
    sets.push('type = ?'); vals.push(body!.type);
  }
  if (body!.icon !== undefined) { sets.push('icon = ?'); vals.push(body!.icon); }
  if (body!.config !== undefined) { sets.push('config = ?'); vals.push(JSON.stringify(body!.config)); }

  if (sets.length === 0) return c.json({ error: '没有需要更新的字段' }, 400);
  sets.push('updated_at = datetime("now")');
  vals.push(id);

  await c.env.DB.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return c.json({ updated: true });
});

// 删除项目
app.delete('/api/projects/:id', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM updates WHERE project_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id).run();
  return c.json({ deleted: true });
});

// 上报更新（status 白名单 + 去重）
app.post('/api/projects/:name/updates', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  const name = c.req.param('name');
  const project = await c.env.DB.prepare('SELECT id FROM projects WHERE name = ?').bind(name).first<{ id: number }>();
  if (!project) return c.json({ error: `项目 "${name}" 不存在，请先注册` }, 404);

  const { data: body, error } = await safeJson<{
    version?: string; title?: string; body?: string;
    status?: string; diff_url?: string; extra?: object;
  }>(c);
  if (error) return c.json({ error }, 400);

  const status = body!.status || 'ok';
  if (!VALID_STATUSES.has(status)) {
    return c.json({ error: `status 无效，可选值: ${[...VALID_STATUSES].join(', ')}` }, 400);
  }

  // 去重：相同 version+title+status 在 1 小时内不重复记录
  const dedupKey = `${name}:${body!.version || ''}:${body!.title || ''}:${status}`;
  const recent = await c.env.DB.prepare(
    `SELECT id FROM updates WHERE project_id = ? AND dedup_key = ? AND created_at >= datetime('now', '-1 hour')`
  ).bind(project.id, dedupKey).first<{ id: number }>();
  if (recent) {
    return c.json({ recorded: true, deduplicated: true }, 200);
  }

  await c.env.DB.prepare(
    `INSERT INTO updates (project_id, version, title, body, status, diff_url, extra, dedup_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(project.id, body!.version || '', body!.title || '', body!.body || '', status, body!.diff_url || '', JSON.stringify(body!.extra || {}), dedupKey).run();

  await c.env.DB.prepare('UPDATE projects SET updated_at = datetime("now") WHERE id = ?').bind(project.id).run();

  // 刷新健康度（异步，不阻塞响应）
  calculateHealthScore(c.env, project.id)
    .then(score => c.env.DB.prepare('UPDATE projects SET health_score = ? WHERE id = ?').bind(score, project.id).run())
    .catch(e => console.error('Health score update failed:', e));

  // 异步触发 Webhook 和通知
  const projectInfo = await c.env.DB.prepare('SELECT name, label, icon FROM projects WHERE id = ?').bind(project.id).first<{ name: string; label: string; icon: string }>();
  if (projectInfo) {
    const payload = {
      event: 'update',
      project: projectInfo,
      update: { title: body!.title || '', version: body!.version || '', status, diff_url: body!.diff_url || '', body: body!.body || '' },
      timestamp: new Date().toISOString(),
    };
    // 异步执行，不阻塞响应
    triggerWebhooks(c.env.DB, payload).catch(e => console.error('Webhook failed:', e));
    notifySubscribers(c.env, project.id, projectInfo, { title: body!.title || '', version: body!.version || '', status, body: body!.body || '', diff_url: body!.diff_url || '' }).catch(e => console.error('Notify failed:', e));
  }

  return c.json({ recorded: true }, 201);
});

// 查询更新历史（支持 status 和 project 筛选）
app.get('/api/projects/:name/updates', authMiddleware, async (c) => {
  const name = c.req.param('name');
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 50, 1), 200);
  const offset = Math.max(Number(c.req.query('offset')) || 0, 0);
  const statusFilter = c.req.query('status');

  const project = await c.env.DB.prepare('SELECT id FROM projects WHERE name = ?').bind(name).first<{ id: number }>();
  if (!project) return c.json({ error: `项目 "${name}" 不存在` }, 404);

  let sql = 'SELECT * FROM updates WHERE project_id = ?';
  const params: unknown[] = [project.id];

  if (statusFilter && VALID_STATUSES.has(statusFilter)) {
    sql += ' AND status = ?';
    params.push(statusFilter);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const rows = await c.env.DB.prepare(sql).bind(...params).all<Update>();
  return c.json({ data: rows.results, limit, offset, has_more: rows.results.length === limit });
});

// ─────────── 标签管理 ───────────

app.get('/api/tags', authMiddleware, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT t.*, GROUP_CONCAT(p.name) as project_names
     FROM project_tags t
     LEFT JOIN project_tag_relations r ON t.id = r.tag_id
     LEFT JOIN projects p ON r.project_id = p.id
     GROUP BY t.id ORDER BY t.name`
  ).all();
  return c.json(rows.results);
});

app.post('/api/tags', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  const { data: body, error } = await safeJson<{ name: string }>(c);
  if (error) return c.json({ error }, 400);
  if (!body!.name) return c.json({ error: 'name 必填' }, 400);

  try {
    const result = await c.env.DB.prepare('INSERT INTO project_tags (name) VALUES (?)').bind(body!.name).run();
    return c.json({ id: result.meta.last_row_id, name: body!.name }, 201);
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: `标签 "${body!.name}" 已存在` }, 409);
    throw e;
  }
});

app.delete('/api/tags/:id', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM project_tag_relations WHERE tag_id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM project_tags WHERE id = ?').bind(id).run();
  return c.json({ deleted: true });
});

app.post('/api/projects/:id/tags', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  const projectId = Number(c.req.param('id'));
  const { data: body, error } = await safeJson<{ tag_id: number }>(c);
  if (error) return c.json({ error }, 400);

  try {
    await c.env.DB.prepare('INSERT INTO project_tag_relations (project_id, tag_id) VALUES (?, ?)').bind(projectId, body!.tag_id).run();
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) return c.json({ error: '已关联' }, 409);
    throw e;
  }
  return c.json({ linked: true }, 201);
});

app.delete('/api/projects/:id/tags/:tagId', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  const projectId = Number(c.req.param('id'));
  const tagId = Number(c.req.param('tagId'));
  await c.env.DB.prepare('DELETE FROM project_tag_relations WHERE project_id = ? AND tag_id = ?').bind(projectId, tagId).run();
  return c.json({ deleted: true });
});

// ─────────── Webhook 管理 ───────────

app.get('/api/webhooks', authMiddleware, async (c) => {
  const rows = await c.env.DB.prepare('SELECT id, url, events, enabled, created_at FROM webhooks ORDER BY created_at DESC').all();
  return c.json(rows.results);
});

app.post('/api/webhooks', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  const { data: body, error } = await safeJson<{ url: string; secret?: string; events?: string[] }>(c);
  if (error) return c.json({ error }, 400);
  if (!body!.url) return c.json({ error: 'url 必填' }, 400);

  const secret = body!.secret || '';
  const events = JSON.stringify(body!.events || ['update']);
  const result = await c.env.DB.prepare('INSERT INTO webhooks (url, secret, events) VALUES (?, ?, ?)').bind(body!.url, secret, events).run();
  return c.json({ id: result.meta.last_row_id }, 201);
});

app.delete('/api/webhooks/:id', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  await c.env.DB.prepare('DELETE FROM webhooks WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ deleted: true });
});

// ─────────── 订阅管理 ───────────

app.get('/api/subscriptions', authMiddleware, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT s.*, p.name AS project_name, p.label AS project_label
     FROM subscriptions s LEFT JOIN projects p ON s.project_id = p.id
     ORDER BY s.created_at DESC`
  ).all();
  return c.json(rows.results);
});

app.post('/api/subscriptions', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  const { data: body, error } = await safeJson<{ email: string; project_id?: number; events?: string[] }>(c);
  if (error) return c.json({ error }, 400);
  if (!body!.email) return c.json({ error: 'email 必填' }, 400);

  const events = JSON.stringify(body!.events || ['update']);
  const result = await c.env.DB.prepare(
    'INSERT INTO subscriptions (email, project_id, events) VALUES (?, ?, ?)'
  ).bind(body!.email, body!.project_id || null, events).run();
  return c.json({ id: result.meta.last_row_id }, 201);
});

app.delete('/api/subscriptions/:id', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  await c.env.DB.prepare('DELETE FROM subscriptions WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ deleted: true });
});

// ─────────── API 使用统计 ───────────

app.get('/api/usage', authMiddleware, async (c) => {
  const stats = await getUsageStats(c.env);
  return c.json(stats);
});

// ─────────── 健康度刷新 ───────────

app.post('/api/health/refresh', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  await refreshAllHealthScores(c.env);
  await cleanupOldLogs(c.env);
  return c.json({ refreshed: true });
});

// Token 管理
app.get('/api/tokens', authMiddleware, async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, label, scopes, enabled, last_used, created_at FROM api_tokens ORDER BY created_at DESC'
  ).all();
  return c.json(rows.results);
});

app.post('/api/tokens', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  const { data: body, error } = await safeJson<{ label?: string; scopes?: string[] }>(c);
  if (error) return c.json({ error }, 400);

  const token = 'uh_' + crypto.randomUUID().replace(/-/g, '');
  await c.env.DB.prepare(
    'INSERT INTO api_tokens (token, label, scopes) VALUES (?, ?, ?)'
  ).bind(token, body!.label || '', JSON.stringify(body!.scopes || ['read', 'write'])).run();
  return c.json({ token, label: body!.label }, 201);
});

app.patch('/api/tokens/:id', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  const { data: body, error } = await safeJson<{ enabled?: boolean; label?: string }>(c);
  if (error) return c.json({ error }, 400);

  const id = c.req.param('id');
  if (body!.enabled !== undefined) {
    await c.env.DB.prepare('UPDATE api_tokens SET enabled = ? WHERE id = ?').bind(body!.enabled ? 1 : 0, id).run();
  }
  if (body!.label !== undefined) {
    await c.env.DB.prepare('UPDATE api_tokens SET label = ? WHERE id = ?').bind(body!.label, id).run();
  }
  return c.json({ updated: true });
});

app.delete('/api/tokens/:id', authMiddleware, async (c) => {
  const denied = requireWrite(c);
  if (denied) return denied;

  const id = c.req.param('id');
  await c.env.DB.prepare('DELETE FROM api_tokens WHERE id = ?').bind(id).run();
  return c.json({ deleted: true });
});

export default app;
