import type { Env } from '../types';

function escapeXml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateAtomFeed(
  title: string,
  baseUrl: string,
  selfUrl: string,
  items: { title: string; link: string; status: string; body: string; date: string }[]
): string {
  const now = new Date().toISOString();
  const entries = items.map(u => `
    <entry>
      <title>${escapeXml(u.title)}</title>
      <link href="${escapeXml(u.link)}"/>
      <updated>${escapeXml(u.date.replace(' ', 'T'))}Z</updated>
      <summary type="text">${escapeXml(u.body || u.status)}</summary>
    </entry>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>${escapeXml(title)}</title>
  <link href="${escapeXml(baseUrl)}"/>
  <link rel="self" type="application/atom+xml" href="${escapeXml(selfUrl)}"/>
  <updated>${now}</updated>
  <id>${escapeXml(baseUrl)}</id>${entries}
</feed>`;
}

type FeedCtx = {
  env: Env;
  req: { param: (k: string) => string; url: string };
  json: (data: unknown, status?: number) => Response;
};

export async function getProjectFeed(c: FeedCtx) {
  const name = c.req.param('name');
  const project = await c.env.DB.prepare(
    'SELECT id, name, label, icon FROM projects WHERE name = ?'
  ).bind(name).first<{ id: number; name: string; label: string; icon: string }>();
  if (!project) return c.json({ error: '项目不存在' }, 404);

  const rows = await c.env.DB.prepare(
    'SELECT title, version, status, body, diff_url, created_at FROM updates WHERE project_id = ? ORDER BY created_at DESC LIMIT 50'
  ).bind(project.id).all<{ title: string; version: string; status: string; body: string; diff_url: string; created_at: string }>();

  const items = rows.results.map(u => ({
    title: u.title || u.version || '(无标题)',
    link: u.diff_url || '#',
    status: u.status,
    body: u.body,
    date: u.created_at,
  }));

  const baseUrl = new URL(c.req.url).origin;
  const feedUrl = `${baseUrl}/api/projects/${encodeURIComponent(name)}/feed`;
  const xml = generateAtomFeed(`${project.icon} ${project.label}`, feedUrl, feedUrl, items);

  return new Response(xml, {
    headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
  });
}

export async function getGlobalFeed(c: FeedCtx) {
  const rows = await c.env.DB.prepare(
    `SELECT u.title, u.version, u.status, u.body, u.diff_url, u.created_at,
            p.name AS project_name, p.label AS project_label, p.icon AS project_icon
     FROM updates u JOIN projects p ON u.project_id = p.id
     ORDER BY u.created_at DESC LIMIT 100`
  ).all<{ title: string; version: string; status: string; body: string; diff_url: string; created_at: string; project_name: string; project_label: string; project_icon: string }>();

  const items = rows.results.map(u => ({
    title: `${u.project_icon} ${u.project_label}: ${u.title || u.version || '(无标题)'}`,
    link: u.diff_url || '#',
    status: u.status,
    body: u.body,
    date: u.created_at,
  }));

  const baseUrl = new URL(c.req.url).origin;
  const feedUrl = `${baseUrl}/api/feed`;
  const xml = generateAtomFeed('Update Hub', feedUrl, feedUrl, items);

  return new Response(xml, {
    headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
  });
}
