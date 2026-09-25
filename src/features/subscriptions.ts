import type { Env } from '../types';
import { sendEmail, formatUpdateEmail } from './email';

export async function notifySubscribers(
  env: Env,
  projectId: number,
  project: { name: string; label: string; icon: string },
  update: { title: string; version: string; status: string; body: string; diff_url: string }
) {
  // 查找订阅了该项目或全部项目的用户
  const rows = await env.DB.prepare(
    `SELECT email FROM subscriptions
     WHERE enabled = 1 AND (project_id = ? OR project_id IS NULL)`
  ).bind(projectId).all<{ email: string }>();

  if (!rows.results.length) return;

  const subject = `${project.icon} ${project.label}: ${update.title || update.version || '更新通知'}`;
  const html = formatUpdateEmail(project, update);

  for (const sub of rows.results) {
    await sendEmail(env, sub.email, subject, html);
  }
}
