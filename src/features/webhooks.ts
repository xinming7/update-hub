import type { Env } from '../types';

interface WebhookPayload {
  event: string;
  project: { name: string; label: string; icon: string };
  update?: { title: string; version: string; status: string; diff_url: string; body: string };
  timestamp: string;
}

// URL 校验逻辑已抽到零依赖叶子模块 src/features/url-guard.ts，
// 以便 test/*.mjs 能直接 import 做单元测试（Node 原生 ESM 无法解析无扩展名 import）。
// import + export 两行：本文件内部（parseWebhooks 等）也要用 validateWebhookUrl，
// 而 `export ... from` 不会把名字引入本地作用域。既有外部调用点无需改动。
import { validateWebhookUrl } from './url-guard';
export { isBlockedIpv4, embeddedIpv4 } from './url-guard';
export { validateWebhookUrl };

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
