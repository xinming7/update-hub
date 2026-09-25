import type { Env } from '../types';

interface WebhookPayload {
  event: string;
  project: { name: string; label: string; icon: string };
  update?: { title: string; version: string; status: string; diff_url: string; body: string };
  timestamp: string;
}

export async function triggerWebhooks(env: D1Database, payload: WebhookPayload) {
  const rows = await env.prepare('SELECT id, url, secret, events FROM webhooks WHERE enabled = 1').all<{ id: number; url: string; secret: string; events: string }>();
  if (!rows.results.length) return;

  for (const wh of rows.results) {
    const events = JSON.parse(wh.events) as string[];
    if (!events.includes(payload.event)) continue;

    try {
      const body = JSON.stringify(payload);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (wh.secret) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey('raw', encoder.encode(wh.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
        headers['X-Hub-Signature'] = 'sha256=' + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
      }
      await fetch(wh.url, { method: 'POST', headers, body });
    } catch (err) {
      console.error(`Webhook ${wh.id} failed:`, err);
    }
  }
}
