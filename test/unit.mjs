/**
 * 字段级单元测试（无需 dev server）。
 *   用法：npm run test:unit
 *
 * 覆盖：
 *   1. SSRF 防护：内嵌 IPv4 的 IPv6 表示法（NAT64 / 6to4 / IPv4-mapped）必须被拦
 *   2. 鉴权限速：匿名请求不得累计失败计数（否则同 IP 合法用户被锁）
 *   3. RSS：baseUrl（站点）与 selfUrl（feed）必须区分
 *   4. Telegram 截断：长度受限且 HTML 标签闭合
 *
 * 直接 import 源码：被测函数已抽成零相对依赖的叶子模块
 * （src/features/url-guard.ts、src/features/telegram-text.ts），
 * Node 原生 ESM 可直接加载，不需要 TS loader。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isBlockedIpv4,
  embeddedIpv4,
  validateWebhookUrl,
} from '../src/features/url-guard.ts';
import {
  TELEGRAM_MAX_LEN,
  truncateTelegramHtml,
} from '../src/features/telegram-text.ts';

const readSrc = p => readFileSync(new URL(p, import.meta.url), 'utf8');

// ── 1. SSRF：内网/内嵌表示法必须被拦 ────────────────────────
const mustBlock = [
  // 经典内网
  'http://127.0.0.1/x',
  'http://10.0.0.1/x',
  'http://192.168.1.1/x',
  'http://172.16.0.1/x',
  'http://169.254.169.254/latest/meta-data/',   // 云 metadata
  'http://0.0.0.0/x',
  'http://100.64.0.1/x',                        // CGNAT
  'http://2130706433/x',                        // 十进制回环（URL 层归一化）
  'http://localhost/x',
  'http://foo.internal/x',
  'http://[::1]/x',
  'http://[fd00::1]/x',
  'http://[fe80::1]/x',
  // IPv4-mapped
  'http://[::ffff:127.0.0.1]/x',
  'http://[::ffff:7f00:1]/x',
  'http://[::ffff:a9fe:a9fe]/x',                // → 169.254.169.254
  // NAT64（RFC 6052）—— 本次修复的核心
  'http://[64:ff9b::7f00:1]/x',                 // → 127.0.0.1
  'http://[64:ff9b::a9fe:a9fe]/x',              // → 169.254.169.254
  'http://[64:ff9b::0a00:1]/x',                 // → 10.0.0.1
  'http://[64:ff9b::192.168.1.1]/x',            // 明文后缀
  // 6to4（RFC 3056）—— 本次修复的核心
  'http://[2002:7f00:0001::]/x',                // → 127.0.0.1
  'http://[2002:a9fe:a9fe::]/x',                // → 169.254.169.254
  'http://[2002:0a00:0001::]/x',                // → 10.0.0.1
];
for (const url of mustBlock) {
  assert.equal(validateWebhookUrl(url), null, `应拦截但放行: ${url}`);
}
console.log(`✓ SSRF: ${mustBlock.length} 个内网/内嵌表示法全部拦截`);

// 正常公网地址不得误伤
const mustAllow = [
  'https://example.com/hook',
  'http://example.com/hook?a=1',
  'https://hooks.slack.com/services/x',
  'https://8.8.8.8/hook',
];
for (const url of mustAllow) {
  assert.ok(validateWebhookUrl(url), `应放行但拦截: ${url}`);
}
console.log(`✓ SSRF: ${mustAllow.length} 个正常公网地址未被误伤`);

// 非 http(s)、带凭据、超长、非法输入
for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'ftp://example.com/x',
                   'https://user:pass@example.com/x', 'not a url', '', null, undefined, 42,
                   'https://' + 'a'.repeat(3000) + '.com/x']) {
  assert.equal(validateWebhookUrl(bad), null, `应拒绝: ${String(bad).slice(0, 40)}`);
}
console.log('✓ SSRF: 非 http(s)/带凭据/非法输入全部拒绝');

// embeddedIpv4 直接单测
assert.equal(embeddedIpv4('64:ff9b::a9fe:a9fe'), '169.254.169.254');
assert.equal(embeddedIpv4('2002:7f00:1::'), '127.0.0.1');
assert.equal(embeddedIpv4('::ffff:7f00:1'), '127.0.0.1');
assert.equal(embeddedIpv4('2606:4700::1111'), null, '公网 IPv6 不应被误判');
assert.equal(isBlockedIpv4('224.0.0.1'), false, '（已知未覆盖：组播段，非本次范围）');
console.log('✓ embeddedIpv4: NAT64/6to4/IPv4-mapped 还原正确，公网 IPv6 不误判');

// ── 2. 鉴权：匿名请求不得累计失败计数 ────────────────────────
// 断言语义：src/auth.ts 中不应存在「无凭证也记录 dashpwd 失败」的分支。
// 该分支会让同 IP 上任何人刷 5 次空请求就把持正确密码的合法用户一起锁死。
const AUTH_SRC = readSrc('../src/auth.ts');
assert.ok(
  !/if\s*\(\s*!bearer\s*&&\s*!key\s*&&\s*dashPwd\s*\)\s*\{[^}]*recordAuthFailure/.test(AUTH_SRC),
  'auth.ts 中仍存在「无凭证记失败」的分支（会导致同 IP 合法用户被锁）'
);
// 反向确认：真正的错误密码仍必须计数（限速不能被削弱）
assert.ok(
  /await recordAuthFailure\(c\.env, dashKey\)/.test(AUTH_SRC),
  'auth.ts 中「错误密码记失败」的逻辑被误删，限速失效'
);
console.log('✓ 限速: 匿名请求不累计，错误密码仍计数');

// ── 3. RSS：两处调用都必须传 (title, baseUrl, feedUrl, items) ──
const RSS_SRC = readSrc('../src/features/rss.ts');
const rssCalls = RSS_SRC.split('\n').filter(l => /= generateAtomFeed\(/.test(l));
assert.equal(rssCalls.length, 2, `应有 2 处 generateAtomFeed 调用，实际 ${rssCalls.length}`);
assert.equal(rssCalls.filter(c => /\(([^,]+),\s*\1,/.test(c)).length, 0,
  '仍存在 baseUrl 与 selfUrl 传同一变量的调用');
assert.equal(rssCalls.filter(c => /generateAtomFeed\([^,]+,\s*baseUrl,\s*feedUrl,/.test(c)).length, 2,
  '两处调用都应传 (title, baseUrl, feedUrl, items)');
console.log('✓ RSS: baseUrl 与 selfUrl 已区分（2 处调用）');

// ── 4. Telegram 截断 ────────────────────────────────────────
assert.equal(TELEGRAM_MAX_LEN, 4096, 'Telegram 单条上限应为 4096');

const short = '<b>hi</b>';
assert.equal(truncateTelegramHtml(short), short, '短文本不应被改动');

const long = Array.from({ length: 800 }, (_, i) =>
  `<b>项目 ${i}</b> 详情 <a href="https://e.com/${i}">链接</a>`).join('\n');
assert.ok(long.length > TELEGRAM_MAX_LEN, '测试输入应超过上限');
const out = truncateTelegramHtml(long);
assert.ok(out.length <= TELEGRAM_MAX_LEN, `截断后应 <=4096，实际 ${out.length}`);
assert.ok(out.includes('已截断'), '应带截断标记');

const opens = [...out.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g)]
  .map(m => m[1].toLowerCase()).filter(t => t !== 'br');
const closes = [...out.matchAll(/<\/([a-zA-Z][a-zA-Z0-9]*)>/g)].map(m => m[1].toLowerCase());
for (const t of new Set(opens)) {
  assert.equal(opens.filter(x => x === t).length, closes.filter(x => x === t).length,
    `标签 <${t}> 未配平`);
}
console.log(`✓ Telegram: 截断至 ${out.length} 字符，标签配平`);

// 关键回归：补标签的长度必须计入 4096 预算。
// 只有「开标签独占一行、后面是普通行」的输入才会真正触发补标签路径
// （按行切不会撕开标签，所以标签与内容同行的输入即使删掉 repair 也照样配平）。
const needsRepair = '<b>\n' + Array.from({ length: 700 }, (_, i) => `参数行${i}`).join('\n');
assert.ok(needsRepair.length > TELEGRAM_MAX_LEN, '该输入应超限');
const repaired = truncateTelegramHtml(needsRepair);
assert.ok(repaired.includes('</b>'), '应补上未闭合的 </b>');
assert.ok(repaired.length <= TELEGRAM_MAX_LEN,
  `补标签后仍不得超限，实际 ${repaired.length} > ${TELEGRAM_MAX_LEN}`);
console.log(`✓ Telegram: 补标签生效且计入预算（${repaired.length} <= ${TELEGRAM_MAX_LEN}）`);

// 嵌套标签必须倒序闭合
const nested = '<b>\n<i>\n<code>\n' + Array.from({ length: 1500 }, (_, i) => `行${i}`).join('\n');
assert.ok(nested.length > TELEGRAM_MAX_LEN, '该输入应超限');
const nestedOut = truncateTelegramHtml(nested);
assert.ok(nestedOut.endsWith('</code></i></b>\n\n... (内容过长已截断)'),
  `嵌套标签应倒序闭合，实际尾部: ${JSON.stringify(nestedOut.slice(-40))}`);
assert.ok(nestedOut.length <= TELEGRAM_MAX_LEN, `嵌套补标签后超限: ${nestedOut.length}`);
console.log('✓ Telegram: 嵌套标签倒序闭合');

// 超限输入无论形状如何，输出都不得越过上限，且标签必须配平
const shapes = {
  '多行短行': Array.from({ length: 700 }, (_, i) => `行${i}`).join('\n'),
  '每行带完整标签': Array.from({ length: 300 }, (_, i) => `<b>标题${i}</b> 内容`).join('\n'),
  '单行超长': 'z'.repeat(9000),
  '多行+独立开标签': needsRepair,
  '嵌套': nested,
};
for (const [name, input] of Object.entries(shapes)) {
  const o = input.length <= TELEGRAM_MAX_LEN ? input : truncateTelegramHtml(input);
  assert.ok(o.length <= TELEGRAM_MAX_LEN, `${name}: 输出 ${o.length} 超过上限`);
  const op = [...o.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g)].map(m => m[1].toLowerCase()).filter(x => x !== 'br');
  const cl = [...o.matchAll(/<\/([a-zA-Z][a-zA-Z0-9]*)>/g)].map(m => m[1].toLowerCase());
  for (const tag of new Set(op)) {
    assert.equal(op.filter(x => x === tag).length, cl.filter(x => x === tag).length,
      `${name}: 标签 <${tag}> 未配平`);
  }
}
console.log(`✓ Telegram: ${Object.keys(shapes).length} 种输入形状均不超限且标签配平`);

console.log('\n全部检查通过');
