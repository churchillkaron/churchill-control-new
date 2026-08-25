#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

INSPECTOR="scripts/inspect-avantiqo-intelligence-model-improvement-runpod-local.mjs"
LOCAL_ENV_FILE=${AVANTIQO_INTELLIGENCE_READINESS_ENV_FILE:-}
if [ -z "$LOCAL_ENV_FILE" ] && [ -r "$ROOT/.env.local" ]; then
  LOCAL_ENV_FILE="$ROOT/.env.local"
fi

if [ -n "$LOCAL_ENV_FILE" ]; then
  [ -r "$LOCAL_ENV_FILE" ] || {
    echo "AVANTIQO_INTELLIGENCE_READINESS_LOCAL_ENV_NOT_READABLE" >&2
    exit 1
  }
  echo "AVANTIQO_INTELLIGENCE_READINESS_ENV_SOURCE=LOCAL_ENV_FILE"
  echo "AVANTIQO_INTELLIGENCE_READINESS_SECRET_VALUES_PRINTED=false"
  echo "AVANTIQO_INTELLIGENCE_READINESS_MODE=READ_ONLY"
  exec node --env-file="$LOCAL_ENV_FILE" "$INSPECTOR"
fi

command -v vercel >/dev/null 2>&1 || {
  echo "AVANTIQO_INTELLIGENCE_READINESS_LOCAL_ENV_UNAVAILABLE=true" >&2
  echo "AVANTIQO_INTELLIGENCE_READINESS_VERCEL_CLI_REQUIRED" >&2
  exit 1
}

TMP_VERCEL_ENV=$(mktemp "${TMPDIR:-/tmp}/avantiqo-intelligence-readiness-vercel.XXXXXX")
TMP_EXPORTS=$(mktemp "${TMPDIR:-/tmp}/avantiqo-intelligence-readiness-exports.XXXXXX")
trap 'rm -f "$TMP_VERCEL_ENV" "$TMP_EXPORTS"' EXIT HUP INT TERM
chmod 600 "$TMP_VERCEL_ENV" "$TMP_EXPORTS"

vercel env pull "$TMP_VERCEL_ENV" --environment=production --yes >/dev/null

# Import only RunPod API credentials and the two governed Intelligence endpoint IDs.
# The inspector probes candidate API keys with GET-only RunPod management requests and
# never prints their values.
grep -E '^(export[[:space:]]+)?RUNPOD_[A-Z0-9_]*API_KEY=' "$TMP_VERCEL_ENV" >> "$TMP_EXPORTS" || true
for name in RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID; do
  grep -E "^(export[[:space:]]+)?${name}=" "$TMP_VERCEL_ENV" | tail -n 1 >> "$TMP_EXPORTS" || true
done

set -a
# shellcheck disable=SC1090
. "$TMP_EXPORTS"
set +a

nonempty_runpod_api_key_count=0
for name in $(env | sed -n 's/^\(RUNPOD_[A-Z0-9_]*API_KEY\)=.*/\1/p'); do
  eval "value=\${$name:-}"
  if [ -n "$value" ]; then
    nonempty_runpod_api_key_count=$((nonempty_runpod_api_key_count + 1))
  fi
done

if [ "$nonempty_runpod_api_key_count" -eq 0 ]; then
  echo "AVANTIQO_INTELLIGENCE_READINESS_RUNPOD_CREDENTIAL_NOT_IN_VERCEL" >&2
  exit 1
fi

echo "AVANTIQO_INTELLIGENCE_READINESS_ENV_SOURCE=VERCEL_PRODUCTION"
echo "AVANTIQO_INTELLIGENCE_READINESS_RUNPOD_API_KEY_CANDIDATES_PRESENT=true"
echo "AVANTIQO_INTELLIGENCE_READINESS_SECRET_VALUES_PRINTED=false"
echo "AVANTIQO_INTELLIGENCE_READINESS_MODE=READ_ONLY"
node "$INSPECTOR"
