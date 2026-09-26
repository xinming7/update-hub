export interface Env {
  DB: D1Database;
  API_TOKEN?: string;
  DASHBOARD_PASSWORD?: string;
  /** 逗号分隔的额外允许跨域来源（默认只允许同源） */
  CORS_ORIGIN?: string;
  /** 邮件里生成退订链接用的对外地址，如 https://update-hub.example.workers.dev */
  PUBLIC_URL?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
  /** 可选：每日汇总 Telegram 推送（不配置则不推送） */
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  /** GitHub Actions cron trigger 鉴权 */
  CRON_SECRET?: string;
}

export interface Project {
  id: number;
  name: string;
  label: string;
  type: string;
  icon: string;
  config: string;
  health_score: number;
  created_at: string;
  updated_at: string;
}

export interface Update {
  id: number;
  project_id: number;
  version: string;
  title: string;
  body: string;
  status: string;
  diff_url: string;
  extra: string;
  dedup_key: string;
  created_at: string;
}

export interface ApiToken {
  id: number;
  /** 仅存哈希，接口不返回 */
  token_hash: string | null;
  legacy_token: string | null;
  label: string;
  scopes: string;
  enabled: number;
  last_used: string | null;
  created_at: string;
}

export interface Webhook {
  id: number;
  url: string;
  secret: string;
  events: string;
  enabled: number;
  created_at: string;
}

export interface Subscription {
  id: number;
  email: string;
  project_id: number | null;
  events: string;
  unsubscribe_token: string;
  enabled: number;
  created_at: string;
}
