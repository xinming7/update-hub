import type { Env } from '../types';

/**
 * 计算项目健康度评分（0~100）
 * 基于最近 30 天的更新数据：
 * - 错误率越低，分数越高（权重 40%）
 * - 更新频率适中为佳（权重 30%）
 * - 最近有更新说明项目活跃（权重 30%）
 * - 无数据时根据最后更新时间衰减
 */
export async function calculateHealthScore(env: Env, projectId: number): Promise<number> {
  const stats = await env.DB.prepare(
    `SELECT
       COUNT(*) as total,
       SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
       SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warnings,
       MAX(created_at) as last_update
     FROM updates WHERE project_id = ? AND created_at >= datetime('now', '-30 days')`
  ).bind(projectId).first<{ total: number; errors: number; warnings: number; last_update: string }>();

  // 无数据时根据最后更新时间衰减
  if (!stats || stats.total === 0) {
    const proj = await env.DB.prepare('SELECT updated_at FROM projects WHERE id = ?').bind(projectId).first<{ updated_at: string }>();
    if (!proj) return 50.0;
    const hoursSinceUpdate = (Date.now() - new Date(proj.updated_at + 'Z').getTime()) / 3600000;
    // 24小时内=90，7天=60，30天=30，更久=10
    if (hoursSinceUpdate < 24) return 90.0;
    if (hoursSinceUpdate < 168) return 60.0;
    if (hoursSinceUpdate < 720) return 30.0;
    return 10.0;
  }

  // 1. 错误率得分（40%）：无错误=100，50%+=0
  const errorRate = ((stats.errors || 0) + (stats.warnings || 0) * 0.5) / stats.total;
  const errorScore = Math.max(0, 100 - errorRate * 200);

  // 2. 更新频率得分（30%）：每天 1~5 条为最佳区间
  const avgPerDay = stats.total / 30;
  const freqScore = avgPerDay <= 5 ? 100 : Math.max(0, 100 - (avgPerDay - 5) * 10);

  // 3. 活跃度得分（30%）：最近更新距今越近分越高
  const hoursSinceUpdate = stats.last_update
    ? (Date.now() - new Date(stats.last_update + 'Z').getTime()) / 3600000
    : 720;
  const activeScore = Math.max(0, 100 - hoursSinceUpdate * 0.5);

  const score = errorScore * 0.4 + freqScore * 0.3 + activeScore * 0.3;
  return Math.round(score * 10) / 10;
}

export async function refreshAllHealthScores(env: Env) {
  const projects = await env.DB.prepare('SELECT id FROM projects').all<{ id: number }>();
  for (const p of projects.results) {
    const score = await calculateHealthScore(env, p.id);
    await env.DB.prepare('UPDATE projects SET health_score = ? WHERE id = ?').bind(score, p.id).run();
  }
}

/** 清理 30 天前的 API 使用日志 */
export async function cleanupOldLogs(env: Env) {
  await env.DB.prepare(
    "DELETE FROM api_usage_logs WHERE created_at < datetime('now', '-30 days')"
  ).run();
}
