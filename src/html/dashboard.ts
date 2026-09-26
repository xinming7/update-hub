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
}
* { margin:0; padding:0; box-sizing:border-box; }
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
.stats-bar {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px; padding: 24px 32px;
}
.stat-card {
  background: var(--bg-card); border: 1px solid var(--border);
  border-radius: var(--radius); padding: 20px; text-align: center;
}
.stat-card .num {
  font-size: 32px; font-weight: 800;
  background: linear-gradient(135deg, var(--accent), var(--blue));
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
}
.stat-card .label { color: var(--text-dim); font-size: 13px; margin-top: 4px; }
.main {
  padding: 0 32px 48px; display: grid;
  grid-template-columns: 1fr 1fr; gap: 24px;
}
@media (max-width: 900px) { .main { grid-template-columns: 1fr; } }
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
  background: rgba(108,92,231,.15); color: var(--accent-light);
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
  margin-top: 12px; background: rgba(225,112,85,.15); border: 1px solid rgba(225,112,85,.3);
  color: var(--red); padding: 6px 20px; border-radius: 8px; cursor: pointer; font-size: 13px;
}
.error-state .retry-btn:hover { background: rgba(225,112,85,.25); }
.status-badge {
  display: inline-block; font-size: 11px; padding: 1px 8px;
  border-radius: 6px; font-weight: 500; background: rgba(139,143,163,.15); color: var(--text-dim);
}
.status-badge.ok { background: rgba(0,184,148,.15); color: var(--green); }
.status-badge.changed { background: rgba(116,185,255,.15); color: var(--blue); }
.status-badge.error { background: rgba(225,112,85,.15); color: var(--red); }
.status-badge.warning { background: rgba(253,203,110,.15); color: var(--orange); }
.filter-bar { padding: 12px 20px; display: flex; gap: 8px; flex-wrap: wrap; border-bottom: 1px solid var(--border); }
.filter-btn {
  background: none; border: 1px solid var(--border); color: var(--text-dim);
  padding: 4px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all .15s;
}
.filter-btn:hover, .filter-btn.active { border-color: var(--accent); color: var(--accent-light); background: var(--link-bg); }
.load-more {
  display: block; width: 100%; padding: 14px; background: none; border: none;
  border-top: 1px solid var(--border); color: var(--accent-light); font-size: 13px;
  cursor: pointer; transition: background .15s;
}
.load-more:hover { background: var(--bg-card-hover); }
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
    <button class="refresh-btn" onclick="loadData()">🔄 刷新</button>
    <button class="theme-btn" id="theme-btn" onclick="cycleTheme()">🌗 主题</button>
  </div>
</div>

<div class="stats-bar" id="stats">
  <div class="stat-card"><div class="num" id="s-projects">-</div><div class="label">检测项目</div></div>
  <div class="stat-card"><div class="num" id="s-updates">-</div><div class="label">更新记录</div></div>
  <div class="stat-card"><div class="num" id="s-changes">-</div><div class="label">变更发现</div></div>
  <div class="stat-card"><div class="num" id="s-errors">-</div><div class="label">异常告警</div></div>
</div>

<div class="main">
  <div class="section" style="grid-column:1">
    <div class="section-head">📦 检测项目 <span class="badge" id="proj-count">0</span></div>
    <div class="section-body" id="projects">
      <div class="loading"><div class="spinner"></div>加载中...</div>
    </div>
  </div>
  <div class="section" style="grid-column:2">
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
</div>

<div class="section" style="margin:0 32px 24px">
  <div class="section-head">📊 30 天更新趋势</div>
  <div class="section-body">
    <div class="trend-chart" id="trend-chart">
      <div class="loading"><div class="spinner"></div>加载中...</div>
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
  if (mode === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', prefersDark ? '' : 'light');
  } else {
    html.setAttribute('data-theme', mode === 'light' ? 'light' : '');
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
let displayLimit = 50;
let currentFilter = 'all';

function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.textContent.includes(f === 'all' ? '全部' : f === 'changed' ? '变更' : f === 'ok' ? '正常' : f === 'error' ? '异常' : '警告'));
  });
  displayLimit = 50;
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
    displayLimit = 50;
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
  document.getElementById('s-projects').textContent = p.length;
  document.getElementById('s-updates').textContent = u.length;
  document.getElementById('s-changes').textContent = u.filter(i => i.status === 'changed').length;
  document.getElementById('s-errors').textContent = u.filter(i => i.status === 'error' || i.status === 'warning').length;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
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
  const q = new URLSearchParams(location.search).get('key');
  if (q) { try { sessionStorage.setItem('uh-key', q); } catch (e) {} return q; }
  try { return sessionStorage.getItem('uh-key') || ''; } catch (e) { return ''; }
}
function apiFetch(path) {
  const key = getKey();
  const url = key ? path + (path.indexOf('?') >= 0 ? '&' : '?') + 'key=' + encodeURIComponent(key) : path;
  return fetch(url);
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
    const oldBtn = wrapEl.querySelector('.load-more');
    if (oldBtn) oldBtn.remove();
    return;
  }

  const visible = filtered.slice(0, displayLimit);
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

  const oldBtn = wrapEl.querySelector('.load-more');
  if (oldBtn) oldBtn.remove();
  if (filtered.length > displayLimit) {
    const btn = document.createElement('button');
    btn.className = 'load-more';
    btn.textContent = '加载更多 (' + (filtered.length - displayLimit) + ' 条剩余)';
    btn.onclick = () => { displayLimit += 50; renderTimeline(); };
    wrapEl.appendChild(btn);
  }
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
  const colors = { ok: '#00b894', changed: '#74b9ff', error: '#e17055', warning: '#fdcb6e' };

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
      <span><span class="dot" style="background:#00b894"></span>正常</span>
      <span><span class="dot" style="background:#74b9ff"></span>变更</span>
      <span><span class="dot" style="background:#fdcb6e"></span>警告</span>
      <span><span class="dot" style="background:#e17055"></span>异常</span>
    </div>\`;
}

loadData();
setInterval(function () { if (!document.hidden) loadData(); }, 60000);
</script>
</body>
</html>`;
}
