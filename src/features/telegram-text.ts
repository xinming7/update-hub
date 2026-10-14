/**
 * Telegram 消息格式化与截断。
 *
 * 刻意做成零相对依赖的叶子模块（见 url-guard.ts 顶部说明）：
 * 被 test/*.mjs 直接 import，所以不能出现 `from './xxx'`。
 */

/** Telegram 单条消息上限 4096 */
export const TELEGRAM_MAX_LEN = 4096;

/**
 * 按行截断到 len，并补齐被截断处未闭合的 HTML 标签。
 *
 * 补标签的长度必须计入预算：闭合标签是「加在截断结果之后」的，
 * 若只按 len - marker 切正文再追加 "</b>"，总长会超出 4096 被 Telegram 拒收
 * （正是本函数要防的那个 400）。所以先把闭合标签的开销从预算里扣掉。
 */
export function truncateTelegramHtml(text: string, len = TELEGRAM_MAX_LEN): string {
  if (text.length <= len) return text;
  const marker = '\n\n... (内容过长已截断)';

  // 先按「预算 = len - marker」切出候选，算出需要补的闭合标签长度，再收窄预算重切。
  // 切一次 + 补一次即可：收窄预算不会新增未闭合标签，闭合长度只减不增。
  const first = cutLines(text, len - marker.length).replace(/<[^>]*$/, '');
  const closers = repairUnclosedTags(first);
  const body = cutLines(text, len - marker.length - closers.length).replace(/<[^>]*$/, '');
  return body + repairUnclosedTags(body) + marker;
}

/** 按行累加到不超过 budget 的最长前缀（行间用 \n 连接） */
function cutLines(text: string, budget: number): string {
  let out = '';
  for (const line of text.split('\n')) {
    if ((out + line + 1).length > budget) break;
    out += (out ? '\n' : '') + line;
  }
  return out;
}

/** 补上 fragment 中已打开但未闭合的标签（倒序闭合），忽略自闭合与 <br> */
export function repairUnclosedTags(fragment: string): string {
  const open: string[] = [];
  for (const m of fragment.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)[^>]*>/g)) {
    const [, slash, name] = m;
    const tag = name.toLowerCase();
    if (tag === 'br') continue;
    if (slash) {
      const at = open.lastIndexOf(tag);
      if (at >= 0) open.splice(at, 1);
    } else {
      open.push(tag);
    }
  }
  return open.reverse().map(t => `</${t}>`).join('');
}
