import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, Project, Update } from './types';
import {
  authRead, authWrite, authAny, timingSafeEqualStr,
  hasScope, requireRead, requireWrite, sha256Hex, normalizeScopes,
  type AppEnv, type AppContext,
} from './auth';
import { dashboardHTML } from './html/dashboard';
import { getProjectFeed, getGlobalFeed } from './features/rss';
import { triggerWebhooks, validateWebhookUrl, validateWebhookEvents } from './features/webhooks';
import { logApiUsage, getUsageStats } from './features/usage';
import { notifySubscribers, createSubscription, unsubscribeByToken, isValidEmail } from './features/subscriptions';
import { calculateHealthScore, refreshAllHealthScores, cleanupOldData } from './features/health';

const VALID_STATUSES = new Set(['ok', 'changed', 'error', 'warning']);
const VALID_TYPES = new Set(['generic', 'version', 'content', 'status']);
const NAME_RE = /^[A-Za-z0-9._-]{1,64}$/;

const app = new Hono<AppEnv>();

// ─────────── 工具函数 ───────────

/** 把 promise 交给 waitUntil 执行；无 executionCtx 时兜底为普通异步 */
function runBackground(c: { executionCtx?: unknown }, task: Promise<unknown>) {
  const p = task.catch(e => console.error('Background task failed:', e));
  try {
    (c as { executionCtx?: { waitUntil(p: Promise<unknown>): void } }).executionCtx?.waitUntil(p);
  } catch {
    /* 某些运行上下文没有 executionCtx，忽略 */
  }
}

