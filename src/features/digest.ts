import type { Env } from '../types';
import { escapeHtml } from './email';

interface DigestUpdate {
  title: string | null;
  version: string | null;
  status: string;
  body: string | null;
  diff_url: string;
  created_at: string;
}
interface DigestRow extends DigestUpdate {
  project_name: string;
  project_icon: string;
  project_label: string;
}
export interface DailyDigest {
  date: string;
  since: string;
  total: number;
  stats: { changed: number; errors: number; ok: number };
  projects: {
    name: string;
    label: string;
    icon: string;
    count: number;
    updates: DigestUpdate[];
  }[];
}

/**
 * 构建每日汇总（北京时间 0 点起算）。
 * created_at 存的是 UTC；北京时间（UTC+8）当天 0 点 = 对应 UTC 时刻 - 8 小时。
 * 供 /api/daily-digest 与 scheduled 定时推送复用。
 */
export async function buildDailyDigest(env: Env): Promise<DailyDigest> {
  const now = new Date();
  const bjDateStr = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10);
  const sinceMs = Date.parse(bjDateStr + 'T00:00:00Z') - 8 * 3600000;
  const since = new Date(sinceMs).toISOString().replace('T', ' ').slice(0, 19);

  const rows = await env.DB.prepare(
    `SELECT u.*, p.name AS project_name, p.icon AS project_icon, p.label AS project_label
     FROM updates u JOIN projects p ON u.project_id = p.id
     WHERE u.created_at >= ?
     ORDER BY u.created_at DESC`
  ).bind(since).all<DigestRow>();

  const updates = rows.results;
  const grouped: Record<string, { label: string; icon: string; items: DigestUpdate[] }> = {};
  for (const u of updates) {
    if (!grouped[u.project_name]) {
      grouped[u.project_name] = { label: u.project_label, icon: u.project_icon, items: [] };
    }
    grouped[u.project_name].items.push({
      title: u.title, version: u.version, status: u.status, body: u.body,
      diff_url: u.diff_url, created_at: u.created_at,
    });
  }

  return {
    date: bjDateStr,
    since,
    total: updates.length,
    stats: {
      changed: updates.filter(u => u.status === 'changed').length,
      errors: updates.filter(u => u.status === 'error' || u.status === 'warning').length,
      ok: updates.filter(u => u.status === 'ok').length,
    },
    projects: Object.entries(grouped).map(([name, g]) => ({
      name, label: g.label, icon: g.icon, count: g.items.length, updates: g.items,
    })),
  };
}

const STATUS_ICON: Record<string, string> = {
  changed: '🔵', error: '🔴', warning: '🟡', ok: '🟢',
};

/** 仅允许 http/https（防 javascript: 等协议注入到 Telegram 链接） */
function safeLink(raw: string): string {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : '';
  } catch {
    return '';
  }
}

export function formatDigestText(digest: DailyDigest): string {
  let msg = `📋 <b>Update Hub 每日汇总</b>\n\n`;
  msg += `📅 ${digest.date}\n`;
  msg += `📊 共 <b>${digest.total}</b> 条更新`;
  const parts: string[] = [];
  if (digest.stats.changed) parts.push(`🔵 ${digest.stats.changed} 变更`);
  if (digest.stats.errors) parts.push(`🔴 ${digest.stats.errors} 异常`);
  if (digest.stats.ok) parts.push(`🟢 ${digest.stats.ok} 正常`);
  if (parts.length) msg += ` · ${parts.join(' · ')}`;
  msg += '\n\n';

  for (const proj of digest.projects) {
    msg += `${escapeHtml(proj.icon)} <b>${escapeHtml(proj.label)}</b> (${proj.count} 条)\n`;
    for (const u of proj.updates.slice(0, 5)) {
      msg += `  ${STATUS_ICON[u.status] || '🟢'} ${escapeHtml(u.title || u.version || '(无标题)')}`;
      if (u.version) msg += ` <code>${escapeHtml(u.version)}</code>`;
      msg += '\n';
      const link = u.diff_url ? safeLink(u.diff_url) : '';
      if (link) msg += `    <a href="${escapeHtml(link)}">查看详情</a>\n`;
    }
    if (proj.updates.length > 5) msg += `  ... 还有 ${proj.updates.length - 5} 条\n`;
    msg += '\n';
  }

  msg += `#每日汇总 #UpdateHub #更新同步平台`;
  return msg;
}

/**
 * Telegram 每日汇总推送（可选功能）。
 * 需要配置 TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID，否则静默跳过。
 * 若同时启用了 apple-update-checker 的 daily-digest 工作流，请二选一，避免重复推送。
 */
export async function sendTelegramDigest(env: Env): Promise<void> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const digest = await buildDailyDigest(env);
  if (!digest.total) {
    console.log('Telegram digest: no updates today, skip.');
    return;
  }

  // Telegram 单条消息上限 4096，截断放在最后
  let text = formatDigestText(digest);
  const MAX_LEN = 4096;
  if (text.length > MAX_LEN) {
    text = text.slice(0, MAX_LEN - 30) + '\n\n... (内容过长已截断)';
  }

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const result = await res.json().catch(() => ({})) as { ok?: boolean; description?: string };
  if (!result.ok) {
    throw new Error(`Telegram digest failed: ${res.status} ${result.description || ''}`);
  }
}
