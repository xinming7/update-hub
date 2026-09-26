import { Context, MiddlewareHandler } from 'hono';
import type { Env } from './types';

export type AppVariables = {
  tokenScopes: string[];
  tokenId?: number;
  tokenLastUsed?: string;
};
export type AppEnv = { Bindings: Env; Variables: AppVariables };
export type AppContext = Context<AppEnv>;

const VALID_SCOPES = new Set(['read', 'write', 'admin']);

/** SHA-256 → hex */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** 恒定时间字符串比较（先哈希对齐长度，再逐字节异或） */
export async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([sha256Hex(a), sha256Hex(b)]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha.charCodeAt(i) ^ hb.charCodeAt(i);
  return diff === 0;
}

/** 解析 D1 datetime('now') 产出的 "YYYY-MM-DD HH:MM:SS"（UTC） */
export function parseDbTime(ts: string): number {
  return Date.parse(ts.replace(' ', 'T') + 'Z');
}

/** 规范化 scopes：非法输入返回 null */
export function normalizeScopes(input: unknown): string[] | null {
  if (input === undefined) return ['read', 'write'];
  if (!Array.isArray(input) || input.length === 0) return null;
  const out = new Set<string>();
  for (const s of input) {
    if (typeof s !== 'string' || !VALID_SCOPES.has(s)) return null;
    out.add(s);
  }
  return [...out];
}

/** 是否拥有某权限（admin 视为拥有全部权限） */
export function hasScope(c: AppContext, scope: string): boolean {
  const scopes = c.get('tokenScopes') as string[] | undefined;
  return !!scopes && (scopes.includes('admin') || scopes.includes(scope));
}

export function requireRead(c: AppContext): Response | null {
  return hasScope(c, 'read') ? null : c.json({ error: '该 Token 无读取权限' }, 403);
}

export function requireWrite(c: AppContext): Response | null {
  return hasScope(c, 'write') ? null : c.json({ error: '该 Token 无写入权限' }, 403);
}

interface TokenRow {
  id: number;
  scopes: string;
  enabled: number;
  last_used: string | null;
  token_hash: string | null;
  legacy_token: string | null;
}

/**
 * 按哈希查找 Token；兼容旧版明文记录并自动升级为哈希存储
 */
async function findDbToken(env: Env, token: string): Promise<TokenRow | null> {
  const hash = await sha256Hex(token);
  const row = await env.DB.prepare(
    'SELECT id, scopes, enabled, last_used, token_hash, legacy_token FROM api_tokens WHERE token_hash = ?'
  ).bind(hash).first<TokenRow>();
  if (row) return row;

  const legacy = await env.DB.prepare(
    'SELECT id, scopes, enabled, last_used, token_hash, legacy_token FROM api_tokens WHERE legacy_token = ?'
  ).bind(token).first<TokenRow>();
  if (!legacy) return null;

  // 自动升级：写入哈希、清除明文
  await env.DB.prepare(
    'UPDATE api_tokens SET token_hash = ?, legacy_token = NULL WHERE id = ?'
  ).bind(hash, legacy.id).run();
  return legacy;
}

function setTokenVars(c: AppContext, row: TokenRow) {
  let scopes: string[] = [];
  try {
    const parsed = JSON.parse(row.scopes);
    if (Array.isArray(parsed)) scopes = parsed.filter((s): s is string => typeof s === 'string' && VALID_SCOPES.has(s));
  } catch {
    scopes = [];
  }
  c.set('tokenId', row.id);
  c.set('tokenLastUsed', row.last_used ?? undefined);
  c.set('tokenScopes', scopes);
}

/**
 * 核心认证：Bearer Token（allowQuery 为 true 时额外接受 ?key=/?token=）
 * 通过返回 null，拒绝返回 Response
 */
async function authenticate(c: AppContext, allowQuery: boolean): Promise<Response | null> {
  const authHeader = c.req.header('Authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const queryToken = allowQuery ? (c.req.query('key') || c.req.query('token') || '') : '';
  const token = bearer || queryToken;
  if (!token) {
    return c.json({ error: '缺少凭证，请提供 Authorization: Bearer <token>' }, 401);
  }

  const row = await findDbToken(c.env, token);
  if (row) {
    if (!row.enabled) return c.json({ error: 'Token 已被禁用' }, 403);
    setTokenVars(c, row);

    // 只在 last_used 为空或距上次超过 1 小时时才写入
    const needsUpdate = !row.last_used || (Date.now() - parseDbTime(row.last_used)) > 3600_000;
    if (needsUpdate) {
      await c.env.DB.prepare('UPDATE api_tokens SET last_used = datetime("now") WHERE id = ?')
        .bind(row.id).run();
    }
    return null;
  }

  // 回退到环境变量主 Token（恒定时间比较）
  const mainToken = c.env.API_TOKEN;
  if (mainToken && await timingSafeEqualStr(token, mainToken)) {
    c.set('tokenScopes', ['read', 'write', 'admin']);
    return null;
  }

  return c.json({ error: 'Token 无效' }, 401);
}

/** 读接口鉴权（需要 read/admin） */
export const authRead: MiddlewareHandler<AppEnv> = async (c, next) => {
  const denied = await authenticate(c, false);
  if (denied) return denied;
  const bad = requireRead(c);
  if (bad) return bad;
  await next();
};

/** 写接口鉴权（需要 write/admin） */
export const authWrite: MiddlewareHandler<AppEnv> = async (c, next) => {
  const denied = await authenticate(c, false);
  if (denied) return denied;
  const bad = requireWrite(c);
  if (bad) return bad;
  await next();
};

/**
 * 宽松认证：DASHBOARD_PASSWORD、主 Token、数据库 Token 均可
 * 供 RSS / daily-digest 等使用 RSS 阅读器的场景（支持 ?key=/?token=）
 * 通过返回 null，拒绝返回 Response
 */
export async function authAny(c: AppContext): Promise<Response | null> {
  const authHeader = c.req.header('Authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const key = c.req.query('key') || c.req.query('token') || '';
  const presented = bearer || key;
  const dashPwd = c.env.DASHBOARD_PASSWORD;

  // 1. 仪表盘密码（授予读写权限）
  if (presented && dashPwd && await timingSafeEqualStr(presented, dashPwd)) {
    c.set('tokenScopes', ['read', 'write']);
    return null;
  }
  // 2. 主 Token / 数据库 Token
  return authenticate(c, true);
}
