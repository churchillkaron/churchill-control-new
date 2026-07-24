#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${AVANTIQO_REPO_ROOT:-$HOME/Projects/churchill-control-new}"
BRANCH="${AVANTIQO_CREATIVE_BRANCH:-agent/creative-universal-reality-repair-20260724}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_DIR="${CREATIVE_SMOKE_OUTPUT_DIR:-$HOME/Downloads/AVANTIQO_CREATIVE_LIVE_SMOKE_$STAMP}"
TEMP_ROOT="$(mktemp -d /tmp/avantiqo-creative-live-smoke.XXXXXX)"
WORKTREE="$TEMP_ROOT/repository"
SERVER_PID=""
PORT="${CREATIVE_SMOKE_PORT:-3017}"

mkdir -p "$OUTPUT_DIR"

cleanup() {
  local exit_status=$?

  if [ -n "${SERVER_PID:-}" ]; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
    wait "$SERVER_PID" >/dev/null 2>&1 || true
  fi

  cd "$REPO_ROOT" >/dev/null 2>&1 || true
  git worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  rm -rf "$TEMP_ROOT"

  return "$exit_status"
}

trap cleanup EXIT INT TERM

fail() {
  echo "ERROR: $*"
  echo "REPORT DIRECTORY: $OUTPUT_DIR"
  exit 1
}

header() {
  echo
  echo "============================================================"
  echo "$*"
  echo "============================================================"
}

header "AVANTIQO CREATIVE LIVE ENTRANCE + STAFF SMOKE"
echo "Output: $OUTPUT_DIR"

for command_name in git node npm curl jq lsof; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done

[ -d "$REPO_ROOT/.git" ] || fail "Repository not found at $REPO_ROOT"
[ -f "$REPO_ROOT/.env.local" ] || fail "$REPO_ROOT/.env.local was not found"

cd "$REPO_ROOT"

echo "Fetching audited Creative branch..."
git fetch origin "$BRANCH" > "$OUTPUT_DIR/git-fetch.log" 2>&1

echo "Creating isolated temporary worktree..."
git worktree add --detach "$WORKTREE" "origin/$BRANCH" \
  > "$OUTPUT_DIR/worktree.log" 2>&1

for env_file in .env .env.local .env.development .env.development.local; do
  if [ -f "$REPO_ROOT/$env_file" ]; then
    cp "$REPO_ROOT/$env_file" "$WORKTREE/$env_file"
  fi
done

cd "$WORKTREE"

set -a
for env_file in .env .env.local .env.development .env.development.local; do
  if [ -f "$env_file" ]; then
    source "$env_file"
  fi
done
set +a

SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-${SUPABASE_URL:-}}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

[ -n "$SUPABASE_URL" ] || fail "NEXT_PUBLIC_SUPABASE_URL is missing"
[ -n "$SERVICE_ROLE_KEY" ] || fail "SUPABASE_SERVICE_ROLE_KEY is missing"

export SUPABASE_URL SERVICE_ROLE_KEY

echo "Discovering a currency-ready organization with Creative activity..."

DISCOVERY_JSON="$OUTPUT_DIR/organization-discovery.json"

node <<'NODE' > "$DISCOVERY_JSON"
const baseUrl = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.SERVICE_ROLE_KEY || "";

function validCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function organizationCurrency(row = {}) {
  return validCurrency(
    row.default_currency ||
    row.currency ||
    row.base_currency ||
    row.functional_currency ||
    row.metadata?.currency ||
    row.settings?.currency,
  );
}

async function read(path) {
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });

  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text || "null");
  } catch {
    body = null;
  }

  if (!response.ok || !Array.isArray(body)) {
    return [];
  }

  return body;
}

