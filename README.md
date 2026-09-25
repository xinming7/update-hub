# Update Hub

通用更新同步平台，基于 Cloudflare Workers + D1 + Hono，用于接收各类检测项目的更新结果并在仪表盘展示。

## 架构

```
检测项目 (cron/脚本)
    │
    ▼  POST /api/projects/{name}/updates
┌──────────────────────────┐
│   Cloudflare Worker      │
│   ┌────────┐  ┌───────┐  │
│   │ Hono   │  │  D1   │  │    ┌──────────────┐
│   │ API    ├──┤ DB    │  │◄───│  浏览器仪表盘 │
│   └────────┘  └───────┘  │    └──────────────┘
└──────────────────────────┘
```

## 支持的检测类型

| 类型 | 说明 | 示例 |
|------|------|------|
| `generic` | 通用检测 | 自定义脚本 |
| `version` | 版本更新 | GitHub release、npm 包、iOS 系统 |
| `content` | 内容变更 | 网页监控、RSS diff |
| `status` | 服务状态 | API 健康检查、可用性监控 |

## 快速开始

### 1. 创建 D1 数据库

```bash
wrangler d1 create update-hub-db     # 记下输出的 database_id
```

把 `database_id` 填入 `wrangler.toml`（公开仓库建议用占位符，真实值放本地/私有配置）。

### 2. 初始化数据库

```bash
npm install

# 全新数据库
npm run db:init          # 本地
npm run db:init:remote   # 远程

# 从旧版本升级（保留已有数据与 Token，自动转哈希存储）
npm run db:migrate:remote

# 导入示例数据（可选，不含任何 Token）
npm run db:seed:remote
```

> **重要**：`schema.sql` 必须与代码同步使用。若从旧版本升级，务必执行
> `migrations/001_schema_sync.sql`（`npm run db:migrate:remote`），否则上报接口会因缺列/缺表报 500。

### 3. 本地开发

```bash
# 本地密钥写入 .dev.vars（已在 .gitignore）
cat > .dev.vars <<'EOF'
API_TOKEN=uh_local_dev_token
EOF

npm run dev
```

访问 `http://localhost:8787` 查看仪表盘。

### 4. 部署

```bash
npm run deploy

# 主 Token（推荐用 secret，不要写进 wrangler.toml）
wrangler secret put API_TOKEN
# 仪表盘密码（可选）
wrangler secret put DASHBOARD_PASSWORD
```

可选变量（`wrangler.toml` 的 `[vars]`）：

| 变量 | 说明 |
|------|------|
| `CORS_ORIGIN` | 额外允许的跨域来源，逗号分隔（默认只允许同源） |
| `PUBLIC_URL` | 邮件退订链接用的对外地址 |

### 5. 定时任务

`wrangler.toml` 里配置了 cron（每天 03:00 UTC）自动刷新健康度、清理过期日志与去重键。
不需要可在部署时去掉 `[triggers]` 段。

## 安全设计

- **Token 只存 SHA-256 哈希**，明文仅在创建时返回一次；旧版明文 Token 在首次使用时自动升级为哈希。
- **权限分级** `read` / `write` / `admin`：读接口要求 `read`，写接口要求 `write`，
  只有 `admin` Token 才能签发含 `admin` 权限的 Token（防自我提权）。
- **仪表盘密码**（`DASHBOARD_PASSWORD`）只读权限，通过 `?key=*** 或 Bearer 提供。
- **XSS 防护**：前端统一转义；`icon` 限制字符集；`diff_url` 仅允许 `http/https`。
- **Webhook 防 SSRF**：仅允许 http/https 公网地址，拒绝回环/内网/链路本地地址，5 秒超时，
  签名头为 `X-Hub-Signature-256`（HMAC-SHA256）。
- **邮件防护**：收发件人严格校验并剔除 CR/LF（防头注入），DATA 自动 dot-stuffing，
  服务器不支持 STARTTLS 时拒绝发送（不落明文口令）。
- **RSS/公开接口**同样需要凭据（`?key=*** 或 `?token=`），避免"设了密码但 feed 公开"的绕过。

