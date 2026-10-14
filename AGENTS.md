# update-hub

## 这是什么
一个自托管的通用「更新汇总」服务：任何检查脚本（apple-update-checker、github-repo-watcher 等）用
Bearer Token 把更新记录 POST 进来，它存进 D1、算项目健康分、向 webhook 与邮件订阅者扇出通知、
输出 Atom feed，并用一个 web 仪表盘展示每个项目的最新状态、趋势与用量，让各个 checker 不必各自维护
通知与历史栈。自用项目，当前在线上运行。入口文件：`src/index.ts`（`app.get('/')` 在第 128 行，
`export default` 在第 660 行）。

## 技术栈
TypeScript 5.8 + Cloudflare Workers；Web 框架 **Hono `^4.7.0`**；存储绑定 **D1，绑名 `DB`**
（`database_name = "update-hub-db"`），无 KV/R2/DO/Queues；邮件用 `cloudflare:sockets` 直连 SMTP。
开发工具：`wrangler ^4.14.0`、`@cloudflare/workers-types ^5.20260903.1`。构建只有 `tsc --noEmit`，
emit 交给 Workers bundler；无前端框架，仪表盘是内嵌的 HTML/CSS/JS 字符串。

## 常用命令
- 安装依赖：`npm install`
- 本地开发：`npm run dev`（`wrangler dev`，默认 http://localhost:8787）
- 测试/校验：`npm run typecheck`（`tsc --noEmit`）；`npm run test:smoke`（`bash test/smoke.sh`，
  需 `BASE_URL`、`API_TOKEN`）
- 部署：`npm run deploy`（`wrangler deploy`）
- 数据库：`npm run db:init` / `npm run db:init:remote`（`schema.sql`）、`npm run db:migrate:remote`
  （`migrations/001_schema_sync.sql`，旧库升级）、`npm run db:seed` / `npm run db:seed:remote`

## 改动流程（用户明确要求）
**每次改完代码，在 commit / push 之前先告诉用户 `README.md` 要不要更新、具体改哪几行、改成什么，
等用户确认后再提交。** README 里的部署方式、配置项、API 端点、可靠性行为都可能随改动过期。

同理，`AGENTS.md` 本身记录的环境事实（部署方式、凭据状态、已知坑）如果被改动影响，也要一并更新。

## 部署与 CI
部署是手动的 `npm run deploy`，**没有推送即部署**（仓库里没有 `deploy.yml`）。两个工作流：
- `.github/workflows/ci.yml`：`on: push` 与 `pull_request`。跑 `npm install` → `npm run typecheck` →
  本地 D1 建表 → 拉起 `wrangler dev --port 8787` 并等 `/api/health` → `npm run test:smoke`（49 个冒烟用例）
  → 用 `test/reset.sql` + `test/legacy_schema.sql` + 迁移脚本校验旧 schema 升级路径。
- `.github/workflows/cron.yml`：`schedule` 三条——`'0 3 * * *'`（北京 11:00 健康度刷新 + 日志清理）、
  `'0 12 * * *'`（北京 20:00 每日汇总）、`'0 12 * * 5'`（周五周报），加 `workflow_dispatch`。
  按 `TZ='Asia/Shanghai' date +%u` 判断是否周五，POST `${WORKER_URL}/api/cron/trigger`（周五带
  `{"type":"weekly"}`）并带 `Bearer secrets.CRON_SECRET`；`WORKER_URL` 或 `CRON_SECRET` 为空时立即失败。
- 部署顺序：`wrangler d1 create update-hub-db` → 把返回 id 填进 `wrangler.toml` 的
  `[[d1_databases]].database_id` → `npm install` → `npm run db:init:remote`（旧库再加
  `npm run db:migrate:remote`）→ `npm run deploy` → `wrangler secret put API_TOKEN`（必需）与
  `wrangler secret put DASHBOARD_PASSWORD`（强烈建议）。

## 改这个项目时的坑
- ✅ 定时任务**只用 GitHub Actions，不用 Cloudflare cron**。`wrangler.toml` 里曾声明的
  `[triggers] crons` 已删除（2026-10）：`src/index.ts` 只导出 `fetch`、没有 `scheduled` handler，
  那两个 cron 是死配置，且占账号 cron 配额导致每次 deploy 报 `code: 10072`。
  真正的定时全部来自 `.github/workflows/cron.yml` → `POST /api/cron/trigger`
  （代码里那句「执行与 scheduled handler 相同的逻辑」就是这块）。**不要再往 `wrangler.toml` 加 `[triggers]`。**
- `wrangler.toml` 的 `database_id` 已于 2026-10 填入线上真实值（此前是占位符 `<YOUR_DATABASE_ID>`，
  会导致 deploy 时 D1 绑定无效）。换环境时记得替换。
- ⚠️ **未设置 `DASHBOARD_PASSWORD` 时，仪表盘与 `/api/public/overview`、`/api/public/trends` 对任何人开放**
  （fail-open，与 github-repo-watcher 的 fail-closed 相反）。`[vars]` 实际也是空的，`CORS_ORIGIN`、
  `PUBLIC_URL` 只写在注释里，所以默认 CORS 仅同源——改认证或跨域时这两条边界要保住。
- 接口契约即对外承诺：`POST /api/projects/:name/updates`（1 小时窗口按 `dedup_key` 去重，重复返回
  `{recorded:true,deduplicated:true}`）同时被 apple-update-checker（项目名 `ios-update-check`）和
  github-repo-watcher（`github-repo-watcher`）调用，改字段或状态码会同时打断两个下游。
- Telegram 汇总有重复推送风险：这里的 `TELEGRAM_*` digest 与 apple-update-checker 的 `daily-digest.yml`
  都能推同一条汇总，`wrangler.toml` 注释写明二选一。另外 `api_usage_logs` 对每个已鉴权的 `/api/*`
  请求写一行 D1（免费额度每天 10 万写），加接口时留意成本。
- webhook 的 SSRF 防护基于字面主机名，代码注释明确说**没有 DNS rebinding 防护**（私网/CGNAT 已拦）。
  ⚠️ `.dev.vars`（已被 `.gitignore` 忽略）内含本地测试用的明文 `API_TOKEN`，禁止提交或外传。

## 相关
- 详细档案：`/Users/liujiaming/Documents/deepseek-harness/default-workspace/project-kb/update-hub.md`
- 项目总索引：`/Users/liujiaming/Documents/deepseek-harness/default-workspace/project-kb/INDEX.md`
