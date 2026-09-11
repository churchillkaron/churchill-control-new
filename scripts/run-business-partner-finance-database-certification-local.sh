#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

STATUS_ENV="$(npx supabase status -o env 2>/dev/null || true)"
if [[ -z "$STATUS_ENV" ]]; then
  printf '%s\n' '{"contract":"AVANTIQO_BUSINESS_PARTNER_FINANCE_DATABASE_CERTIFICATION_V1","status":"BLOCKED_LOCAL_DATABASE_UNAVAILABLE","certified":false,"production_writes_performed":false,"production_deploy_performed":false,"database_migrations_applied":false}'
  exit 2
fi

eval "$STATUS_ENV"
LOCAL_API_URL="${API_URL:-${SUPABASE_URL:-}}"
LOCAL_SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"
if [[ -z "$LOCAL_API_URL" || -z "$LOCAL_SERVICE_ROLE_KEY" ]]; then
  echo "BUSINESS_PARTNER_FINANCE_DB_CERT_LOCAL_STATUS_ENV_INCOMPLETE" >&2
  exit 2
fi
export NEXT_PUBLIC_SUPABASE_URL="$LOCAL_API_URL"
export SUPABASE_SERVICE_ROLE_KEY="$LOCAL_SERVICE_ROLE_KEY"

node --import ./scripts/register-node-next-alias-hooks.mjs \
  scripts/certify-business-partner-finance-database-local.mjs
