export function dashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Update Hub - 更新同步平台</title>
<style>
:root {
  --bg: #0f1117;
  --bg-card: #1a1d27;
  --bg-card-hover: #222633;
  --border: #2a2e3a;
  --text: #e4e6eb;
  --text-dim: #8b8fa3;
  --accent: #6c5ce7;
  --accent-light: #a29bfe;
  --green: #00b894;
  --red: #e17055;
  --orange: #fdcb6e;
  --blue: #74b9ff;
  --radius: 12px;
  --header-from: #1a1d27;
  --header-to: #2d1f4e;
  --link-bg: rgba(108,92,231,.12);
  /* 语义化软色：原先散落在 .status-badge / .proj-tag 等处的硬编码 rgba 收拢于此 */
  --accent-soft: rgba(108,92,231,.15);
  --green-soft: rgba(0,184,148,.15);
  --blue-soft: rgba(116,185,255,.15);
  --red-soft: rgba(225,112,85,.15);
  --red-soft-border: rgba(225,112,85,.3);
  --red-soft-hover: rgba(225,112,85,.25);
  --dim-soft: rgba(139,143,163,.15);
  /* 间距 / 字号 / 圆角 / 阴影 / 动效（此前完全没有体系，全是散落字面量） */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 24px; --space-6: 32px; --space-7: 48px;
  --text-xs: 11px; --text-sm: 12px; --text-base: 14px; --text-lg: 18px;
  --text-xl: 24px; --text-2xl: 32px;
  --radius-sm: 6px; --radius-md: 8px; --radius-full: 999px;
  --shadow-sm: 0 1px 2px rgba(0,0,0,.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,.4);
  --ease: cubic-bezier(.4,0,.2,1); --dur: .18s;
}
[data-theme="light"] {
  --bg: #f5f6fa;
  --bg-card: #ffffff;
  --bg-card-hover: #f0f1f5;
  --border: #e2e4ea;
  --text: #1a1d27;
  --text-dim: #6b7080;
  --accent: #6c5ce7;
  --accent-light: #5a4bd1;
  --green: #00a884;
  --red: #d63031;
  --orange: #e17055;
  --blue: #0984e3;
  --header-from: #ffffff;
  --header-to: #f0ecff;
  --link-bg: rgba(108,92,231,.1);
  --accent-soft: rgba(108,92,231,.1);
  --green-soft: rgba(0,168,132,.12);
  --blue-soft: rgba(9,132,227,.12);
  --red-soft: rgba(214,48,49,.1);
  --red-soft-border: rgba(214,48,49,.25);
  --red-soft-hover: rgba(214,48,49,.18);
  --dim-soft: rgba(107,112,128,.12);
  --shadow-sm: 0 1px 2px rgba(0,0,0,.06);
  --shadow-md: 0 4px 12px rgba(0,0,0,.08);
}
/* 现代浏览器：light-dark() 一套值同时覆盖深浅主题。
   注意：用 @supports 而非直接写，旧浏览器会跳过本块、继续用上面的 [data-theme] 双方案。
   本块放在 [data-theme="light"] 之后，同优先级下后者胜出——这正是我们要的覆盖顺序。 */