/** 安全解析 JSON 对象 body */
async function safeJson<T extends object>(c: { req: { json: () => Promise<unknown> } }): Promise<{ data: T | null; error: string | null }> {
  let parsed: unknown;
  try {
    parsed = await c.req.json();
  } catch {
    return { data: null, error: '请求体不是合法 JSON' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { data: null, error: '请求体必须是 JSON 对象' };
  }
  return { data: parsed as T, error: null };
}

function parseId(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isValidIcon(icon: unknown): boolean {
  return typeof icon === 'string'
    && [...icon].length <= 16
    && !/[<>&"'`\\\r\n\0]/.test(icon);
}

/** 仅允许 http/https 链接 */
function normalizeHttpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** 仪表盘密码校验（仅当设置了 DASHBOARD_PASSWORD 时生效） */
async function checkDashPassword(c: AppContext): Promise<Response | null> {
  const dashPwd = c.env.DASHBOARD_PASSWORD;
  if (!dashPwd) return null;
  const authHeader = c.req.header('Authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const key = bearer || c.req.query('key') || c.req.query('token') || '';
  if (key && await timingSafeEqualStr(key, dashPwd)) return null;
  return c.json({ error: '需要访问密码，请通过 ?key=*** 或 Authorization header 提供' }, 401);
}

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
    let tokenId: number | undefined;
    try { tokenId = c.get('tokenId'); } catch { tokenId = undefined; }
    runBackground(c, logApiUsage(c.env, c.req.method, path, c.res.status, tokenId));
  }
});

// CORS：默认只允许同源，可通过 CORS_ORIGIN 追加白名单
app.use('/api/*', cors({
  origin: (origin, c) => {
    if (!origin) return '';
    const host = c.req.header('host');
    if (host && (origin === `https://${host}` || origin === `http://${host}`)) return origin;
    const extra: string[] = String(c.env?.CORS_ORIGIN || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    return extra.includes(origin) ? origin : '';
  },
}));

// ─────────── 前端页面 ───────────

app.get('/', (c) => c.html(dashboardHTML()));

// ─────────── 公开 API ───────────

app.get('/api/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

// 公开订阅/退订（退订链接是无状态凭据）
app.get('/api/unsubscribe', async (c) => {
  const token = c.req.query('token') || '';
  const ok = await unsubscribeByToken(c.env, token);
  return c.json(ok ? { unsubscribed: true } : { error: '退订失败：token 无效或已退订' }, ok ? 200 : 404);
});

// RSS Feed（鉴权：?key=/?token= 或 Bearer，供 RSS 阅读器使用）
app.get('/api/feed', async (c) => {
  const denied = await authAny(c);
  if (denied) return denied;
  return getGlobalFeed(c as never);
});
app.get('/api/projects/:name/feed', async (c) => {
  const denied = await authAny(c);
  if (denied) return denied;
  return getProjectFeed(c as never);
});

// 前端仪表盘数据 —— 仅在设置了 DASHBOARD_PASSWORD 时才鉴权
app.get('/api/public/overview', async (c) => {
  const denied = await checkDashPassword(c);
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
  const denied = await checkDashPassword(c);
  if (denied) return denied;

  const daily = await c.env.DB.prepare(
    `SELECT date(created_at) as day, status, COUNT(*) as cnt
     FROM updates WHERE created_at >= datetime('now', '-30 days')
     GROUP BY day, status ORDER BY day`
  ).all<{ day: string; status: string; cnt: number }>();

  return c.json({ daily: daily.results });
});

// 每日汇总（北京时间 0 点起算）
app.get('/api/daily-digest', async (c) => {
  const denied = await authAny(c);
  if (denied) return denied;

  // created_at 存的是 UTC；北京时间（UTC+8）当天 0 点 = 对应 UTC 时刻 - 8 小时
  const now = new Date();
  const bjDateStr = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const sinceMs = Date.parse(bjDateStr + 'T00:00:00Z') - 8 * 3600000;
  const since = new Date(sinceMs).toISOString().replace('T', ' ').slice(0, 19);

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
    date: bjDateStr,
    since,
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

// ─────────── 项目 ───────────

app.get('/api/projects', authRead, async (c) => {
  const rows = await c.env.DB.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all<Project>();
  return c.json(rows.results);
});

app.post('/api/projects', authWrite, async (c) => {
  const { data: body, error } = await safeJson<{ name: string; label?: string; type?: string; icon?: string; config?: object }>(c);
  if (error) return c.json({ error }, 400);
  const { name, label, type: projectType = 'generic', icon = '📡', config } = body!;
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    return c.json({ error: 'name 必填，且只能包含字母、数字、. _ -（1~64 字符）' }, 400);
  }
  if (label !== undefined && (typeof label !== 'string' || label.length > 100)) {
    return c.json({ error: 'label 不能超过 100 字符' }, 400);
  }
  if (!VALID_TYPES.has(projectType)) {
    return c.json({ error: `type 无效，可选值: ${[...VALID_TYPES].join(', ')}` }, 400);
  }
  if (!isValidIcon(icon)) {
    return c.json({ error: 'icon 无效：最多 16 个字符，且不能包含 < > & " \' 等特殊字符' }, 400);
  }

  try {
    const result = await c.env.DB.prepare(
      'INSERT INTO projects (name, label, type, icon, config) VALUES (?, ?, ?, ?, ?)'
    ).bind(name, label || name, projectType, icon, JSON.stringify(config ?? {})).run();
    return c.json({ id: result.meta.last_row_id, name }, 201);
  } catch (e) {
    if (e instanceof Error && e.message?.includes('UNIQUE')) return c.json({ error: `项目 "${name}" 已存在` }, 409);
    throw e;
  }
});

app.patch('/api/projects/:id', authWrite, async (c) => {
  const { data: body, error } = await safeJson<{ label?: string; type?: string; icon?: string; config?: object }>(c);
  if (error) return c.json({ error }, 400);

  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'id 无效' }, 400);

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body!.label !== undefined) {
    if (typeof body!.label !== 'string' || body!.label.length > 100) return c.json({ error: 'label 不能超过 100 字符' }, 400);
    sets.push('label = ?'); vals.push(body!.label);
  }
  if (body!.type !== undefined) {
    if (!VALID_TYPES.has(body!.type)) return c.json({ error: `type 无效，可选值: ${[...VALID_TYPES].join(', ')}` }, 400);
    sets.push('type = ?'); vals.push(body!.type);
  }
  if (body!.icon !== undefined) {
    if (!isValidIcon(body!.icon)) return c.json({ error: 'icon 无效：最多 16 个字符，且不能包含 < > & " \' 等特殊字符' }, 400);
    sets.push('icon = ?'); vals.push(body!.icon);
  }
  if (body!.config !== undefined) {
    sets.push('config = ?'); vals.push(JSON.stringify(body!.config));
  }

  if (sets.length === 0) return c.json({ error: '没有需要更新的字段' }, 400);
  sets.push(`updated_at = datetime('now')`);
  vals.push(id);

  const res = await c.env.DB.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  if (!res.meta.changes) return c.json({ error: '项目不存在' }, 404);
  return c.json({ updated: true });
});

app.delete('/api/projects/:id', authWrite, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'id 无效' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(id).first<{ id: number }>();
  if (!existing) return c.json({ error: '项目不存在' }, 404);

  // batch 在同一事务内执行，避免半删除
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM project_tag_relations WHERE project_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM subscriptions WHERE project_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM updates WHERE project_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM projects WHERE id = ?').bind(id),
  ]);
  return c.json({ deleted: true });
});