function timeValue(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

const [organizations, entities, projects, missions, assets] = await Promise.all([
  read("organizations?select=*&limit=1000"),
  read("legal_entities?select=organization_id,currency&not.organization_id=is.null&limit=5000"),
  read("creative_projects?select=organization_id,created_at&not.organization_id=is.null&order=created_at.desc&limit=1000"),
  read("creative_missions?select=organization_id,created_at&not.organization_id=is.null&order=created_at.desc&limit=1000"),
  read("creative_assets?select=organization_id,created_at&not.organization_id=is.null&order=created_at.desc&limit=2000"),
]);

const readiness = new Map();

for (const organization of organizations) {
  const id = String(organization.id || "").trim();
  const currency = organizationCurrency(organization);
  if (!id || !currency) continue;

  readiness.set(id, {
    organization_id: id,
    currency,
    currency_source: "organizations",
    organization_name:
      organization.name ||
      organization.legal_name ||
      organization.display_name ||
      null,
  });
}

for (const entity of entities) {
  const id = String(entity.organization_id || "").trim();
  const currency = validCurrency(entity.currency);
  if (!id || !currency || readiness.has(id)) continue;

  readiness.set(id, {
    organization_id: id,
    currency,
    currency_source: "legal_entities",
    organization_name: null,
  });
}

const activity = new Map();

function addActivity(rows, weight, countWeight) {
  rows.forEach((row, index) => {
    const id = String(row.organization_id || "").trim();
    if (!id || !readiness.has(id)) return;

    const current = activity.get(id) || {
      score: 0,
      projects: 0,
      missions: 0,
      assets: 0,
      latest_activity: 0,
    };

    current.score += Math.max(1, weight - index) + countWeight;
    current.latest_activity = Math.max(
      current.latest_activity,
      timeValue(row.created_at),
    );
    activity.set(id, current);
  });
}

addActivity(projects, 100000, 1000);
addActivity(missions, 50000, 500);
addActivity(assets, 10000, 100);

for (const row of projects) {
  const id = String(row.organization_id || "").trim();
  if (!activity.has(id)) continue;
  activity.get(id).projects += 1;
}
for (const row of missions) {
  const id = String(row.organization_id || "").trim();
  if (!activity.has(id)) continue;
  activity.get(id).missions += 1;
}
for (const row of assets) {
  const id = String(row.organization_id || "").trim();
  if (!activity.has(id)) continue;
  activity.get(id).assets += 1;
}

const candidates = [...readiness.values()]
  .map((candidate) => ({
    ...candidate,
    ...(activity.get(candidate.organization_id) || {
      score: 0,
      projects: 0,
      missions: 0,
      assets: 0,
      latest_activity: 0,
    }),
  }))
  .sort((left, right) =>
    right.score - left.score ||
    right.latest_activity - left.latest_activity ||
    right.assets - left.assets ||
    left.organization_id.localeCompare(right.organization_id),
  );

const selected = candidates[0] || null;

process.stdout.write(JSON.stringify({
  selected,
  candidates,
  inspected: {
    organizations: organizations.length,
    legal_entities: entities.length,
    creative_projects: projects.length,
    creative_missions: missions.length,
    creative_assets: assets.length,
  },
}, null, 2));
NODE

ORGANIZATION_ID="$(jq -r '.selected.organization_id // empty' "$DISCOVERY_JSON")"
ORGANIZATION_CURRENCY="$(jq -r '.selected.currency // empty' "$DISCOVERY_JSON")"
CURRENCY_SOURCE="$(jq -r '.selected.currency_source // empty' "$DISCOVERY_JSON")"
ORGANIZATION_NAME="$(jq -r '.selected.organization_name // empty' "$DISCOVERY_JSON")"

[ -n "$ORGANIZATION_ID" ] || fail "No currency-ready organization was found. See $DISCOVERY_JSON"

WORKER_SECRET="${CREATIVE_TEST_WORKER_SECRET:-${CRON_SECRET:-${AVANTIQO_INTERNAL_WORKER_SECRET:-}}}"
if [ -z "$WORKER_SECRET" ]; then
  if command -v uuidgen >/dev/null 2>&1; then
    WORKER_SECRET="creative-smoke-$(uuidgen)"
  else
    WORKER_SECRET="creative-smoke-$(date +%s)-$$"
  fi
fi

export AVANTIQO_INTERNAL_WORKER_SECRET="$WORKER_SECRET"
export CRON_SECRET="$WORKER_SECRET"

while lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

APP_URL="http://127.0.0.1:$PORT"

echo "Installing exact branch dependencies..."
npm ci > "$OUTPUT_DIR/npm-ci.log" 2>&1

echo "Starting isolated Creative Studio on port $PORT..."
npm run dev -- -p "$PORT" > "$OUTPUT_DIR/server.log" 2>&1 &
SERVER_PID=$!

READY=0
for _attempt in $(seq 1 120); do
  HTTP_STATUS="$(
    curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$APP_URL" \
      2>/dev/null || true
  )"

  if [ -n "$HTTP_STATUS" ] && [ "$HTTP_STATUS" != "000" ]; then
    READY=1
    break
  fi

  if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    tail -n 160 "$OUTPUT_DIR/server.log" || true
    fail "Creative Studio server stopped during startup"
  fi

  sleep 2
