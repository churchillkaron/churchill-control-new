#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if [ ! -f .env.local ]; then
  echo "AVANTIQO_MUSIC_RUNPOD_ENV_LOCAL_REQUIRED" >&2
  exit 1
fi

MODE=${1:-plan}
case "$MODE" in
  plan|apply) ;;
  *) echo "usage: $0 [plan|apply]" >&2; exit 2 ;;
esac

run_node() { node --env-file=.env.local "$@"; }

printf '%s\n' "========================================"
printf '%s\n' "STEP 1: IMPORT CURRENT VERCEL ENV LOCALLY"
printf '%s\n' "========================================"
sh scripts/import-avantiqo-media-certification-vercel-env.sh

printf '%s\n' "========================================"
printf '%s\n' "STEP 2: INSPECT REGISTRY-BACKED AUDIO ENDPOINT"
printf '%s\n' "========================================"
run_node scripts/inspect-avantiqo-audio-runpod-worker-local.mjs

printf '%s\n' "========================================"
printf '%s\n' "STEP 3: ZERO-GENERATION MUSIC PREFLIGHT V3"
printf '%s\n' "========================================"
set +e
run_node scripts/preflight-avantiqo-music-local.mjs
PREFLIGHT_STATUS=$?
set -e

if [ "$PREFLIGHT_STATUS" -ne 0 ]; then
  echo "AVANTIQO_MUSIC_RUNPOD_PREPARE=BLOCKED_REGISTRY_PREFLIGHT_V3" >&2
  echo "AVANTIQO_MUSIC_RUNPOD_LEGACY_TEMPLATE_REPAIR_ATTEMPTED=false"
  echo "AVANTIQO_MUSIC_RUNPOD_MUTATION_PERFORMED=false"
  echo "AVANTIQO_MUSIC_RUNPOD_REAL_MUSIC_GENERATION_SUBMITTED=false"
  echo "AVANTIQO_MUSIC_RUNPOD_PRODUCTION_DEPLOY_PERFORMED=false"
  echo "AVANTIQO_MUSIC_RUNPOD_NEXT_ACTION=REPAIR_REGISTRY_BACKED_ENDPOINT_EXPLICITLY" >&2
  exit "$PREFLIGHT_STATUS"
fi

if [ "$MODE" = "apply" ]; then
  echo "AVANTIQO_MUSIC_RUNPOD_APPLY_MUTATION_SKIPPED=REGISTRY_BACKED_PREFLIGHT_ALREADY_GREEN"
fi

echo "AVANTIQO_MUSIC_RUNPOD_PREPARE=REGISTRY_BACKED_READY"
echo "AVANTIQO_MUSIC_RUNPOD_PREFLIGHT_CONTRACT=AVANTIQO_MUSIC_LOCAL_PREFLIGHT_V3"
echo "AVANTIQO_MUSIC_RUNPOD_LEGACY_TEMPLATE_REPAIR_ATTEMPTED=false"
echo "AVANTIQO_MUSIC_RUNPOD_MUTATION_PERFORMED=false"
echo "AVANTIQO_MUSIC_RUNPOD_REAL_MUSIC_GENERATION_SUBMITTED=false"
echo "AVANTIQO_MUSIC_RUNPOD_PRODUCTION_DEPLOY_PERFORMED=false"
