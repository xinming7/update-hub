import type { Env } from '../types';

export async function logApiUsage(env: Env, method: string, path: string, status: number, tokenId?: number) {
  try {
    await env.DB.prepare(
      'INSERT INTO api_usage_logs (method, path, status, token_id) VALUES (?, ?, ?, ?)'
    ).bind(method, path, status, tokenId ?? null).run();
  } catch (err) {
    console.error('Failed to log API usage:', err);
  }
}

export async function getUsageStats(env: Env) {
  const total = await env.DB.prepare('SELECT COUNT(*) as cnt FROM api_usage_logs').first<{ cnt: number }>();
  const byStatus = await env.DB.prepare(
    'SELECT status, COUNT(*) as cnt FROM api_usage_logs GROUP BY status ORDER BY cnt DESC'
  ).all<{ status: number; cnt: number }>();
  const byPath = await env.DB.prepare(
    `SELECT path, COUNT(*) as cnt FROM api_usage_logs
     WHERE created_at >= datetime('now', '-7 days')
     GROUP BY path ORDER BY cnt DESC LIMIT 20`
  ).all<{ path: string; cnt: number }>();
  const daily = await env.DB.prepare(
    `SELECT date(created_at) as day, COUNT(*) as cnt FROM api_usage_logs
     WHERE created_at >= datetime('now', '-30 days')
     GROUP BY day ORDER BY day`
  ).all<{ day: string; cnt: number }>();

  return {
    total: total?.cnt || 0,
    by_status: byStatus.results,
    by_path: byPath.results,
    daily: daily.results,
  };
}
