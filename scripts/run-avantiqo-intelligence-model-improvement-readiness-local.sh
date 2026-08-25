#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

command -v vercel >/dev/null 2>&1 || {
  echo "AVANTIQO_INTELLIGENCE_READINESS_VERCEL_CLI_REQUIRED" >&2
  exit 1
}

TMP_VERCEL_ENV=$(mktemp "${TMPDIR:-/tmp}/avantiqo-intelligence-readiness-vercel.XXXXXX")
TMP_EXPORTS=$(mktemp "${TMPDIR:-/tmp}/avantiqo-intelligence-readiness-exports.XXXXXX")
trap 'rm -f "$TMP_VERCEL_ENV" "$TMP_EXPORTS"' EXIT HUP INT TERM
chmod 600 "$TMP_VERCEL_ENV" "$TMP_EXPORTS"

vercel env pull "$TMP_VERCEL_ENV" --environment=production --yes >/dev/null

required="RUNPOD_MANAGEMENT_API_KEY RUNPOD_API_KEY"
optional="RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID"

found_management=false
for name in $required $optional; do
  line=$(grep -E "^(export[[:space:]]+)?${name}=.+$" "$TMP_VERCEL_ENV" | tail -n 1 || true)
  if [ -n "$line" ]; then
    printf '%s\n' "$line" >> "$TMP_EXPORTS"
    if [ "$name" = "RUNPOD_MANAGEMENT_API_KEY" ] || [ "$name" = "RUNPOD_API_KEY" ]; then
      found_management=true
    fi
  fi
done

if [ "$found_management" != "true" ]; then
  echo "AVANTIQO_INTELLIGENCE_READINESS_RUNPOD_CREDENTIAL_NOT_IN_VERCEL" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$TMP_EXPORTS"
set +a

if [ -z "${RUNPOD_MANAGEMENT_API_KEY:-}" ]; then
  RUNPOD_MANAGEMENT_API_KEY=${RUNPOD_API_KEY:-}
  export RUNPOD_MANAGEMENT_API_KEY
fi

echo "AVANTIQO_INTELLIGENCE_READINESS_VERCEL_ENV_IMPORTED=true"
echo "AVANTIQO_INTELLIGENCE_READINESS_SECRET_VALUES_PRINTED=false"
echo "AVANTIQO_INTELLIGENCE_READINESS_MODE=READ_ONLY"
node scripts/inspect-avantiqo-intelligence-model-improvement-runpod-local.mjs
