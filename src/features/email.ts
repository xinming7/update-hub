import type { Env } from '../types';
// @ts-ignore Cloudflare Workers TCP socket API
import { connect } from 'cloudflare:sockets';

const CRLF = '\r\n';

/** 严格邮箱校验（并阻断 CRLF 注入） */
export function isValidEmail(email: unknown): email is string {
  return typeof email === 'string'
    && email.length > 0 && email.length <= 254
    && !/[\r\n\0]/.test(email)
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** 去除 CR/LF/NUL，防止 SMTP 头注入 */
function sanitizeHeaderValue(s: unknown): string {
  return String(s ?? '').replace(/[\r\n\0]+/g, ' ').trim().slice(0, 900);
}

function b64utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** RFC 2047 编码（Subject 含中文时必须） */
function mimeHeader(s: string): string {
  return `=?UTF-8?B?${b64utf8(sanitizeHeaderValue(s))}?=`;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: number | null = null;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} 超时`)), ms);
    }),
  ]).finally(() => clearTimeout(timer ?? null)) as Promise<T>;
}

interface SocketLike {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close: () => void;
  startTls?: () => SocketLike;
}

function createSession(sock: SocketLike, timeoutMs = 15000) {
  const writer = sock.writable.getWriter();
  const reader = sock.readable.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = '';

  async function readLine(): Promise<string> {
    while (true) {
      const idx = buf.indexOf(CRLF);
      if (idx >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        return line;
      }
      const { value, done } = await withTimeout(reader.read(), timeoutMs, 'SMTP 读取');
      if (done) throw new Error('SMTP 连接已关闭');
      buf += decoder.decode(value, { stream: true });
    }
  }

  async function readMulti(): Promise<string[]> {
    const lines: string[] = [];
    while (true) {
      const line = await readLine();
      lines.push(line);
      if (line.length >= 4 && line[3] === ' ') break;
    }
    return lines;
  }

  async function writeLine(s: string): Promise<void> {
    await withTimeout(writer.write(encoder.encode(s + CRLF)), timeoutMs, 'SMTP 写入');
  }

  return {
    greeting: () => readLine().then(() => undefined),
    /** 解锁 reader/writer 但不关闭连接（STARTTLS 升级前必须调用） */
    unlock: () => {
      try { writer.releaseLock(); } catch { /* 忽略 */ }
      try { reader.releaseLock(); } catch { /* 忽略 */ }
    },
    ehlo: async () => {
      await writeLine('EHLO update-hub');
      return readMulti();
    },
    cmd: async (line: string): Promise<string> => {
      await writeLine(line);
      return readLine();
    },
    /** DATA 内容块：自动 dot-stuffing 并以 CRLF.CRLF 结束 */
    dataBlock: async (msg: string): Promise<string> => {
      const stuffed = msg.split(/\r?\n/).map(l => (l.startsWith('.') ? '.' + l : l)).join(CRLF);
      await writeLine(stuffed + CRLF + '.');
      return readLine();
    },
    release: async () => {
      try { await writer.close(); } catch { /* 忽略 */ }
      try { await reader.cancel(); } catch { /* 忽略 */ }
    },
  };
}

type Session = ReturnType<typeof createSession>;

function expect(resp: string, prefix: string, what: string) {
  if (!resp.startsWith(prefix)) throw new Error(`${what} 失败: ${resp}`);
}

function buildMessage(from: string, to: string, subject: string, html: string): string {
  const headers = [
    `From: Update Hub <${sanitizeHeaderValue(from)}>`,
    `To: <${sanitizeHeaderValue(to)}>`,
    `Subject: ${mimeHeader(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
  ];
  const body = (b64utf8(html).match(/.{1,76}/g) || []).join(CRLF);
  return headers.join(CRLF) + CRLF + body;
}

/**
 * 发送 HTML 邮件（SMTP + STARTTLS/SMTPS）
 * 安全约束：
 * - 收件人/发件人必须是合法邮箱且不含 CR/LF（防头注入）
 * - 服务器不支持 STARTTLS 时拒绝发送（不落明文口令）
 * - DATA 自动 dot-stuffing，正文按 base64 传输
 */
export async function sendEmail(env: Env, to: string, subject: string, html: string) {
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT) || 587;
  const user = env.SMTP_USER || '';
  const pass = env.SMTP_PASS || '';
  const from = env.SMTP_FROM || user;

  if (!host || !user || !pass) {
    console.log('SMTP not configured, skipping email.');
    return;
  }
  if (!isValidEmail(to)) {
    console.error(`Skip invalid recipient: ${JSON.stringify(String(to).slice(0, 100))}`);
    return;
  }
  if (!isValidEmail(from)) {
    console.error('SMTP_FROM / SMTP_USER 不是合法邮箱，取消发送');
    return;
  }

  let sock: SocketLike | null = null;
  let session: Session | null = null;
  try {
    sock = await connect(
      { hostname: host, port },
      {
        // 587 等端口需要先明文协商再升级 TLS，必须声明 'starttls'，
        // 否则 startTls() 会直接抛错；465 直接 TLS。
        secureTransport: (port === 465 ? 'on' : 'starttls') as 'on' | 'starttls',
        allowHalfOpen: false,
      }
    ) as SocketLike;
    session = createSession(sock);
    await session.greeting();
    let ehlo = (await session.ehlo()).join('\n');

    // 非 SMTPS 端口必须走 STARTTLS，否则拒绝明文发送口令
    if (port !== 465) {
      if (!/STARTTLS/i.test(ehlo)) {
        throw new Error('服务器不支持 STARTTLS，拒绝以明文发送认证信息');
      }
      expect(await session.cmd('STARTTLS'), '2', 'STARTTLS');
      // startTls() 会废弃旧 socket 的 reader/writer：
      // 必须先解锁（releaseLock），不能 close/cancel（那会直接断开连接）
      session.unlock();
      sock = (sock.startTls ? sock.startTls() : sock) as SocketLike;
      session = createSession(sock);
      ehlo = (await session.ehlo()).join('\n');
    }

    if (!/AUTH/i.test(ehlo)) throw new Error('服务器不支持 AUTH');

    expect(await session.cmd('AUTH LOGIN'), '3', 'AUTH LOGIN');
    expect(await session.cmd(b64utf8(user)), '3', 'AUTH 用户名');
    expect(await session.cmd(b64utf8(pass)), '2', 'AUTH 密码');
    expect(await session.cmd(`MAIL FROM:<${sanitizeHeaderValue(from)}>`), '2', 'MAIL FROM');
    expect(await session.cmd(`RCPT TO:<${sanitizeHeaderValue(to)}>`), '2', 'RCPT TO');
    expect(await session.cmd('DATA'), '3', 'DATA');
    expect(await session.dataBlock(buildMessage(from, to, subject, html)), '2', '邮件内容');
    await session.cmd('QUIT').catch(() => undefined);

    console.log(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`Email send failed: ${err}`);
  } finally {
    try { await session?.release(); } catch { /* 忽略 */ }
    try { sock?.close(); } catch { /* 忽略 */ }
  }
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatUpdateEmail(
  project: { label: string; icon: string },
  update: { title: string; version: string; status: string; body: string; diff_url: string },
  opts: { unsubscribeUrl?: string } = {}
): string {
  const statusColors: Record<string, string> = { ok: '#00b894', changed: '#74b9ff', error: '#e17055', warning: '#fdcb6e' };
  const color = statusColors[update.status] || '#8b8fa3';
  // 链接只允许 http/https（防 javascript: 协议注入）
  let link = '';
  if (update.diff_url) {
    try {
      const u = new URL(update.diff_url);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        link = `<a href="${escapeHtml(u.toString())}" style="color:#6c5ce7">查看详情 →</a>`;
      }
    } catch { /* 忽略非法 URL */ }
  }
  const footer = opts.unsubscribeUrl
    ? `<p style="color:#999;font-size:12px;margin-top:16px"><a href="${escapeHtml(opts.unsubscribeUrl)}" style="color:#999">不再接收此类通知</a></p>`
    : '';

  return `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2>${escapeHtml(project.icon)} ${escapeHtml(project.label)} 更新通知</h2>
      <div style="border-left:4px solid ${color};padding:12px 16px;background:#f8f9fa;border-radius:4px;margin:16px 0">
        <strong>${escapeHtml(update.title)}</strong>
        ${update.version ? `<span style="color:#6c5ce7;margin-left:8px">v${escapeHtml(update.version)}</span>` : ''}
        <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:4px;background:${color}20;color:${color};font-size:12px">${escapeHtml(update.status)}</span>
        ${update.body ? `<p style="color:#666;margin-top:8px">${escapeHtml(update.body)}</p>` : ''}
        ${link}
      </div>
      ${footer}
    </div>`;
}
