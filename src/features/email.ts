import type { Env } from '../types';
// @ts-ignore Cloudflare Workers TCP socket API
import { connect } from 'cloudflare:sockets';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function sendEmail(env: Env, to: string, subject: string, html: string) {
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT) || 587;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const from = env.SMTP_FROM || user;

  if (!host || !user || !pass) {
    console.log('SMTP not configured, skipping email.');
    return;
  }

  try {
    // @ts-ignore
    const socket = await connect({ hostname: host, port });
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();

    let buf = '';
    async function readLine(): Promise<string> {
      while (true) {
        if (buf.includes('\r\n')) {
          const line = buf.split('\r\n')[0];
          buf = buf.slice(line.length + 2);
          return line;
        }
        const { value, done } = await reader.read();
        if (done) throw new Error('Connection closed');
        buf += decoder.decode(value, { stream: true });
      }
    }

    async function send(cmd: string): Promise<string> {
      await writer.write(encoder.encode(cmd + '\r\n'));
      return readLine();
    }

    async function sendMulti(cmd: string): Promise<string[]> {
      await writer.write(encoder.encode(cmd + '\r\n'));
      const lines: string[] = [];
      while (true) {
        const line = await readLine();
        lines.push(line);
        if (line.length >= 4 && line[3] === ' ') break;
      }
      return lines;
    }

    // 1. 读取服务器问候
    await readLine();

    // 2. EHLO
    const ehloLines = await sendMulti('EHLO update-hub');
    const ehloResp = ehloLines.join('\n');

    // 3. STARTTLS（如果服务器支持且端口非 465）
    if (port !== 465 && ehloResp.includes('STARTTLS')) {
      const starttlsResp = await send('STARTTLS');
      if (!starttlsResp.startsWith('2')) {
        throw new Error(`STARTTLS failed: ${starttlsResp}`);
      }
      socket.close();
      // @ts-ignore
      const tlsSocket = await connect({ hostname: host, port, secureTransport: 'on' });
      const tlsWriter = tlsSocket.writable.getWriter();
      const tlsReader = tlsSocket.readable.getReader();
      return await sendEmailTls(tlsWriter, tlsReader, decoder, encoder, user!, pass!, from!, to, subject, html);
    }

    // 4. AUTH LOGIN（明文模式）
    await send('AUTH LOGIN');
    await send(btoa(user));
    await send(btoa(pass));
    await send(`MAIL FROM:<${from}>`);
    await send(`RCPT TO:<${to}>`);
    await send('DATA');
    await send(`From: Update Hub <${from}>\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}\r\n.`);
    await send('QUIT');

    await writer.close();
    await reader.cancel();
    socket.close();
    console.log(`Email sent to ${to}: ${subject}`);
  } catch (err) {
    console.error(`Email send failed: ${err}`);
  }
}

async function sendEmailTls(
  writer: WritableStreamDefaultWriter,
  reader: ReadableStreamDefaultReader,
  decoder: TextDecoder,
  encoder: TextEncoder,
  user: string, pass: string, from: string,
  to: string, subject: string, html: string
) {
  let buf = '';
  async function readLine(): Promise<string> {
    while (true) {
      if (buf.includes('\r\n')) {
        const line = buf.split('\r\n')[0];
        buf = buf.slice(line.length + 2);
        return line;
      }
      const { value, done } = await reader.read();
      if (done) throw new Error('TLS connection closed');
      buf += decoder.decode(value, { stream: true });
    }
  }
  async function send(cmd: string): Promise<string> {
    await writer.write(encoder.encode(cmd + '\r\n'));
    return readLine();
  }
  async function sendMulti(cmd: string): Promise<string[]> {
    await writer.write(encoder.encode(cmd + '\r\n'));
    const lines: string[] = [];
    while (true) {
      const line = await readLine();
      lines.push(line);
      if (line.length >= 4 && line[3] === ' ') break;
    }
    return lines;
  }

  await sendMulti('EHLO update-hub');
  await send('AUTH LOGIN');
  await send(btoa(user));
  await send(btoa(pass));
  await send(`MAIL FROM:<${from}>`);
  await send(`RCPT TO:<${to}>`);
  await send('DATA');
  await send(`From: Update Hub <${from}>\r\nTo: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}\r\n.`);
  await send('QUIT');

  await writer.close();
  await reader.cancel();
  console.log(`Email sent (TLS) to ${to}: ${subject}`);
}

export function formatUpdateEmail(project: { label: string; icon: string }, update: { title: string; version: string; status: string; body: string; diff_url: string }): string {
  const statusColors: Record<string, string> = { ok: '#00b894', changed: '#74b9ff', error: '#e17055', warning: '#fdcb6e' };
  const color = statusColors[update.status] || '#8b8fa3';
  return `
    <div style="font-family:-apple-system,sans-serif;max-width:600px;margin:0 auto;padding:20px">
      <h2>${escapeHtml(project.icon)} ${escapeHtml(project.label)} 更新通知</h2>
      <div style="border-left:4px solid ${color};padding:12px 16px;background:#f8f9fa;border-radius:4px;margin:16px 0">
        <strong>${escapeHtml(update.title)}</strong>
        ${update.version ? `<span style="color:#6c5ce7;margin-left:8px">v${escapeHtml(update.version)}</span>` : ''}
        <span style="display:inline-block;margin-left:8px;padding:2px 8px;border-radius:4px;background:${color}20;color:${color};font-size:12px">${escapeHtml(update.status)}</span>
        ${update.body ? `<p style="color:#666;margin-top:8px">${escapeHtml(update.body)}</p>` : ''}
        ${update.diff_url ? `<a href="${escapeHtml(update.diff_url)}" style="color:#6c5ce7">查看详情 →</a>` : ''}
      </div>
    </div>`;
}
