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
printf '%s\n' "STEP 2: DISCOVER RUNPOD AUDIO ENDPOINT"
printf '%s\n' "========================================"
run_node scripts/inspect-avantiqo-audio-runpod-worker-local.mjs

printf '%s\n' "========================================"
printf '%s\n' "STEP 3: PLAN AUDIO WORKER REPAIR"
printf '%s\n' "========================================"
set +e
run_node scripts/run-with-runpod-registry-auth-normalized-local.mjs scripts/repair-avantiqo-audio-runpod-worker-local.mjs
REPAIR_PLAN_STATUS=$?
set -e

if [ "$REPAIR_PLAN_STATUS" -eq 3 ]; then
  if [ "$MODE" = "apply" ]; then
    printf '%s\n' "========================================"
    printf '%s\n' "STEP 3A: APPLY RUNPOD GHCR AUTH"
    printf '%s\n' "========================================"
    run_node scripts/provision-avantiqo-runpod-ghcr-auth-local.mjs --apply
    run_node scripts/run-with-runpod-registry-auth-normalized-local.mjs scripts/repair-avantiqo-audio-runpod-worker-local.mjs
  else
    run_node scripts/provision-avantiqo-runpod-ghcr-auth-local.mjs --plan
    exit 3
  fi
elif [ "$REPAIR_PLAN_STATUS" -ne 0 ]; then
  exit "$REPAIR_PLAN_STATUS"
fi

printf '%s\n' "========================================"
printf '%s\n' "STEP 3B: WAIT FOR AUDIO WORKER DRAIN"
printf '%s\n' "========================================"
if [ "$MODE" = "apply" ]; then
  run_node scripts/wait-avantiqo-audio-runpod-drain-local.mjs
fi

printf '%s\n' "========================================"
printf '%s\n' "STEP 4: PLAN DURABLE AUDIO MODEL CACHE"
printf '%s\n' "========================================"
set +e
run_node scripts/provision-avantiqo-audio-runpod-storage-local.mjs --plan
STORAGE_PLAN_STATUS=$?
set -e

printf '%s\n' "========================================"
printf '%s\n' "STEP 5: INSPECT AUDIO WORKER READ ONLY"
printf '%s\n' "========================================"
run_node scripts/inspect-avantiqo-audio-runpod-worker-local.mjs

if [ "$MODE" = "plan" ]; then
  if [ "$STORAGE_PLAN_STATUS" -eq 2 ]; then
    echo "AVANTIQO_MUSIC_RUNPOD_PREPARE=PLAN_BLOCKED_SHARED_CACHE_CONSOLIDATION"
    echo "AVANTIQO_MUSIC_RUNPOD_MUTATION_PERFORMED=false"
    exit 2
  fi
  if [ "$STORAGE_PLAN_STATUS" -ne 0 ]; then
    echo "AVANTIQO_MUSIC_RUNPOD_PREPARE=PLAN_FAILED_STORAGE_STATUS_${STORAGE_PLAN_STATUS}" >&2
    echo "AVANTIQO_MUSIC_RUNPOD_MUTATION_PERFORMED=false"
    exit "$STORAGE_PLAN_STATUS"
  fi
  echo "AVANTIQO_MUSIC_RUNPOD_PREPARE=PLAN_COMPLETE"
  echo "AVANTIQO_MUSIC_RUNPOD_MUTATION_PERFORMED=false"
  exit 0
fi

if [ "$STORAGE_PLAN_STATUS" -ne 0 ]; then
  echo "AVANTIQO_MUSIC_RUNPOD_APPLY_BLOCKED_BY_STORAGE_PLAN_STATUS=${STORAGE_PLAN_STATUS}" >&2
  echo "AVANTIQO_MUSIC_RUNPOD_MUTATION_PERFORMED=false"
  exit "$STORAGE_PLAN_STATUS"
fi

if [ "${AVANTIQO_AUDIO_RUNPOD_STORAGE_APPROVED:-}" != "YES" ]; then
  echo "AVANTIQO_AUDIO_RUNPOD_STORAGE_APPROVED=YES_REQUIRED_FOR_APPLY" >&2
  exit 4
fi
if [ "${AVANTIQO_AUDIO_RUNPOD_REPAIR_APPROVED:-}" != "YES" ]; then
  echo "AVANTIQO_AUDIO_RUNPOD_REPAIR_APPROVED=YES_REQUIRED_FOR_APPLY" >&2
  exit 5
fi

printf '%s\n' "========================================"
printf '%s\n' "STEP 6: ATTACH DURABLE AUDIO MODEL CACHE"
printf '%s\n' "========================================"
run_node scripts/provision-avantiqo-audio-runpod-storage-local.mjs --apply

printf '%s\n' "========================================"
printf '%s\n' "STEP 7: APPLY AUDIO WORKER REPAIR"
printf '%s\n' "========================================"
run_node scripts/run-with-runpod-registry-auth-normalized-local.mjs scripts/repair-avantiqo-audio-runpod-worker-local.mjs --apply

printf '%s\n' "========================================"
printf '%s\n' "STEP 8: PROVE AUDIO IDENTITY AND BIND LOCALLY"
printf '%s\n' "========================================"
run_node scripts/bind-avantiqo-audio-endpoint-auto-local.mjs

printf '%s\n' "========================================"
printf '%s\n' "STEP 9: RE-INSPECT AUDIO WORKER"
printf '%s\n' "========================================"
run_node scripts/inspect-avantiqo-audio-runpod-worker-local.mjs

printf '%s\n' "========================================"
printf '%s\n' "STEP 10: ZERO-GENERATION MUSIC PREFLIGHT"
printf '%s\n' "========================================"
run_node scripts/preflight-avantiqo-music-local.mjs

echo "AVANTIQO_MUSIC_RUNPOD_PREPARE=APPLY_COMPLETE"
echo "AVANTIQO_MUSIC_RUNPOD_REAL_MUSIC_GENERATION_SUBMITTED=false"
echo "AVANTIQO_MUSIC_RUNPOD_PRODUCTION_DEPLOY_PERFORMED=false"