// ─────────── 更新上报 / 查询 ───────────

app.post('/api/projects/:name/updates', authWrite, async (c) => {
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

  const version = typeof body!.version === 'string' ? body!.version.slice(0, 100) : '';
  const title = typeof body!.title === 'string' ? body!.title.slice(0, 300) : '';
  const text = typeof body!.body === 'string' ? body!.body.slice(0, 10000) : '';
  let diffUrl = '';
  if (body!.diff_url !== undefined) {
    const normalized = normalizeHttpUrl(body!.diff_url);
    if (!normalized) return c.json({ error: 'diff_url 无效：仅支持 http/https 链接' }, 400);
    diffUrl = normalized;
  }
  const extraJson = JSON.stringify(body!.extra ?? {});
  if (extraJson.length > 10000) return c.json({ error: 'extra 过大（上限 10KB）' }, 400);

  // 去重：相同 version+title+status 在 1 小时内不重复记录
  const dedupKey = `${name}:${version}:${title}:${status}`;
  const recent = await c.env.DB.prepare(
    `SELECT id FROM updates WHERE project_id = ? AND dedup_key = ? AND created_at >= datetime('now', '-1 hour')`
  ).bind(project.id, dedupKey).first<{ id: number }>();
  if (recent) {
    return c.json({ recorded: true, deduplicated: true }, 200);
  }

  await c.env.DB.prepare(
    `INSERT INTO updates (project_id, version, title, body, status, diff_url, extra, dedup_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(project.id, version, title, text, status, diffUrl, extraJson, dedupKey).run();

  await c.env.DB.prepare(`UPDATE projects SET updated_at = datetime('now') WHERE id = ?`).bind(project.id).run();

  // 后台任务：健康度、Webhook、邮件通知（用 waitUntil 保证执行）
  runBackground(c, (async () => {
    const score = await calculateHealthScore(c.env, project.id);
    await c.env.DB.prepare('UPDATE projects SET health_score = ? WHERE id = ?').bind(score, project.id).run();

    const projectInfo = await c.env.DB.prepare('SELECT name, label, icon FROM projects WHERE id = ?')
      .bind(project.id).first<{ name: string; label: string; icon: string }>();
    if (!projectInfo) return;

    const payload = {
      event: 'update',
      project: projectInfo,
      update: { title, version, status, diff_url: diffUrl, body: text },
      timestamp: new Date().toISOString(),
    };
    await triggerWebhooks(c.env.DB, payload);
    await notifySubscribers(c.env, project.id, projectInfo, { title, version, status, body: text, diff_url: diffUrl });
  })());

  return c.json({ recorded: true }, 201);
});

app.get('/api/projects/:name/updates', authRead, async (c) => {
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

  // 多取一条判断 has_more，避免恰好整除时误报
  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit + 1, offset);

  const rows = await c.env.DB.prepare(sql).bind(...params).all<Update>();
  const data = rows.results.slice(0, limit);
  return c.json({ data, limit, offset, has_more: rows.results.length > limit });
});

// 批量删除更新记录（支持仪表盘密码和 API Token）
app.post('/api/updates/delete', async (c) => {
  const denied = await authAny(c);
  if (denied) return denied;
  const bad = requireWrite(c);
  if (bad) return bad;
  const { data: body, error } = await safeJson<{ ids: number[] }>(c);
  if (error) return c.json({ error }, 400);
  if (!body!.ids || !Array.isArray(body!.ids) || body!.ids.length === 0) {
    return c.json({ error: 'ids 必填且不能为空' }, 400);
  }
  if (body!.ids.length > 200) {
    return c.json({ error: '单次最多删除 200 条' }, 400);
  }
  // 只删数字 id，防止注入
  const ids = body!.ids.filter(id => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return c.json({ error: '无有效 id' }, 400);

  const placeholders = ids.map(() => '?').join(',');
  const res = await c.env.DB.prepare(`DELETE FROM updates WHERE id IN (${placeholders})`).bind(...ids).run();
  return c.json({ deleted: res.meta.changes });
});

// ─────────── 标签管理 ───────────

app.get('/api/tags', authRead, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT t.*, GROUP_CONCAT(p.name) as project_names
     FROM project_tags t
     LEFT JOIN project_tag_relations r ON t.id = r.tag_id
     LEFT JOIN projects p ON r.project_id = p.id
     GROUP BY t.id ORDER BY t.name`
  ).all();
  return c.json(rows.results);
});

