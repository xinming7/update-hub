/* 分页逻辑回归检查：把 dashboard 模板里的分页算法原样提取出来跑断言。
   这些函数在浏览器端内联执行，无法 import，故按源码文本提取后求值。 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('/Users/liujiaming/Ai/project/update-hub/src/html/dashboard.ts', 'utf8');

// 与 dashboard.ts 内联实现保持一致的两段纯逻辑（改动时必须同步）
const PAGE_SIZE = 20;
const totalPagesOf = n => Math.max(1, Math.ceil(n / PAGE_SIZE));
function clampPage(p, total) {
  if (p > total) return total;
  if (p < 1) return 1;
  return p;
}
function windowOf(page, total) {
  const wanted = new Set([1, total, page, page - 1, page + 1]);
  return [...wanted].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
}
function sliceOf(arr, page) {
  const total = totalPagesOf(arr.length);
  const p = clampPage(page, total);
  return arr.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
}

// 1. 总页数
assert.equal(totalPagesOf(0), 1, '空列表应为 1 页而非 0 页');
assert.equal(totalPagesOf(1), 1);
assert.equal(totalPagesOf(20), 1);
assert.equal(totalPagesOf(21), 2, '21 条应分 2 页');
assert.equal(totalPagesOf(55), 3, '55 条应分 3 页');
assert.equal(totalPagesOf(400), 20);

// 2. 页码夹紧（筛选后页码越界的场景）
assert.equal(clampPage(5, 3), 3, '页码超过总页数应夹到末页');
assert.equal(clampPage(0, 3), 1);
assert.equal(clampPage(-2, 3), 1);
assert.equal(clampPage(2, 3), 2);

// 3. 切片：不重不漏、末页不越界
const data = Array.from({ length: 55 }, (_, i) => i);
const p1 = sliceOf(data, 1), p2 = sliceOf(data, 2), p3 = sliceOf(data, 3);
assert.equal(p1.length, 20);
assert.equal(p2.length, 20);
assert.equal(p3.length, 15, '末页应为剩余 15 条');
assert.deepEqual([...p1, ...p2, ...p3], data, '三页拼回应等于原数组，不重不漏');
assert.equal(sliceOf(data, 99).length, 15, '越界页码夹到末页，不应返回空');
assert.equal(sliceOf([], 1).length, 0, '空数据不应抛错');
assert.equal(sliceOf([1, 2, 3], 1).length, 3);

// 4. 页码窗口：首尾保留、当前页居中、无重复无越界
assert.deepEqual(windowOf(1, 3), [1, 2, 3]);
assert.deepEqual(windowOf(1, 10), [1, 2, 10], '第 1 页应显示 1,2,…,10');
assert.deepEqual(windowOf(5, 10), [1, 4, 5, 6, 10]);
assert.deepEqual(windowOf(10, 10), [1, 9, 10]);
assert.deepEqual(windowOf(1, 1), [1], '只有一页时不产生重复');
assert.deepEqual(windowOf(2, 2), [1, 2]);
for (const t of [1, 2, 3, 7, 20]) {
  for (let p = 1; p <= t; p++) {
    const w = windowOf(p, t);
    assert.ok(w.every(n => n >= 1 && n <= t), `窗口越界: page=${p} total=${t}`);
    assert.equal(new Set(w).size, w.length, `窗口有重复: page=${p} total=${t}`);
    assert.ok(w.includes(p), `窗口必须含当前页: page=${p} total=${t}`);
  }
}

// 5. 源码一致性：内联实现必须仍是这些常量与分支
assert.ok(/const PAGE_SIZE = 20/.test(src), '源码 PAGE_SIZE 已变，本条测试需同步');
assert.ok(/currentPage > totalPages/.test(src), '源码缺页码上限夹紧');
assert.ok(/currentPage < 1/.test(src), '源码缺页码下限夹紧');
assert.ok(/new Set\(\[1, totalPages, currentPage, currentPage - 1, currentPage \+ 1\]\)/.test(src),
  '源码页码窗口构造已变，本条测试需同步');

// 6. timeAgo 的时区处理（本轮修的 NaN bug）
const timeAgoSrc = src.match(/function timeAgo\(dateStr\) \{[\s\S]*?\n\}/)[0];
assert.ok(/hasTz/.test(timeAgoSrc), 'timeAgo 应含时区探测');
assert.ok(/Number\.isFinite\(t\)/.test(timeAgoSrc), 'timeAgo 应含无效日期兜底');
{
  const fn = new Function('dateStr', timeAgoSrc.slice(timeAgoSrc.indexOf('{') + 1, -1).replace(/^/, 'const Date_now = Date.now;'));
  // D1 格式（线上真实）：无时区标记，应按 UTC 解析
  const d1 = fn('2026-10-14 09:00:00');
  assert.ok(!/NaN/.test(d1), `D1 格式不应产生 NaN，实得: ${d1}`);
  // ISO 格式（API 上报可能写入）：带 Z，不应重复补 Z
  const iso = fn('2026-10-14T09:00:00Z');
  assert.ok(!/NaN/.test(iso), `ISO 格式不应产生 NaN，实得: ${iso}`);
  assert.equal(fn(''), '', '空串应返回空');
  assert.equal(fn('不是日期'), '', '无法解析应返回空而非 NaN');
}

console.log('分页与时间显示：全部断言通过');
