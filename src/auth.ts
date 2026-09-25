import { Context, Next } from 'hono';
import type { Env } from './types';

type AppVariables = { tokenScopes: string[]; tokenId?: number; tokenLastUsed?: string };
export type AppContext = Context<{ Bindings: Env; Variables: AppVariables }>;

/**
 * Bearer Token 鉴权中间件
 * 优先查 api_tokens 表，回退到 env.API_TOKEN
 */
export async function authMiddleware(c: AppContext, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: '缺少 Authorization header' }, 401);
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return c.json({ error: 'Token 为空' }, 401);
  }

  // 先查数据库 token 表
  const row = await c.env.DB.prepare(
    'SELECT id, scopes, enabled, last_used FROM api_tokens WHERE token = ?'
  ).bind(token).first<{ id: number; scopes: string; enabled: number; last_used: string | null }>();

  if (row) {
    if (!row.enabled) {
      return c.json({ error: 'Token 已被禁用' }, 403);
    }
    c.set('tokenId', row.id);
    c.set('tokenLastUsed', row.last_used ?? undefined);
    c.set('tokenScopes', JSON.parse(row.scopes));

    // 优化 #5: 只在 last_used 为空或距上次超过 1 小时时才写入
    const needsUpdate = !row.last_used ||
      (Date.now() - new Date(row.last_used + 'Z').getTime()) > 3600_000;
    if (needsUpdate) {
      await c.env.DB.prepare(
        'UPDATE api_tokens SET last_used = datetime("now") WHERE id = ?'
      ).bind(row.id).run();
    }

    await next();
    return;
  }

  // 回退到环境变量主 token
  const mainToken = c.env.API_TOKEN;
  if (mainToken && token === mainToken) {
    c.set('tokenScopes', ['read', 'write', 'admin']);
    await next();
    return;
  }

  return c.json({ error: 'Token 无效' }, 401);
}

/**
 * 检查写权限 —— 返回 Response 表示拒绝，null 表示通过
 */
export function requireWrite(c: AppContext): Response | null {
  const scopes = c.get('tokenScopes') as string[] | undefined;
  if (!scopes?.includes('write') && !scopes?.includes('admin')) {
    return c.json({ error: '该 Token 无写入权限' }, 403);
  }
  return null;
}

/**
 * 宽松认证：同时接受 DASHBOARD_PASSWORD、API_TOKEN、数据库 Token
 * 用于公开端点（public/overview、daily-digest）
 * 返回 Response 表示拒绝，null 表示通过
 */
export async function authAny(c: Context<{ Bindings: Env }>): Promise<Response | null> {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const key = c.req.query('key');
  const dashPwd = c.env.DASHBOARD_PASSWORD;
  const mainToken = c.env.API_TOKEN;

  // 1. DASHBOARD_PASSWORD
  if (dashPwd && (authHeader === `Bearer ${dashPwd}` || key === dashPwd)) return null;
  // 2. 主 Token
  if (mainToken && token === mainToken) return null;
  // 3. 数据库 Token
  if (token) {
    const row = await c.env.DB.prepare(
      'SELECT enabled FROM api_tokens WHERE token = ?'
    ).bind(token).first<{ enabled: number }>();
    if (row && row.enabled) return null;
  }

  return c.json({ error: '需要认证，请通过 Authorization header 或 ?key=xxx 提供' }, 401);
}