## API 文档

### 鉴权

除 `/api/health`、`/api/unsubscribe` 外的所有接口都需要凭据：

```
Authorization: Bearer <token>
```

RSS / 汇总等不便设置 Header 的场景可用查询参数：`?key=*** 或 `?token=<token>`。

权限：`read`（读）、`write`（写）、`admin`（全部 + 签发 Token）。

### 项目

```bash
# 注册项目（name 仅允许字母/数字/._-，1~64 字符）
curl -X POST https://<your-worker>/api/projects \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-scraper","label":"网页价格监控","type":"content","icon":"💰"}'

# 编辑项目（label / type / icon / config）
curl -X PATCH https://<your-worker>/api/projects/1 \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"label":"新名称","icon":"🔥"}'

# 删除项目（事务内清理更新记录、订阅、标签关联）
curl -X DELETE https://<your-worker>/api/projects/1 \
  -H "Authorization: Bearer ***"
```

### 上报更新

```bash
curl -X POST https://<your-worker>/api/projects/my-scraper/updates \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "2.1.0",
    "title": "Release v2.1.0",
    "body": "新增夜间模式、修复登录 bug",
    "status": "changed",
    "diff_url": "https://github.com/xxx/releases/tag/v2.1.0",
    "extra": {"latency_ms": 42}
  }'
```

- `status`：`ok` / `changed` / `warning` / `error`（默认 `ok`）
- `diff_url`：仅支持 `http/https`
- **去重**：相同 `version+title+status` 在 1 小时内只记录一次，重复上报返回
  `{"recorded":true,"deduplicated":true}`
- 长度限制：`version` 100 / `title` 300 / `body` 10000 / `extra` 10KB

### 查询

```bash
# 项目列表
curl https://<your-worker>/api/projects -H "Authorization: Bearer ***"

# 更新历史（limit 1~200 默认 50，offset 从 0 开始，可按 status 筛选）
curl "https://<your-worker>/api/projects/my-scraper/updates?limit=20&offset=0&status=error" \
  -H "Authorization: Bearer ***"
# → {"data":[...],"limit":20,"offset":0,"has_more":true}

# 每日汇总（北京时间 0 点起算）
curl "https://<your-worker>/api/daily-digest" -H "Authorization: Bearer ***"

# 30 天趋势 / 仪表盘概览（设置 DASHBOARD_PASSWORD 后需要凭据）
curl "https://<your-worker>/api/public/trends" -H "Authorization: Bearer ***"
curl "https://<your-worker>/api/public/overview" -H "Authorization: Bearer ***"
```

### RSS / Atom

```bash
curl "https://<your-worker>/api/feed?key=*** /api/projects/my-scraper/feed?key=*** Feed 阅读器的地址栏里携带 `?key=` 即可。

### Token 管理

```bash
# 列出 Token（不返回明文）
curl https://<your-worker>/api/tokens -H "Authorization: Bearer ***"

# 创建 Token —— 明文仅此一次返回，请立刻保存
curl -X POST https://<your-worker>/api/tokens \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"label":"CI 脚本","scopes":["read","write"]}'

# 禁用 / 启用
curl -X PATCH https://<your-worker>/api/tokens/1 \
  -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false}'

# 删除
curl -X DELETE https://<your-worker>/api/tokens/1 \
  -H "Authorization: Bearer ***"
```

`scopes` 可选值：`read`、`write`、`admin`。**只有 admin Token 才能签发含 `admin` 的 Token。**

### 标签

```bash
curl https://<your-worker>/api/tags -H "Authorization: Bearer ***"
curl -X POST https://<your-worker>/api/tags -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" -d '{"name":"重要"}'
curl -X POST https://<your-worker>/api/projects/1/tags -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" -d '{"tag_id":1}'
curl -X DELETE https://<your-worker>/api/projects/1/tags/1 -H "Authorization: Bearer ***"
curl -X DELETE https://<your-worker>/api/tags/1 -H "Authorization: Bearer ***"
```

