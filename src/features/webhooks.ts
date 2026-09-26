import type { Env } from '../types';

interface WebhookPayload {
  event: string;
  project: { name: string; label: string; icon: string };
  update?: { title: string; version: string; status: string; diff_url: string; body: string };
  timestamp: string;
}

/**
 * Webhook URL 校验：只允许 http/https，拒绝内网/回环/链路本地地址（防 SSRF）
 * 返回规范化后的 URL 字符串，非法返回 null
 * 注意：仅做字面量校验，无法防御 DNS 解析到内网（rebinding）——
 * 生产环境建议再加一层出网地址过滤。
 */
function isBlockedIpv4(host: string): boolean {
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^0\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true; // CGNAT
  return false;
}

export function validateWebhookUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;

  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return null;
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return null;
  // IPv4 特殊段（含 URL 层已归一化的十进制/十六进制 IP）
  if (isBlockedIpv4(host)) return null;
  // IPv4-mapped IPv6（::ffff:7f00:1、::ffff:127.0.0.1、0:0:0:0:0:ffff:...）→ 还原为 IPv4 再判
  const mappedDotted = host.match(/^(?:.*:)?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  const mappedHex = host.match(/^(?:.*:)?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mappedDotted) {
    if (isBlockedIpv4(mappedDotted[1])) return null;
  } else if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16), lo = parseInt(mappedHex[2], 16);
    if (isBlockedIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`)) return null;
  }
  // IPv6 内网/回环（含非压缩形式；URL 层会归一化，这里兼容器错）
  if (host === '::1' || host === '::' || /^(fe80|fc|fd)/i.test(host)) return null;
  if (/^(?:0*:)+1$/.test(host)) return null; // 0:0:0:0:0:0:0:1 等形式的回环地址

  return u.toString();
}

function parseEvents(raw: unknown): string[] | null {
  if (raw === undefined) return ['update'];
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 10) return null;
  const out: string[] = [];
  for (const e of raw) {
    if (typeof e !== 'string' || !/^[a-z_.-]{1,32}$/.test(e)) return null;
    out.push(e);
  }
  return out;
}

export { parseEvents as validateWebhookEvents };

const FETCH_TIMEOUT_MS = 5000;

export async function triggerWebhooks(env: D1Database, payload: WebhookPayload) {
  const rows = await env.prepare(
    'SELECT id, url, secret, events FROM webhooks WHERE enabled = 1 LIMIT 100'
  ).all<{ id: number; url: string; secret: string; events: string }>();
  if (!rows.results.length) return;

  for (const wh of rows.results) {
    let events: string[];
    try {
      const parsed = JSON.parse(wh.events);
      events = Array.isArray(parsed) ? parsed : ['update'];
    } catch {
      events = ['update'];
    }
    if (!events.includes(payload.event)) continue;

    const url = validateWebhookUrl(wh.url);
    if (!url) {
      console.error(`Webhook ${wh.id} 的 URL 不合法，已跳过: ${wh.url}`);
      continue;
    }

    try {
      const body = JSON.stringify(payload);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (wh.secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          'raw', encoder.encode(wh.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
        );
        const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
        headers['X-Hub-Signature-256'] = 'sha256=' + [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
      }
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        // 手动处理跳转：防止公网地址 302 跳到内网绕过校验
        redirect: 'manual',
      });
      if (!resp.ok) console.error(`Webhook ${wh.id} 返回 ${resp.status}`);
    } catch (err) {
      console.error(`Webhook ${wh.id} failed:`, err);
    }
  }
}
