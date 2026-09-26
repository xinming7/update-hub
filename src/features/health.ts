import type { Env } from '../types';
import { parseDbTime } from '../auth';

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
  ).bind(projectId).first<{ total: number; errors: number; warnings: number; last_update: string | null }>();

  // 无数据时根据最后更新时间衰减
  if (!stats || stats.total === 0) {
    const proj = await env.DB.prepare('SELECT updated_at FROM projects WHERE id = ?').bind(projectId).first<{ updated_at: string }>();
    if (!proj) return 50.0;
    const hoursSinceUpdate = (Date.now() - parseDbTime(proj.updated_at)) / 3600000;
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
    ? (Date.now() - parseDbTime(stats.last_update)) / 3600000
    : 720;
  const activeScore = Math.max(0, 100 - hoursSinceUpdate * 0.5);

  const score = errorScore * 0.4 + freqScore * 0.3 + activeScore * 0.3;
  return Math.round(score * 10) / 10;
}

export async function refreshAllHealthScores(env: Env) {
  const projects = await env.DB.prepare('SELECT id FROM projects').all<{ id: number }>();
  // 批量读取所有项目的统计数据，减少串行 DB 查询
  const statsResults = await env.DB.batch(
    projects.results.map(p =>
      env.DB.prepare(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as errors,
           SUM(CASE WHEN status = 'warning' THEN 1 ELSE 0 END) as warnings,
           MAX(created_at) as last_update
         FROM updates WHERE project_id = ? AND created_at >= datetime('now', '-30 days')`
      ).bind(p.id)
    )
  );

  const updateStatements: D1PreparedStatement[] = [];
  for (let i = 0; i < projects.results.length; i++) {
    const p = projects.results[i];
    const stats = statsResults[i]?.results?.[0] as { total: number; errors: number; warnings: number; last_update: string | null } | undefined;
    const score = computeScore(stats);
    updateStatements.push(
      env.DB.prepare('UPDATE projects SET health_score = ? WHERE id = ?').bind(score, p.id)
    );
  }
  if (updateStatements.length > 0) {
    await env.DB.batch(updateStatements);
  }
}

/** 从统计数据计算健康度评分（纯计算，无 DB 调用） */
function computeScore(stats: { total: number; errors: number; warnings: number; last_update: string | null } | undefined): number {
  if (!stats || stats.total === 0) return 50.0;

  const errorRate = ((stats.errors || 0) + (stats.warnings || 0) * 0.5) / stats.total;
  const errorScore = Math.max(0, 100 - errorRate * 200);
  const avgPerDay = stats.total / 30;
  const freqScore = avgPerDay <= 5 ? 100 : Math.max(0, 100 - (avgPerDay - 5) * 10);
  const hoursSinceUpdate = stats.last_update
    ? (Date.now() - parseDbTime(stats.last_update)) / 3600000
    : 720;
  const activeScore = Math.max(0, 100 - hoursSinceUpdate * 0.5);

  return Math.round((errorScore * 0.4 + freqScore * 0.3 + activeScore * 0.3) * 10) / 10;
}

/** 清理过期数据：30 天前的使用日志与认证失败记录、7 天前的去重键、孤立的 tag relations */
export async function cleanupOldData(env: Env) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM api_usage_logs WHERE created_at < datetime('now', '-30 days')"),
    env.DB.prepare("DELETE FROM auth_attempts WHERE updated_at < datetime('now', '-30 days')"),
    env.DB.prepare("UPDATE updates SET dedup_key = '' WHERE dedup_key != '' AND created_at < datetime('now', '-7 days')"),
    env.DB.prepare("DELETE FROM project_tag_relations WHERE project_id NOT IN (SELECT id FROM projects)"),
    env.DB.prepare("DELETE FROM project_tag_relations WHERE tag_id NOT IN (SELECT id FROM project_tags)"),
  ]);
}

/** 兼容旧名 */
export const cleanupOldLogs = cleanupOldData;
