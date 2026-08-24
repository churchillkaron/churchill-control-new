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
  *)
    echo "usage: $0 [plan|apply]" >&2
    exit 2
    ;;
esac

run_node() {
  node --env-file=.env.local "$@"
}

printf '%s\n' "========================================"
printf '%s\n' "STEP 1: IMPORT CURRENT VERCEL ENV LOCALLY"
printf '%s\n' "========================================"
sh scripts/import-avantiqo-media-certification-vercel-env.sh

printf '%s\n' "========================================"
printf '%s\n' "STEP 2: DISCOVER RUNPOD AUDIO ENDPOINT"
printf '%s\n' "========================================"
run_node scripts/discover-avantiqo-runpod-media-config.mjs

printf '%s\n' "========================================"
printf '%s\n' "STEP 3: PLAN AUDIO WORKER REPAIR"
printf '%s\n' "========================================"
set +e
run_node scripts/repair-avantiqo-audio-runpod-worker-local.mjs
REPAIR_PLAN_STATUS=$?
set -e
if [ "$REPAIR_PLAN_STATUS" -eq 2 ]; then
  printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_ENDPOINT=MISSING_OR_REQUIRES_PROVISIONING"
  printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_PREPARE=PROVISIONING_REQUIRED"
  printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_MUTATION_PERFORMED=false"
  printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_GENERATION_SUBMITTED=false"
  printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_PRODUCTION_DEPLOY_PERFORMED=false"
  exit 2
fi
if [ "$REPAIR_PLAN_STATUS" -ne 0 ]; then
  exit "$REPAIR_PLAN_STATUS"
fi

printf '%s\n' "========================================"
printf '%s\n' "STEP 4: INSPECT AUDIO WORKER READ ONLY"
printf '%s\n' "========================================"
run_node scripts/inspect-avantiqo-audio-runpod-worker-local.mjs

if [ "$MODE" = "plan" ]; then
  printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_PREPARE=PLAN_COMPLETE"
  printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_MUTATION_PERFORMED=false"
  printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_GENERATION_SUBMITTED=false"
  printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_PRODUCTION_DEPLOY_PERFORMED=false"
  exit 0
fi

if [ "${AVANTIQO_AUDIO_RUNPOD_REPAIR_APPROVED:-}" != "YES" ]; then
  echo "AVANTIQO_AUDIO_RUNPOD_REPAIR_APPROVED=YES_REQUIRED_FOR_APPLY" >&2
  exit 3
fi

printf '%s\n' "========================================"
printf '%s\n' "STEP 5: APPLY AUDIO WORKER REPAIR"
printf '%s\n' "========================================"
run_node scripts/repair-avantiqo-audio-runpod-worker-local.mjs --apply

printf '%s\n' "========================================"
printf '%s\n' "STEP 6: RE-INSPECT AUDIO WORKER"
printf '%s\n' "========================================"
run_node scripts/inspect-avantiqo-audio-runpod-worker-local.mjs

printf '%s\n' "========================================"
printf '%s\n' "STEP 7: ZERO-SPEND MUSIC PREFLIGHT"
printf '%s\n' "========================================"
run_node scripts/preflight-avantiqo-music-local.mjs

printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_PREPARE=APPLY_COMPLETE"
printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_GENERATION_SUBMITTED=false"
printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_PRODUCTION_DEPLOY_PERFORMED=false"
printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_NEXT=RUN_SAFE_ENDPOINT_FINGERPRINT_THEN_BENCHMARK"