done

if [ "$READY" -ne 1 ]; then
  tail -n 160 "$OUTPUT_DIR/server.log" || true
  fail "Creative Studio did not become ready"
fi

REPORT="$OUTPUT_DIR/creative-live-smoke-report.json"

export CREATIVE_TEST_APP_URL="$APP_URL"
export CREATIVE_TEST_ORGANIZATION_ID="$ORGANIZATION_ID"
export CREATIVE_TEST_AUTH_TOKEN="avantiqo-automatic-local-smoke"
export CREATIVE_TEST_WORKER_SECRET="$WORKER_SECRET"
export CREATIVE_TEST_MEDIUM="FILM"
export CREATIVE_TEST_MAX_POLLS="120"
export CREATIVE_TEST_POLL_SECONDS="10"
export CREATIVE_TEST_REPORT="$REPORT"
export CREATIVE_TEST_REQUEST="Create a premium cinematic entrance-and-staff brand film. Begin outside the real venue and establish its entrance, location, architecture and atmosphere. Follow a natural guest arrival into the venue with clear spatial continuity. Introduce the real staff through purposeful service actions, authentic expressions, believable movement and warm human reactions. Use supplied and approved organization assets as visual truth and reference. Maintain consistent people, clothing, environment, lighting, geography and brand details across every shot. Include refined cinematic pacing, camera direction, transitions, sound design, music intention, restrained premium titles and a strong emotional ending. Produce the complete release-ready master film and supporting delivery package."

header "RUNNING REAL PROVIDER-BACKED PRODUCTION"
echo "ORGANIZATION_ID=$ORGANIZATION_ID"
[ -n "$ORGANIZATION_NAME" ] && echo "ORGANIZATION=$ORGANIZATION_NAME"
echo "CURRENCY=$ORGANIZATION_CURRENCY"
echo "CURRENCY_SOURCE=$CURRENCY_SOURCE"
echo "APP_URL=$APP_URL"
echo

set +e
bash scripts/creative-end-to-end-smoke.sh 2>&1 | tee "$OUTPUT_DIR/live-smoke.log"
SMOKE_STATUS=${PIPESTATUS[0]}
set -e

if [ "$SMOKE_STATUS" -eq 0 ] && \
   grep -q "CREATIVE_END_TO_END_SMOKE=PASS" "$OUTPUT_DIR/live-smoke.log"; then
  header "CREATIVE LIVE SMOKE PASSED"
  grep -E \
    'CREATIVE_END_TO_END_SMOKE=|MISSION_ID=|PROJECT_ID=|PROJECT_TYPE=|TASKS=|RELEASABLE_DELIVERABLES=' \
    "$OUTPUT_DIR/live-smoke.log" || true
else
  header "CREATIVE LIVE SMOKE FAILED"
  tail -n 200 "$OUTPUT_DIR/live-smoke.log" || true
fi

echo
echo "REPORT DIRECTORY:"
echo "$OUTPUT_DIR"
echo
printf "Terminal will stay open. Copy the result, then press Enter..."
IFS= read -r _

exit "$SMOKE_STATUS"
