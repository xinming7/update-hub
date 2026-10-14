/**
 * Webhook URL 校验（防 SSRF）。
 *
 * 刻意做成零相对依赖的叶子模块：浏览器/Worker 打包器（moduleResolution: Bundler）
 * 允许无扩展名 import，但 Node 原生 ESM 不行——本文件被 test/*.mjs 直接 import，
 * 所以这里不能出现 `from './xxx'`（`import type` 会被擦除，可以留）。
 */

/** IPv4 特殊段：回环、私有、链路本地、CGNAT、0.0.0.0/8。
 *  语义与原 webhooks.ts 中的实现逐字一致，本次仅搬位置不做行为变更。
 *  注意：与修复前一样，未覆盖 224.0.0.0/4（组播）等段——那是既有的行为，
 *  不属于本次修复范围，要收紧请单独提。 */
export function isBlockedIpv4(host: string): boolean {
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^0\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)) return true; // CGNAT
  return false;
}

/**
 * 把「内嵌 IPv4 的 IPv6 地址」还原成点分 IPv4，供 isBlockedIpv4 复判。
 * 覆盖三类会被解析到 IPv4 的表示法：
 *   - IPv4-mapped  ::ffff:a.b.c.d（RFC 4291）
 *   - NAT64       64:ff9b::/96（RFC 6052，云 egress 常见的 NAT64 出口）
 *   - 6to4        2002::/16（RFC 3056，次 32 bit 即 IPv4）
 * 返回点分十进制字符串；不匹配时返回 null。
 */
export function embeddedIpv4(host: string): string | null {
  // IPv4-mapped：::ffff:7f00:1 / 0:0:0:0:0:ffff:7f00:1
  const mappedHex = host.match(/^(?:.*:)?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16), lo = parseInt(mappedHex[2], 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  // NAT64 64:ff9b::/96：其后 32 bit 就是 IPv4
  const nat64 = host.match(/^64:ff9b::(?:0:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (nat64) {
    const hi = parseInt(nat64[1], 16), lo = parseInt(nat64[2], 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  // NAT64 带明文 IPv4 后缀：64:ff9b::a.b.c.d
  const nat64Dotted = host.match(/^64:ff9b::(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (nat64Dotted) return nat64Dotted[1];
  // 6to4 2002:xxxx:xxxx::/48：第二、三段即 IPv4
  const sixToFour = host.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})(?:::.*)?$/i);
  if (sixToFour) {
    const hi = parseInt(sixToFour[1], 16), lo = parseInt(sixToFour[2], 16);
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  return null;
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
  // IPv4 特殊段（含 URL 层已归一化的十进制/十六进制 IP）
  if (isBlockedIpv4(host)) return null;
  // 内嵌 IPv4 的 IPv6（::ffff: / NAT64 64:ff9b:: / 6to4 2002::）→ 还原为 IPv4 再判
  const mappedDotted = host.match(/^(?:.*:)?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (mappedDotted && isBlockedIpv4(mappedDotted[1])) return null;
  const embedded = embeddedIpv4(host);
  if (embedded && isBlockedIpv4(embedded)) return null;
  // IPv6 内网/回环（含非压缩形式；URL 层会归一化，这里兼容器错）
  if (host === '::1' || host === '::' || /^(fe80|fc|fd)/i.test(host)) return null;
  if (/^(?:0*:)+1$/.test(host)) return null; // 0:0:0:0:0:0:0:1 等形式的回环地址

  return u.toString();
}