@supports (color: light-dark(#000, #fff)) {
  :root {
    color-scheme: light dark;
    --bg: light-dark(#f5f6fa, #0f1117);
    --bg-card: light-dark(#ffffff, #1a1d27);
    --bg-card-hover: light-dark(#f0f1f5, #222633);
    --border: light-dark(#e2e4ea, #2a2e3a);
    --text: light-dark(#1a1d27, #e4e6eb);
    --text-dim: light-dark(#6b7080, #8b8fa3);
    --accent-light: light-dark(#5a4bd1, #a29bfe);
    --green: light-dark(#00a884, #00b894);
    --red: light-dark(#d63031, #e17055);
    --orange: light-dark(#e17055, #fdcb6e);
    --blue: light-dark(#0984e3, #74b9ff);
    --header-from: light-dark(#ffffff, #1a1d27);
    --header-to: light-dark(#f0ecff, #2d1f4e);
    --link-bg: light-dark(rgba(108,92,231,.1), rgba(108,92,231,.12));
    --accent-soft: light-dark(rgba(108,92,231,.1), rgba(108,92,231,.15));
    --green-soft: light-dark(rgba(0,168,132,.12), rgba(0,184,148,.15));
    --blue-soft: light-dark(rgba(9,132,227,.12), rgba(116,185,255,.15));
    --red-soft: light-dark(rgba(214,48,49,.1), rgba(225,112,85,.15));
    --red-soft-border: light-dark(rgba(214,48,49,.25), rgba(225,112,85,.3));
    --red-soft-hover: light-dark(rgba(214,48,49,.18), rgba(225,112,85,.25));
    --dim-soft: light-dark(rgba(107,112,128,.12), rgba(139,143,163,.15));
    --shadow-sm: 0 1px 2px light-dark(rgba(0,0,0,.06), rgba(0,0,0,.3));
    --shadow-md: 0 4px 12px light-dark(rgba(0,0,0,.08), rgba(0,0,0,.4));
  }
  /* light-dark() 按 color-scheme 取值，此时 data-theme 只用来驱动 color-scheme。
     显式声明三态，保证 auto 跟随系统、dark/light 强制覆盖。 */
  html[data-theme="light"] { color-scheme: light; }
  html[data-theme="dark"]  { color-scheme: dark; }
}
* { margin:0; padding:0; box-sizing:border-box; }
/* 无障碍：键盘焦点可见（此前完全没有 focus 样式，Tab 导航无指示） */
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-sm); }
/* 尊重系统「减少动态效果」偏好 */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Noto Sans SC', sans-serif;
  background: var(--bg); color: var(--text); min-height: 100vh; line-height: 1.6;
}
a { color: var(--accent-light); text-decoration: none; }
a:hover { text-decoration: underline; }
.header {
  background: linear-gradient(135deg, var(--header-from) 0%, var(--header-to) 100%);
  border-bottom: 1px solid var(--border); padding: 24px 32px;
  display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;
}
.header h1 { font-size: 24px; font-weight: 700; }
.header h1 span { color: var(--accent-light); }
.header-meta { color: var(--text-dim); font-size: 13px; }
.header-actions { display: flex; gap: 8px; align-items: center; }
.github-link { display: flex; align-items: center; color: var(--text-dim); transition: color .2s; border-radius: 8px; padding: 6px; }
.github-link:hover { color: var(--text); text-decoration: none; }
.stats-bar {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px; padding: 24px 32px;
}
.stat-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 20px; text-align: center;
  box-shadow: var(--shadow-sm); transition: box-shadow var(--dur) var(--ease), transform var(--dur) var(--ease);
}
.stat-card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }
.stat-card .num {
  font-size: 32px; font-weight: 800; line-height: 1.2;
  background: linear-gradient(135deg, var(--accent), var(--blue));
  -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: var(--accent);
}
/* 加载中显示的是「-」占位：渐变裁切在单字符上几乎没有可着色像素，会近乎不可见。
   占位符改用纯色，只有真实数字才走渐变。 */
.stat-card .num.placeholder {
  background: none; -webkit-text-fill-color: var(--text-dim); color: var(--text-dim);
}
.stat-card .label { color: var(--text-dim); font-size: 13px; margin-top: 4px; }
.main {
  padding: 0 32px 48px; display: grid;
  grid-template-columns: 1fr 1fr; gap: 24px;
}
/* 检测项目横跨整行，其下「最近更新 + 趋势图」两列并排 */
.section-full { grid-column: 1 / -1; }
/* 检测项目：卡片网格内的单个项。横向布局下不再用底边框分隔，
   改为各自成卡片、靠 gap 分隔。 */
#projects .project-item {
  flex-direction: column; align-items: flex-start; text-align: left;
  border-bottom: none; border: 1px solid var(--border); border-radius: var(--radius-md);
  padding: 14px 16px; gap: 2px;
}
#projects .project-item:last-child { border-bottom: 1px solid var(--border); }
#projects .project-icon { font-size: 24px; margin-right: 0; margin-bottom: 4px; }
#projects .project-meta { text-align: left; margin-left: 0; margin-top: 8px; display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
#projects .project-info { width: 100%; }
#projects .project-time { margin-top: 0; }
/* 项目列表网格：auto-fill 让宽屏一行多列、窄屏自动折行 */
#projects { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; padding: 16px; }
@media (max-width: 900px) { .main { grid-template-columns: 1fr; } }
/* 窄屏：32px 侧边距在手机上浪费横向空间，收紧内边距并缩小标题 */
@media (max-width: 600px) {
  .header { padding: 16px; }
  .header h1 { font-size: 20px; }
  .stats-bar { padding: 16px; gap: 12px; grid-template-columns: repeat(2, 1fr); }
  .main { padding: 0 16px 32px; }
  .stat-card .num { font-size: 26px; }
  .stat-card { padding: 14px; }
  /* 单列，项目卡片占满宽度（220px 下限在窄屏仍会留空） */
  #projects { grid-template-columns: 1fr; padding: 12px; gap: 10px; }
  .section-head { padding: 12px 14px; font-size: 14px; }
  .filter-bar { padding: 10px 14px; }
  .tl-item { padding: 10px 14px; gap: 10px; }
  .project-item { padding: 12px 14px; }
  /* 分页条在窄屏会换行，收紧间距与字号 */
  .pager { padding: 10px 6px; gap: 3px; }
  .pager-btn { min-width: 26px; height: 26px; padding: 0 6px; font-size: 12px; }
  .pager-info { width: 100%; text-align: center; margin: 4px 0 0; }
  .trend-chart { padding: 12px; }
  .trend-chart svg { height: 100px; }
  .trend-legend { gap: 10px; font-size: 10px; }
}
.section {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
}
.section-head {
  padding: 16px 20px; border-bottom: 1px solid var(--border);
  font-weight: 600; font-size: 15px;
  display: flex; align-items: center; gap: 8px;
}
.section-head .badge {
  background: var(--accent); color: #fff; font-size: 11px;
  padding: 2px 8px; border-radius: 10px; font-weight: 500;
}
.section-body { padding: 0; }
/* #projects 既是 section-body 又是网格容器，覆盖上面的 padding:0 */
#projects { padding: 16px; }
.project-item {
  display: flex; align-items: center; padding: 14px 20px;
  border-bottom: 1px solid var(--border); transition: background .15s; cursor: default;
}
.project-item:last-child { border-bottom: none; }
.project-item:hover { background: var(--bg-card-hover); }
.project-icon { font-size: 28px; margin-right: 14px; flex-shrink: 0; }
.project-info { flex: 1; min-width: 0; }
.project-name { font-weight: 600; font-size: 14px; }
.project-type { color: var(--text-dim); font-size: 12px; margin-top: 2px; }
.project-meta { text-align: right; flex-shrink: 0; margin-left: 12px; }
.project-count { font-size: 18px; font-weight: 700; color: var(--accent-light); }
.project-time { font-size: 11px; color: var(--text-dim); margin-top: 2px; }
.health-bar { width: 60px; height: 4px; background: var(--border); border-radius: 2px; margin-top: 4px; overflow: hidden; }
.health-fill { height: 100%; border-radius: 2px; transition: width .3s; }
.tl-item {
  display: flex; padding: 12px 20px; border-bottom: 1px solid var(--border);
  transition: background .15s; gap: 12px;
}
.tl-item:last-child { border-bottom: none; }
.tl-item:hover { background: var(--bg-card-hover); }
.tl-dot { width: 10px; height: 10px; border-radius: 50%; margin-top: 7px; flex-shrink: 0; background: var(--text-dim); }
.tl-dot.ok { background: var(--green); }
.tl-dot.changed { background: var(--blue); }
.tl-dot.error { background: var(--red); }
.tl-dot.warning { background: var(--orange); }
.tl-body { flex: 1; min-width: 0; }
.tl-title { font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.tl-link {
  font-size: 11px; font-weight: 400; color: var(--accent-light);
  background: var(--link-bg); padding: 1px 7px; border-radius: 5px; white-space: nowrap;
}
.tl-link:hover { text-decoration: underline; }
.tl-sub {
  font-size: 12px; color: var(--text-dim); margin-top: 2px;
  display: flex; gap: 12px; flex-wrap: wrap;
}
.tl-sub .proj-tag {
  background: var(--accent-soft); color: var(--accent-light);
  padding: 1px 8px; border-radius: 6px; font-size: 11px;
}
.tl-time { font-size: 11px; color: var(--text-dim); white-space: nowrap; margin-top: 3px; flex-shrink: 0; }
.tl-body-text {
  font-size: 12px; color: var(--text-dim); margin-top: 4px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.empty { padding: 48px 20px; text-align: center; color: var(--text-dim); }
.empty .icon { font-size: 40px; margin-bottom: 12px; }
.error-state { padding: 32px 20px; text-align: center; color: var(--red); }
.error-state .icon { font-size: 36px; margin-bottom: 8px; }
.error-state .msg { color: var(--text-dim); font-size: 13px; margin-top: 4px; }
.error-state .retry-btn {
  margin-top: 12px; background: var(--red-soft); border: 1px solid var(--red-soft-border);
  color: var(--red); padding: 6px 20px; border-radius: 8px; cursor: pointer; font-size: 13px;
}
.error-state .retry-btn:hover { background: var(--red-soft-hover); }
.status-badge {
  display: inline-block; font-size: 11px; padding: 1px 8px;
  border-radius: 6px; font-weight: 500; background: var(--dim-soft); color: var(--text-dim);
}
.status-badge.ok { background: var(--green-soft); color: var(--green); }
.status-badge.changed { background: var(--blue-soft); color: var(--blue); }
.status-badge.error { background: var(--red-soft); color: var(--red); }
.status-badge.warning { background: var(--red-soft); color: var(--orange); }
.filter-bar { padding: 12px 20px; display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
.filter-btn {
  background: none; border: 1px solid var(--border); color: var(--text-dim);
  padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all .15s;
}
.filter-btn:hover, .filter-btn.active { border-color: var(--accent); color: var(--accent-light); background: var(--link-bg); }
/* 分页条 */
.pager {
  display: flex; align-items: center; justify-content: center; flex-wrap: wrap;
  gap: 4px; padding: 12px; border-top: 1px solid var(--border);
}
.pager-btn {
  min-width: 30px; height: 30px; padding: 0 8px;
  background: none; border: 1px solid var(--border); border-radius: var(--radius-sm);
  color: var(--text-dim); font-size: 13px; cursor: pointer;
  transition: background var(--dur) var(--ease), border-color var(--dur) var(--ease), color var(--dur) var(--ease);
}
.pager-btn:hover:not(:disabled):not(.active) { border-color: var(--accent); color: var(--accent-light); }
.pager-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; cursor: default; font-weight: 600; }
.pager-btn:disabled { opacity: .4; cursor: not-allowed; }
.pager-gap { padding: 0 4px; color: var(--text-dim); font-size: 13px; }
.pager-info { margin-left: 8px; color: var(--text-dim); font-size: 12px; }
.refresh-btn, .theme-btn {
  background: none; border: 1px solid var(--border); color: var(--text-dim);
  padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 13px;
  transition: all .2s; white-space: nowrap;
}
.refresh-btn:hover, .theme-btn:hover { border-color: var(--accent); color: var(--accent-light); }
.loading { text-align: center; padding: 60px 20px; color: var(--text-dim); }
.spinner {
  width: 32px; height: 32px; border: 3px solid var(--border); border-top-color: var(--accent);
  border-radius: 50%; animation: spin .8s linear infinite; margin: 0 auto 16px;
}
@keyframes spin { to { transform: rotate(360deg); } }
.footer {
  text-align: center; padding: 24px; color: var(--text-dim);
  font-size: 12px; border-top: 1px solid var(--border);
}
/* 趋势图 */
.trend-chart { padding: 20px; }
.trend-chart svg { width: 100%; height: 120px; }
.trend-legend { display: flex; gap: 16px; justify-content: center; margin-top: 8px; font-size: 11px; color: var(--text-dim); }
.trend-legend span { display: flex; align-items: center; gap: 4px; }
.trend-legend .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
</style>
</head>
<body>

<div class="header">
  <div>
    <h1>📡 <span>Update Hub</span></h1>
    <div class="header-meta">通用更新同步平台 · 基于 Cloudflare Workers + D1</div>
  </div>
  <div class="header-actions">
    <a href="https://github.com/xinming7/update-hub" target="_blank" rel="noopener" class="github-link" title="GitHub 仓库">
      <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
    </a>
    <button class="refresh-btn" onclick="loadData()">🔄 刷新</button>
    <button class="theme-btn" id="theme-btn" onclick="cycleTheme()">🌗 主题</button>
  </div>
</div>

<div class="stats-bar" id="stats">
  <div class="stat-card"><div class="num placeholder" id="s-projects">-</div><div class="label">检测项目</div></div>
  <div class="stat-card"><div class="num placeholder" id="s-updates">-</div><div class="label">更新记录</div></div>
  <div class="stat-card"><div class="num placeholder" id="s-changes">-</div><div class="label">变更发现</div></div>
  <div class="stat-card"><div class="num placeholder" id="s-errors">-</div><div class="label">异常告警</div></div>
</div>

<div class="main">
  <div class="section section-full">
    <div class="section-head">📦 检测项目 <span class="badge" id="proj-count">0</span></div>
    <div class="section-body" id="projects">
      <div class="loading"><div class="spinner"></div>加载中...</div>
    </div>
  </div>
  <div class="section">
    <div class="section-head">🕐 最近更新 <span class="badge" id="upd-count">0</span></div>
    <div class="filter-bar" id="filter-bar">
      <button class="filter-btn active" onclick="setFilter('all')">全部</button>
      <button class="filter-btn" onclick="setFilter('changed')">🔵 变更</button>
      <button class="filter-btn" onclick="setFilter('ok')">🟢 正常</button>
      <button class="filter-btn" onclick="setFilter('error')">🔴 异常</button>
      <button class="filter-btn" onclick="setFilter('warning')">🟡 警告</button>
    </div>
    <div class="section-body" id="timeline-wrap">
      <div class="timeline" id="timeline">
        <div class="loading"><div class="spinner"></div>加载中...</div>
      </div>
    </div>
  </div>
  <div class="section">
    <div class="section-head">📊 30 天更新趋势</div>
    <div class="section-body">
      <div class="trend-chart" id="trend-chart">
        <div class="loading"><div class="spinner"></div>加载中...</div>
      </div>
    </div>
  </div>
</div>

<div class="footer">
  Update Hub &copy; 2026 · Powered by Cloudflare Workers ·
  <a href="/api/health" target="_blank">API 健康检查</a> ·
  <a href="/api/feed" target="_blank">RSS Feed</a>
</div>

<script>
/* ── 主题切换 ── */
const THEMES = ['auto', 'dark', 'light'];
const THEME_ICONS = { auto: '🌗', dark: '🌙', light: '☀️' };
const THEME_LABELS = { auto: '自动', dark: '深色', light: '浅色' };
function getTheme() { return localStorage.getItem('uh-theme') || 'auto'; }
function applyTheme(mode) {
  const html = document.documentElement;
  // 支持 light-dark() 的浏览器：data-theme 只需声明 color-scheme，取值由浏览器决定。
  // 不支持的浏览器仍然依赖 [data-theme="light"] 那套硬编码令牌，故 auto 仍要探测系统偏好。
  const supportsLD = window.CSS && CSS.supports('color', 'light-dark(#000, #fff)');
  if (mode === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', supportsLD ? 'auto' : (prefersDark ? '' : 'light'));
  } else {
    html.setAttribute('data-theme', supportsLD ? mode : (mode === 'light' ? 'light' : ''));
  }
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = THEME_ICONS[mode] + ' ' + THEME_LABELS[mode];
}
function cycleTheme() {
  const cur = getTheme();
  const next = THEMES[(THEMES.indexOf(cur) + 1) % THEMES.length];
  localStorage.setItem('uh-theme', next);
  applyTheme(next);
}
applyTheme(getTheme());
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getTheme() === 'auto') applyTheme('auto');
});

/* ── 数据 ── */
let allUpdates = [];
let currentFilter = 'all';
const PAGE_SIZE = 20;
let currentPage = 1;

function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.textContent.includes(f === 'all' ? '全部' : f === 'changed' ? '变更' : f === 'ok' ? '正常' : f === 'error' ? '异常' : '警告'));
  });
  currentPage = 1;   // 换筛选条件回到第一页
  renderTimeline();
}

async function loadData() {
  const projEl = document.getElementById('projects');
  const tlEl = document.getElementById('timeline');
  try {
    const [overviewRes, trendsRes] = await Promise.all([
      apiFetch('/api/public/overview'),
      apiFetch('/api/public/trends')
    ]);
    if (overviewRes.status === 401) { askKey('此仪表盘受密码保护，请输入访问密码'); return; }
    if (!overviewRes.ok) throw new Error('HTTP ' + overviewRes.status);
    const data = await overviewRes.json();
    renderStats(data);
    renderProjects(data.projects);
    allUpdates = data.recent_updates || [];
    currentPage = 1;
    renderTimeline();
    if (trendsRes.ok) {
      const trends = await trendsRes.json();
      renderTrends(trends.daily || []);
    }
  } catch (e) {
    console.error('加载失败:', e);
    projEl.innerHTML = '<div class="error-state"><div class="icon">⚠️</div><div>加载失败</div><div class="msg">' + escapeHtml(e.message || '网络错误') + '</div><button class="retry-btn" onclick="loadData()">重试</button></div>';
    tlEl.innerHTML = projEl.innerHTML;
  }
}

function renderStats(data) {
  const p = data.projects || [];
  const u = data.recent_updates || [];
  const setNum = (id, v) => {
    const el = document.getElementById(id);
    el.textContent = v; el.classList.remove('placeholder');
  };
  setNum('s-projects', p.length);
  setNum('s-updates', u.length);
  setNum('s-changes', u.filter(i => i.status === 'changed').length);
  setNum('s-errors', u.filter(i => i.status === 'error' || i.status === 'warning').length);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  // D1 的 datetime('now') 产出 "YYYY-MM-DD HH:MM:SS"（空格分隔、无时区标记），
  // 直接 new Date() 在部分引擎上会被当作本地时间，故补 'Z' 视为 UTC。
  // 但若传入的已是 ISO 串（带 T 或已有 Z，例如经 API 上报写入），补 'Z' 会得到
  // Invalid Date → 显示 "NaN 天前"。这里只在确实缺少时区信息时才补。
  const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(dateStr);
  const iso = hasTz ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';   // 无法解析就不显示相对时间，而不是显示 NaN
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  const d = Math.floor(h / 24);
  return d + ' 天前';
}

function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

/* 仅允许 http/https 链接，阻断 javascript:/data: 协议 */
function safeUrl(u) {
  if (!u) return '';
  try {
    const x = new URL(String(u), location.origin);
    return (x.protocol === 'http:' || x.protocol === 'https:') ? x.href : '';
  } catch (e) { return ''; }
}

/* 访问密码：优先取 URL ?key=，否则用 sessionStorage */
function getKey() {
  // 优先取 URL ?key=（兼容分享链接），取到后立即从地址栏抹掉，
  // 后续请求统一走 Authorization header，避免凭据进浏览器历史 / Referer
  const u = new URL(location.href);
  const q = u.searchParams.get('key') || u.searchParams.get('token');
  if (q) {
    try { sessionStorage.setItem('uh-key', q); } catch (e) {}
    u.searchParams.delete('key');
    u.searchParams.delete('token');
    history.replaceState(null, '', u.toString());
    return q;
  }
  try { return sessionStorage.getItem('uh-key') || ''; } catch (e) { return ''; }
}
function apiFetch(path) {
  const key = getKey();
  return fetch(path, key ? { headers: { 'Authorization': 'Bearer ' + key } } : {});
}
function submitKey(e) {
  e.preventDefault();
  const input = document.getElementById('key-input');
  const v = input ? input.value.trim() : '';
  if (v) { try { sessionStorage.setItem('uh-key', v); } catch (err) {} loadData(); }
  return false;
}
function askKey(message) {
  const html = '<div class="empty"><div class="icon">🔒</div><div>' + escapeHtml(message || '此仪表盘受密码保护') + '</div>' +
    '<form onsubmit="return submitKey(event)" style="margin-top:12px">' +
    '<input id="key-input" type="password" placeholder="访问密码" style="padding:8px 12px;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text)"> ' +
    '<button class="retry-btn" type="submit" style="margin-left:8px">进入</button></form></div>';
  document.getElementById('projects').innerHTML = html;
  document.getElementById('timeline').innerHTML = html;
  const input = document.getElementById('key-input');
  if (input) input.focus();
}

function healthColor(score) {
  if (score >= 80) return 'var(--green)';
  if (score >= 50) return 'var(--orange)';
  return 'var(--red)';
}

function renderProjects(projects) {
  document.getElementById('proj-count').textContent = projects.length;
  if (!projects.length) {
    document.getElementById('projects').innerHTML = '<div class="empty"><div class="icon">📭</div>暂无检测项目<br><small>通过 API 注册你的第一个项目</small></div>';
    return;
  }
  document.getElementById('projects').innerHTML = projects.map(p => {
    const score = p.health_score != null ? Math.round(p.health_score) : '-';
    return \`
    <div class="project-item">
      <div class="project-icon">\${escapeHtml(p.icon || '📡')}</div>
      <div class="project-info">
        <div class="project-name">\${escapeHtml(p.label || p.name)}</div>
        <div class="project-type">\${escapeHtml(p.name)} · \${escapeHtml(p.type)}</div>
        <div class="health-bar"><div class="health-fill" style="width:\${score}%;background:\${healthColor(score)}"></div></div>
      </div>
      <div class="project-meta">
        <div class="project-count">\${p.update_count || 0}</div>
        <div class="project-time">\${timeAgo(p.last_update)}</div>
        <div class="project-time" style="color:\${healthColor(score)}">\${score}</div>
      </div>
    </div>\`;
  }).join('');
}

function renderTimeline() {
  const filtered = currentFilter === 'all' ? allUpdates : allUpdates.filter(u => u.status === currentFilter);
  document.getElementById('upd-count').textContent = filtered.length;
  const tlEl = document.getElementById('timeline');
  const wrapEl = document.getElementById('timeline-wrap');

  if (!filtered.length) {
    tlEl.innerHTML = '<div class="empty"><div class="icon">📭</div>暂无更新记录</div>';
    const oldPager = wrapEl.querySelector('.pager');
    if (oldPager) oldPager.remove();
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // 筛选或数据刷新后当前页可能越界，夹回有效范围
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  tlEl.innerHTML = visible.map(u => {
    const safeLink = safeUrl(u.diff_url);
    const linkHtml = safeLink ? '<a class="tl-link" href="' + escapeHtml(safeLink) + '" target="_blank" rel="noopener">🔗 查看</a>' : '';
    return \`
    <div class="tl-item">
      <div class="tl-dot \${u.status}"></div>
      <div class="tl-body">
        <div class="tl-title">\${escapeHtml(u.title || u.version || '(无标题)')} \${linkHtml}</div>
        <div class="tl-sub">
          <span class="proj-tag">\${escapeHtml(u.project_icon || '📡')} \${escapeHtml(u.project_label || u.project_name)}</span>
          <span class="status-badge \${u.status}">\${u.status}</span>
          \${u.version ? '<span>' + escapeHtml(u.version.startsWith('v') ? u.version : 'v' + u.version) + '</span>' : ''}
        </div>
        \${u.body ? '<div class="tl-body-text">' + escapeHtml(u.body) + '</div>' : ''}
      </div>
      <div class="tl-time">\${timeAgo(u.created_at)}</div>
    </div>\`;
  }).join('');

  const oldBtn = wrapEl.querySelector('.pager');
  if (oldBtn) oldBtn.remove();
  if (totalPages > 1) wrapEl.appendChild(buildPager(totalPages));
}

/* 页码分页条：首页/上页、带省略号的页码、下页/末页。
   页数多时只渲染当前页附近的窗口，避免按钮铺满整行。 */
function buildPager(totalPages) {
  const nav = document.createElement('nav');
  nav.className = 'pager';

  const go = p => { currentPage = p; renderTimeline(); };

  const addBtn = (label, page, opts = {}) => {
    const b = document.createElement('button');
    b.className = 'pager-btn' + (opts.active ? ' active' : '');
    b.textContent = label;
    b.disabled = !!opts.disabled;
    if (opts.title) b.title = opts.title;
    if (!opts.disabled && !opts.active) b.onclick = () => go(page);
    nav.appendChild(b);
  };

  addBtn('‹', currentPage - 1, { disabled: currentPage === 1, title: '上一页' });

  // 页码窗口：首尾各保留一页，中间超过 1 页的间隔用省略号
  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const list = [...pages].filter(p => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  let prev = 0;
  for (const p of list) {
    if (prev && p - prev > 1) {
      const span = document.createElement('span');
      span.className = 'pager-gap';
      span.textContent = '…';
      nav.appendChild(span);
    }
    addBtn(String(p), p, { active: p === currentPage });
    prev = p;
  }

  addBtn('›', currentPage + 1, { disabled: currentPage === totalPages, title: '下一页' });

  const info = document.createElement('span');
  info.className = 'pager-info';
  info.textContent = '第 ' + currentPage + ' / ' + totalPages + ' 页';
  nav.appendChild(info);

  return nav;
}

/* ── 30 天趋势图（SVG 柱状图）── */
function renderTrends(daily) {
  const el = document.getElementById('trend-chart');
  if (!daily.length) { el.innerHTML = '<div class="empty">暂无趋势数据</div>'; return; }

  // 按天聚合
  const days = {};
  for (const r of daily) {
    if (!days[r.day]) days[r.day] = { ok: 0, changed: 0, error: 0, warning: 0 };
    days[r.day][r.status] = (days[r.day][r.status] || 0) + r.cnt;
  }

  const sortedDays = Object.keys(days).sort();
  const last14 = sortedDays.slice(-14);
  const maxVal = Math.max(1, ...last14.map(d => {
    const v = days[d];
    return (v.ok||0) + (v.changed||0) + (v.error||0) + (v.warning||0);
  }));

  const W = 600, H = 120, PAD = 30, GAP = 4;
  const barW = Math.max(8, (W - PAD * 2) / last14.length - GAP);
  // 走 CSS 变量，随主题自动切换（此前硬编码十六进制，浅色下对比度不足）
  const colors = { ok: 'var(--green)', changed: 'var(--blue)', error: 'var(--red)', warning: 'var(--orange)' };

  let bars = '';
  last14.forEach((day, i) => {
    const v = days[day];
    const total = (v.ok||0) + (v.changed||0) + (v.error||0) + (v.warning||0);
    const x = PAD + i * (barW + GAP);
    let y = H - 10;
    for (const s of ['ok', 'changed', 'warning', 'error']) {
      const cnt = v[s] || 0;
      if (!cnt) continue;
      const h = (cnt / maxVal) * (H - 30);
      y -= h;
      bars += \`<rect x="\${x}" y="\${y}" width="\${barW}" height="\${h}" fill="\${colors[s]}" rx="2"><title>\${day}: \${cnt} \${s}</title></rect>\`;
    }
    if (i % Math.ceil(last14.length / 7) === 0) {
      bars += \`<text x="\${x + barW/2}" y="\${H}" text-anchor="middle" fill="var(--text-dim)" font-size="9">\${day.slice(5)}</text>\`;
    }
  });

  el.innerHTML = \`
    <svg viewBox="0 0 \${W} \${H + 10}" preserveAspectRatio="xMidYMid meet">\${bars}</svg>
    <div class="trend-legend">
      <span><span class="dot" style="background:var(--green)"></span>正常</span>
      <span><span class="dot" style="background:var(--blue)"></span>变更</span>
      <span><span class="dot" style="background:var(--orange)"></span>警告</span>
      <span><span class="dot" style="background:var(--red)"></span>异常</span>
    </div>\`;
}

loadData();
setInterval(function () { if (!document.hidden) loadData(); }, 60000);
</script>
</body>
</html>`;
}
