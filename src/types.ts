export interface Env {
  DB: D1Database;
  API_TOKEN?: string;
  DASHBOARD_PASSWORD?: string;
  SMTP_HOST?: string;
  SMTP_PORT?: string;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
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
  token: string;
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
  enabled: number;
  created_at: string;
}