app.post('/api/tags', authWrite, async (c) => {
  const { data: body, error } = await safeJson<{ name: string }>(c);
  if (error) return c.json({ error }, 400);
  const name = typeof body!.name === 'string' ? body!.name.trim() : '';
  if (!name || name.length > 32) return c.json({ error: 'name 必填（1~32 字符）' }, 400);

  try {
    const result = await c.env.DB.prepare('INSERT INTO project_tags (name) VALUES (?)').bind(name).run();
    return c.json({ id: result.meta.last_row_id, name }, 201);
  } catch (e) {
    if (e instanceof Error && e.message?.includes('UNIQUE')) return c.json({ error: `标签 "${name}" 已存在` }, 409);
    throw e;
  }
});

app.delete('/api/tags/:id', authWrite, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'id 无效' }, 400);

  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM project_tag_relations WHERE tag_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM project_tags WHERE id = ?').bind(id),
  ]);
  return c.json({ deleted: true });
});

app.post('/api/projects/:id/tags', authWrite, async (c) => {
  const projectId = parseId(c.req.param('id'));
  if (projectId === null) return c.json({ error: 'id 无效' }, 400);
  const { data: body, error } = await safeJson<{ tag_id: number }>(c);
  if (error) return c.json({ error }, 400);
  const tagId = Number(body!.tag_id);
  if (!Number.isInteger(tagId) || tagId <= 0) return c.json({ error: 'tag_id 无效' }, 400);

  try {
    await c.env.DB.prepare('INSERT INTO project_tag_relations (project_id, tag_id) VALUES (?, ?)').bind(projectId, tagId).run();
  } catch (e) {
    if (e instanceof Error && e.message?.includes('UNIQUE')) return c.json({ error: '已关联' }, 409);
    throw e;
  }
  return c.json({ linked: true }, 201);
});

app.delete('/api/projects/:id/tags/:tagId', authWrite, async (c) => {
  const projectId = parseId(c.req.param('id'));
  const tagId = parseId(c.req.param('tagId'));
  if (projectId === null || tagId === null) return c.json({ error: 'id 无效' }, 400);

  await c.env.DB.prepare('DELETE FROM project_tag_relations WHERE project_id = ? AND tag_id = ?')
    .bind(projectId, tagId).run();
  return c.json({ deleted: true });
});

// ─────────── Webhook 管理 ───────────

app.get('/api/webhooks', authRead, async (c) => {
  const rows = await c.env.DB.prepare('SELECT id, url, events, enabled, created_at FROM webhooks ORDER BY created_at DESC').all();
  return c.json(rows.results);
});

app.post('/api/webhooks', authWrite, async (c) => {
  const { data: body, error } = await safeJson<{ url: string; secret?: string; events?: string[] }>(c);
  if (error) return c.json({ error }, 400);

  const url = validateWebhookUrl(body!.url);
  if (!url) return c.json({ error: 'url 无效：仅支持 http/https，且不允许内网地址' }, 400);
  const events = validateWebhookEvents(body!.events);
  if (!events) return c.json({ error: 'events 无效：应为 1~10 个小写事件名组成的数组' }, 400);
  const secret = typeof body!.secret === 'string' ? body!.secret.slice(0, 128) : '';

  const result = await c.env.DB.prepare('INSERT INTO webhooks (url, secret, events) VALUES (?, ?, ?)')
    .bind(url, secret, JSON.stringify(events)).run();
  return c.json({ id: result.meta.last_row_id }, 201);
});

app.delete('/api/webhooks/:id', authWrite, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'id 无效' }, 400);
  await c.env.DB.prepare('DELETE FROM webhooks WHERE id = ?').bind(id).run();
  return c.json({ deleted: true });
});

// ─────────── 订阅管理 ───────────