### Webhook

```bash
curl https://<your-worker>/api/webhooks -H "Authorization: Bearer ***"
curl -X POST https://<your-worker>/api/webhooks -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/hook","secret":"s3cret","events":["update"]}'
curl -X DELETE https://<your-worker>/api/webhooks/1 -H "Authorization: Bearer ***"
```

推送体为 JSON，带 `X-Hub-Signature-256: sha256=<HMAC-SHA256(body, secret)>`。
URL 仅允许 http/https 公网地址（内网地址会被拒绝）。

### 订阅（邮件通知）

```bash
curl https://<your-worker>/api/subscriptions -H "Authorization: Bearer ***"
curl -X POST https://<your-worker>/api/subscriptions -H "Authorization: Bearer ***" \
  -H "Content-Type: application/json" \
  -d '{"email":"reader@example.com","project_id":1,"events":["update"]}'
curl -X DELETE https://<your-worker>/api/subscriptions/1 -H "Authorization: Bearer ***"
```

创建时返回 `unsubscribe_url`，邮件底部也带退订链接（需配置 `PUBLIC_URL`）。
退订接口无需认证：`GET /api/unsubscribe?token=<unsubscribe_token>`。

邮件需要配置 `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM`（用 `wrangler secret put`）。

### 使用统计 / 健康度

```bash
curl https://<your-worker>/api/usage -H "Authorization: Bearer ***"
curl -X POST https://<your-worker>/api/health/refresh -H "Authorization: Bearer ***"
```

## 字段说明

### 更新状态值

| 状态 | 含义 | 前端颜色 |
|------|------|----------|
| `ok` | 正常/无变化 | 🟢 绿 |
| `changed` | 发现变更 | 🔵 蓝 |
| `warning` | 警告 | 🟡 黄 |
| `error` | 错误/异常 | 🔴 红 |

## 配合 Cron 检测示例

### GitHub Actions 定时检测

```yaml
name: Check iOS Update
on:
  schedule:
    - cron: '0 */6 * * *'  # 每 6 小时
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Check and report
        run: |
          VERSION="18.4"
          curl -X POST "${{ secrets.UPDATE_HUB_URL }}/api/projects/ios-update-check/updates" \
            -H "Authorization: Bearer ${{ secrets.UPDATE_HUB_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d "{\"version\":\"$VERSION\",\"title\":\"iOS $VERSION 可用\",\"status\":\"changed\"}"
```

### 本地 crontab

```bash
0 * * * * /path/to/check.sh
```

`check.sh`:
```bash
#!/bin/bash
LATEST=$(curl -s https://api.github.com/repos/owner/repo/releases/latest | jq -r .tag_name)
LAST=$(cat "$HOME/.cache/.last_version" 2>/dev/null)
if [ "$LATEST" != "$LAST" ]; then
  curl -s -X POST "$UPDATE_HUB_URL/api/projects/github-repo-watch/updates" \
    -H "Authorization: Bearer ***" \
    -H "Content-Type: application/json" \
    -d "{\"version\":\"$LATEST\",\"title\":\"New Release: $LATEST\",\"status\":\"changed\"}"
  mkdir -p "$HOME/.cache" && echo "$LATEST" > "$HOME/.cache/.last_version"
fi
```

## 开发与测试

```bash
npm run typecheck     # TypeScript 检查
npm run test:smoke    # 冒烟测试（需先启动 dev server）
```

CI（`.github/workflows/ci.yml`）会在每次 push/PR 时执行：类型检查 → 建表 → 启动 dev server →
49 项冒烟测试（含防提权、XSS、SSRF、鉴权边界、去重、分页）→ 迁移脚本校验。

## 免费额度

Cloudflare Workers 免费计划：
- 每天 100,000 次请求
- D1: 每天 5M 读 + 100K 写
- 足够个人/小团队使用

> 提示：使用统计会为每个 API 请求写一条日志（每天自动清理 30 天前的记录）。
> 请求量大时可考虑关掉 `src/index.ts` 中的使用统计中间件。
