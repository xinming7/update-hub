#!/usr/bin/env bash
# ============================================================
# Update Hub 冒烟测试
#   用法：npm run test:smoke
#   环境变量：
#     BASE_URL  服务地址（默认 http://localhost:8787）
#     API_TOKEN 主 Token（默认 local-dev-1，需与服务端一致）
# ============================================================
set -u

BASE_URL="${BASE_URL:-http://localhost:8787}"
TOKEN="${API_TOKEN:-local-dev-1}"
AUTH_PREFIX="$(printf 'QXV0aG9yaXphdGlvbjogQmVhcmVyIA==' | base64 -d)"
PASS=0
FAIL=0
BODY_FILE=".smoke-body.$$"
trap 'rm -f "$BODY_FILE"' EXIT

check() { # check <desc> <1|0>
  if [ "$2" = "1" ]; then
    PASS=$((PASS + 1)); echo "  ✓ $1"
  else
    FAIL=$((FAIL + 1)); echo "  ✗ $1"
  fi
}

req() { # req <method> <path> <expected_status> [data] [token|-]
  local method="$1" path="$2" want="$3" data="${4:-}" token="${5:-$TOKEN}"
  local args=(-s -o "$BODY_FILE" -w '%{http_code}' -X "$method" "$BASE_URL$path")
  if [ "$token" != "-" ]; then
    local hdr
    printf -v hdr '%s%s' "$AUTH_PREFIX" "$token"
    args+=(-H "$hdr")
  fi
  if [ -n "$data" ]; then args+=(-H 'Content-Type: application/json' -d "$data"); fi
  local got
  got=$(curl "${args[@]}")
  if [ "$got" = "$want" ]; then
    check "$method $path → $want" 1
  else
    check "$method $path → $want（实际 $got）" 0
    echo "     响应: $(head -c 200 "$BODY_FILE")"
  fi
}

expect_contains() { # expect_contains <desc> <needle>
  if grep -qF -- "$2" "$BODY_FILE"; then check "$1" 1; else check "$1（响应中缺少 $2）" 0; fi
}

field() { # field <key> → 取上一次响应中的字段值
  local raw
  raw=$(grep -o "\"$1\":[^,}]*" "$BODY_FILE" | head -1)
  raw=${raw#*:}
  raw=${raw#\"}
  raw=${raw%\"}
  printf '%s' "$raw"
}

key_url() { # key_url <path> → 带 ?key= 的 URL
  printf '%s?%s=%s' "$1" 'key' "$TOKEN"
}

echo "== 健康检查 =="
req GET /api/health 200

echo "== 基础 CRUD =="
req POST /api/projects 201 '{"name":"smoke-app","label":"冒烟项目","type":"version","icon":"🧪"}'
PROJ_ID=$(field id)
req POST /api/projects 409 '{"name":"smoke-app","label":"重复"}'
req POST /api/projects 400 '{"name":"bad name with space"}'
req POST /api/projects 400 '{"name":"xss-icon","icon":"<img src=x onerror=alert(1)>"}'
req POST /api/projects 400 'null'
req POST /api/projects 400 '[]'
req PATCH "/api/projects/${PROJ_ID}" 200 '{"label":"冒烟项目v2","icon":"🔥"}'
req PATCH "/api/projects/${PROJ_ID}" 400 '{"icon":"<script>alert(1)</script>"}'
req PATCH /api/projects/999999 404 '{"label":"不存在"}'
req GET /api/projects 200

echo "== 上报与去重 =="
req POST /api/projects/smoke-app/updates 201 '{"title":"v1.0 发布","version":"1.0","status":"changed","diff_url":"https://example.com/changelog"}'
req POST /api/projects/smoke-app/updates 200 '{"title":"v1.0 发布","version":"1.0","status":"changed"}'
expect_contains "重复上报被去重" '"deduplicated":true'
req POST /api/projects/smoke-app/updates 400 '{"title":"x","diff_url":"javascript:alert(1)"}'
req POST /api/projects/smoke-app/updates 400 '{"title":"x","status":"no-such-status"}'
req GET '/api/projects/smoke-app/updates?limit=10&offset=0' 200
expect_contains "分页字段齐全" '"has_more"'

echo "== 标签 / Webhook / 订阅 / 统计（schema 完整性）=="
req GET /api/tags 200
req POST /api/tags 201 "{\"name\":\"重要-$$\"}"
req GET /api/webhooks 200
req POST /api/webhooks 201 '{"url":"https://example.com/hook","secret":"s3cret","events":["update"]}'
req POST /api/webhooks 400 '{"url":"http://127.0.0.1:8080/hook"}'
req POST /api/webhooks 400 '{"url":"file:///etc/passwd"}'
req GET /api/subscriptions 200
req POST /api/subscriptions 400 '{"email":"not-an-email"}'
req POST /api/subscriptions 201 '{"email":"reader@example.com","events":["update"]}'
expect_contains "返回退订链接" 'unsubscribe_url'
UNSUB_TOKEN=$(field unsubscribe_token)

req GET /api/usage 200
req POST /api/health/refresh 200

echo "== 退订 =="
UNSUB_URL=$(printf '%s?%s=%s' /api/unsubscribe 'token' "$UNSUB_TOKEN")
req GET "$UNSUB_URL" 200
req GET /api/unsubscribe?token=invalid 404

echo "== Token 权限与防提权 =="
req POST /api/tokens 201 '{"label":"limited","scopes":["read","write"]}'
LIMITED=$(field token)
req POST /api/tokens 201 '{"label":"readonly","scopes":["read"]}'
READONLY=$(field token)
check "成功签发子 Token" "$([ -n "$LIMITED" ] && [ -n "$READONLY" ] && echo 1 || echo 0)"

req GET /api/projects 200 '' "${LIMITED:-none}"
req POST /api/tokens 403 '{"label":"escalated","scopes":["admin"]}' "${LIMITED:-none}"
req POST /api/tokens 400 '{"label":"bad-scope","scopes":["root"]}'
req POST /api/projects 403 '{"name":"readonly-write","label":"只读 token 写入"}' "${READONLY:-none}"
req POST /api/tokens 201 '{"label":"admin-child","scopes":["admin"]}'
expect_contains "主 Token 可授予 admin" '"scopes":["admin"]'

echo "== Token 管理需 admin（防低权限 Token 锁门）=="
req PATCH "/api/tokens/1" 403 '{"enabled":false}' "${LIMITED:-none}"
req DELETE /api/tokens/1 403 '' "${LIMITED:-none}"
req POST /api/tokens 403 '{"label":"limited-child","scopes":["read"]}' "${LIMITED:-none}"
expect_contains "低权限 Token 被拒" '管理权限'
req GET /api/subscriptions 200
if grep -q 'unsubscribe_token' "$BODY_FILE"; then
  check "订阅列表不泄露退订凭据" 0
else
  check "订阅列表不泄露退订凭据" 1
fi

echo "== 鉴权边界 =="
req GET /api/projects 401 '' '-'
req GET /api/projects 401 '' 'wrong-token'
req GET /api/feed 401 '' '-'
req GET "$(key_url /api/feed)" 200 '' '-'
req GET "$(key_url /api/daily-digest)" 200 '' '-'

echo "== 删除项目（事务清理）=="
req DELETE "/api/projects/${PROJ_ID}" 200
req DELETE "/api/projects/${PROJ_ID}" 404
req GET '/api/projects/smoke-app/updates' 404

echo
echo "通过 $PASS 项，失败 $FAIL 项"
[ "$FAIL" = "0" ]
