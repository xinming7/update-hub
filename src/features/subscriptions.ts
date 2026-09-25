import type { Env } from '../types';
import { sendEmail, formatUpdateEmail, isValidEmail } from './email';

export { isValidEmail };

const MAX_SUBSCRIPTIONS = 200;

export async function notifySubscribers(
  env: Env,
  projectId: number,
  project: { name: string; label: string; icon: string },
  update: { title: string; version: string; status: string; body: string; diff_url: string }
) {
  // 查找订阅了该项目或全部项目的用户
  const rows = await env.DB.prepare(
    `SELECT email, unsubscribe_token FROM subscriptions
     WHERE enabled = 1 AND (project_id = ? OR project_id IS NULL) LIMIT 500`
  ).bind(projectId).all<{ email: string; unsubscribe_token: string }>();

  if (!rows.results.length) return;

  const subject = `${project.icon} ${project.label}: ${update.title || update.version || '更新通知'}`;
  const base = (env.PUBLIC_URL || '').replace(/\/+$/, '');

  for (const sub of rows.results) {
    const unsubscribeUrl = base ? `${base}/api/unsubscribe?token=${encodeURIComponent(sub.unsubscribe_token)}` : '';
    const html = formatUpdateEmail(project, update, { unsubscribeUrl });
    await sendEmail(env, sub.email, subject, html);
  }
}

/** 创建订阅，返回 unsubscribe_token */
export async function createSubscription(
  env: Env,
  email: string,
  projectId: number | null,
  events: string[]
): Promise<{ id: number; unsubscribe_token: string } | { error: string }> {
  const count = await env.DB.prepare('SELECT COUNT(*) AS cnt FROM subscriptions').first<{ cnt: number }>();
  if ((count?.cnt ?? 0) >= MAX_SUBSCRIPTIONS) {
    return { error: `订阅数量已达上限（${MAX_SUBSCRIPTIONS}）` };
  }

  const dup = await env.DB.prepare(
    'SELECT id FROM subscriptions WHERE email = ? AND project_id IS ?'
  ).bind(email, projectId).first<{ id: number }>();
  if (dup) return { error: '该邮箱已订阅此项目' };

  const unsubscribe_token = crypto.randomUUID().replace(/-/g, '');
  const result = await env.DB.prepare(
    'INSERT INTO subscriptions (email, project_id, events, unsubscribe_token) VALUES (?, ?, ?, ?)'
  ).bind(email, projectId, JSON.stringify(events), unsubscribe_token).run();

  return { id: Number(result.meta.last_row_id), unsubscribe_token };
}

/** 按退订 token 删除订阅 */
export async function unsubscribeByToken(env: Env, token: string): Promise<boolean> {
  if (!token || token.length > 64) return false;
  const res = await env.DB.prepare('DELETE FROM subscriptions WHERE unsubscribe_token = ?').bind(token).run();
  return (res.meta.changes ?? 0) > 0;
}
