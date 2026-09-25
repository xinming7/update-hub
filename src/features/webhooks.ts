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
 */
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
  // IPv4 特殊段
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^0\./.test(host)) return null;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return null; // CGNAT
  // IPv6 内网
  if (host === '::1' || host === '::' || /^(fe80|fc|fd)/i.test(host)) return null;

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
        redirect: 'manual',
      });
      if (!resp.ok) console.error(`Webhook ${wh.id} 返回 ${resp.status}`);
    } catch (err) {
      console.error(`Webhook ${wh.id} failed:`, err);
    }
  }
}
