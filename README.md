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
# 创建数据库（记下输出的 database_id）
wrangler d1 create update-hub-db
```

将输出的 `database_id` 填入 `wrangler.toml` 的 `database_id` 字段。

### 2. 初始化数据库表结构

```bash
# 本地开发
npm run db:init

# 远程数据库
npm run db:init:remote

# 导入示例数据（可选）
npm run db:seed:remote
```

### 3. 本地开发

```bash
npm install
npm run dev
```

访问 `http://localhost:8787` 查看仪表盘。

### 4. 部署

```bash
# 部署 Worker
npm run deploy

# 设置主 Token（推荐用 secret）
wrangler secret put API_TOKEN
# 输入一个安全的随机 token
```

### 5. 设置仪表盘密码（可选）

```bash
# 设置后仪表盘需要密码才能访问
wrangler secret put DASHBOARD_PASSWORD
```

访问时通过 `?key=你的密码` 或 `Authorization: Bearer 你的密码` 提供。

## API 文档

### 鉴权

所有 `/api/` 路由（除 `/api/health` 和 `/api/public/overview`）需要 Bearer Token：

```
Authorization: Bearer uh_xxxxx
```

### 注册项目

```bash
curl -X POST https://update-hub.xinming.dpdns.org/api/projects \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-scraper",
    "label": "网页价格监控",
    "type": "content",
    "icon": "💰"
  }'
```

### 编辑项目

```bash
curl -X PATCH https://update-hub.xinming.dpdns.org/api/projects/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "label": "新名称",
    "icon": "🔥"
  }'
```

可修改字段：`label`、`type`、`icon`、`config`。

### 删除项目

```bash
curl -X DELETE https://update-hub.xinming.dpdns.org/api/projects/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

删除项目会自动清理关联的更新记录。

### 上报更新

```bash
# 上报版本更新
curl -X POST https://update-hub.xinming.dpdns.org/api/projects/github-repo-watch/updates \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "2.1.0",
    "title": "Release v2.1.0",
    "body": "新增夜间模式、修复登录 bug",
    "status": "changed",
    "diff_url": "https://github.com/xxx/releases/tag/v2.1.0"
  }'

# 上报状态检查
curl -X POST https://update-hub.xinming.dpdns.org/api/projects/api-health/updates \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "支付接口健康检查",
    "status": "ok",
    "extra": {"latency_ms": 42, "endpoint": "/api/pay"}
  }'

# 上报错误
curl -X POST https://update-hub.xinming.dpdns.org/api/projects/my-scraper/updates \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "抓取失败",
    "body": "目标页面返回 403 Forbidden",
    "status": "error"
  }'
```

### 查询项目列表

```bash
curl https://update-hub.xinming.dpdns.org/api/projects \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 查询项目更新历史

```bash
# 基本查询（默认 limit=50）
curl "https://update-hub.xinming.dpdns.org/api/projects/github-repo-watch/updates" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 分页查询
curl "https://update-hub.xinming.dpdns.org/api/projects/github-repo-watch/updates?limit=20&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

响应格式：

```json
{
  "data": [ ... ],
  "limit": 20,
  "offset": 0,
  "has_more": true
}
```

参数说明：`limit` 范围 1~200，默认 50；`offset` 从 0 开始。`has_more` 为 `true` 时表示还有更多数据。

### Token 管理

```bash
# 列出所有 Token
curl https://update-hub.xinming.dpdns.org/api/tokens \
  -H "Authorization: Bearer YOUR_TOKEN"

# 创建新 Token
curl -X POST https://update-hub.xinming.dpdns.org/api/tokens \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label": "CI 脚本", "scopes": ["read", "write"]}'

# 禁用 Token
curl -X PATCH https://update-hub.xinming.dpdns.org/api/tokens/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# 删除 Token
curl -X DELETE https://update-hub.xinming.dpdns.org/api/tokens/1 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 字段说明

### 更新状态值

| 状态 | 含义 | 前端颜色 |
|------|------|----------|
| `ok` | 正常/无变化 | 🟢 绿 |
| `changed` | 发现变更 | 🔵 蓝 |
| `warning` | 警告 | 🟡 黄 |
| `error` | 错误/异常 | 🔴 红 |

### 更新记录字段

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `version` | string | 否 | 版本号 |
| `title` | string | 否 | 标题/摘要 |
| `body` | string | 否 | 详细内容 |
| `status` | string | 否 | 默认 `ok`，可选 `ok/changed/warning/error` |
| `diff_url` | string | 否 | 变更链接 |
| `extra` | object | 否 | 扩展数据（JSON） |

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
# 每小时检查一次 GitHub release
0 * * * * /path/to/check.sh
```

`check.sh`:
```bash
#!/bin/bash
LATEST=$(curl -s https://api.github.com/repos/owner/repo/releases/latest | jq -r .tag_name)
LAST=$(cat /tmp/.last_version 2>/dev/null)
if [ "$LATEST" != "$LAST" ]; then
  curl -s -X POST "https://update-hub.xinming.dpdns.org/api/projects/github-repo-watch/updates" \
    -H "Authorization: Bearer uh_xxxxx" \
    -H "Content-Type: application/json" \
    -d "{\"version\":\"$LATEST\",\"title\":\"New Release: $LATEST\",\"status\":\"changed\"}"
  echo "$LATEST" > /tmp/.last_version
fi
```

## 免费额度

Cloudflare Workers 免费计划：
- 每天 100,000 次请求
- D1: 每天 5M 读 + 100K 写
- 足够个人/小团队使用