app.get('/api/subscriptions', authRead, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT s.id, s.email, s.project_id, s.events, s.enabled, s.created_at,
            s.unsubscribe_token, p.name AS project_name, p.label AS project_label
     FROM subscriptions s LEFT JOIN projects p ON s.project_id = p.id
     ORDER BY s.created_at DESC`
  ).all();
  return c.json(rows.results);
});

app.post('/api/subscriptions', authWrite, async (c) => {
  const { data: body, error } = await safeJson<{ email: string; project_id?: number; events?: string[] }>(c);
  if (error) return c.json({ error }, 400);

  const email = typeof body!.email === 'string' ? body!.email.trim().toLowerCase() : '';
  if (!isValidEmail(email)) return c.json({ error: 'email 无效' }, 400);

  let projectId: number | null = null;
  if (body!.project_id !== undefined && body!.project_id !== null) {
    projectId = Number(body!.project_id);
    if (!Number.isInteger(projectId) || projectId <= 0) return c.json({ error: 'project_id 无效' }, 400);
    const exists = await c.env.DB.prepare('SELECT id FROM projects WHERE id = ?').bind(projectId).first();
    if (!exists) return c.json({ error: '项目不存在' }, 404);
  }

  const events = validateWebhookEvents(body!.events);
  if (!events) return c.json({ error: 'events 无效' }, 400);

  const created = await createSubscription(c.env, email, projectId, events);
  if ('error' in created) return c.json({ error: created.error }, 400);

  const base = new URL(c.req.url).origin;
  return c.json({
    id: created.id,
    unsubscribe_token: created.unsubscribe_token,
    unsubscribe_url: `${base}/api/unsubscribe?token=${encodeURIComponent(created.unsubscribe_token)}`,
  }, 201);
});

app.delete('/api/subscriptions/:id', authWrite, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'id 无效' }, 400);
  await c.env.DB.prepare('DELETE FROM subscriptions WHERE id = ?').bind(id).run();
  return c.json({ deleted: true });
});

// ─────────── API 使用统计 ───────────

app.get('/api/usage', authRead, async (c) => {
  return c.json(await getUsageStats(c.env));
});

// ─────────── 健康度刷新 ───────────

app.post('/api/health/refresh', authWrite, async (c) => {
  await refreshAllHealthScores(c.env);
  await cleanupOldData(c.env);
  return c.json({ refreshed: true });
});

// ─────────── Token 管理（只存哈希，明文只返回一次） ───────────

app.get('/api/tokens', authRead, async (c) => {
  const rows = await c.env.DB.prepare(
    'SELECT id, label, scopes, enabled, last_used, created_at FROM api_tokens ORDER BY created_at DESC'
  ).all();
  return c.json(rows.results);
});

app.post('/api/tokens', authWrite, async (c) => {
  const { data: body, error } = await safeJson<{ label?: string; scopes?: string[] }>(c);
  if (error) return c.json({ error }, 400);

  const scopes = normalizeScopes(body!.scopes);
  if (!scopes) return c.json({ error: 'scopes 无效，可选值: read, write, admin' }, 400);
  if (scopes.includes('admin') && !hasScope(c, 'admin')) {
    return c.json({ error: '只有 admin Token 才能授予 admin 权限' }, 403);
  }

  const token = 'uh_' + crypto.randomUUID().replace(/-/g, '');
  const tokenHash = await sha256Hex(token);
  const label = typeof body!.label === 'string' ? body!.label.slice(0, 100) : '';

  const result = await c.env.DB.prepare('INSERT INTO api_tokens (token_hash, label, scopes) VALUES (?, ?, ?)')
    .bind(tokenHash, label, JSON.stringify(scopes)).run();

  return c.json({
    id: result.meta.last_row_id,
    token,
    label,
    scopes,
    note: 'Token 明文仅此一次返回，服务端只保存哈希，请妥善保存',
  }, 201);
});

app.patch('/api/tokens/:id', authWrite, async (c) => {
  const { data: body, error } = await safeJson<{ enabled?: boolean; label?: string }>(c);
  if (error) return c.json({ error }, 400);

  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'id 无效' }, 400);

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body!.enabled !== undefined) {
    sets.push('enabled = ?'); vals.push(body!.enabled ? 1 : 0);
  }
  if (body!.label !== undefined) {
    if (typeof body!.label !== 'string' || body!.label.length > 100) return c.json({ error: 'label 不能超过 100 字符' }, 400);
    sets.push('label = ?'); vals.push(body!.label);
  }
  if (!sets.length) return c.json({ error: '没有需要更新的字段' }, 400);

  vals.push(id);
  const res = await c.env.DB.prepare(`UPDATE api_tokens SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  if (!res.meta.changes) return c.json({ error: 'Token 不存在' }, 404);
  return c.json({ updated: true });
});

app.delete('/api/tokens/:id', authWrite, async (c) => {
  const id = parseId(c.req.param('id'));
  if (id === null) return c.json({ error: 'id 无效' }, 400);
  const res = await c.env.DB.prepare('DELETE FROM api_tokens WHERE id = ?').bind(id).run();
  if (!res.meta.changes) return c.json({ error: 'Token 不存在' }, 404);
  return c.json({ deleted: true });
});

// 导出 worker：fetch + 定时清理任务
export default {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => app.fetch(request, env, ctx),
  scheduled: (_event: ScheduledController, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil((async () => {
      await refreshAllHealthScores(env);
      await cleanupOldData(env);
    })().catch(e => console.error('Scheduled task failed:', e)));
  },
};
