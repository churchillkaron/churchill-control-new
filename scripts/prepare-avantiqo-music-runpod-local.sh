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
run_node scripts/inspect-avantiqo-audio-runpod-worker-local.mjs

printf '%s\n' "========================================"
printf '%s\n' "STEP 3: PLAN AUDIO WORKER REPAIR"
printf '%s\n' "========================================"
run_node scripts/run-with-runpod-registry-auth-normalized-local.mjs scripts/repair-avantiqo-audio-runpod-worker-local.mjs

printf '%s\n' "========================================"
printf '%s\n' "STEP 4: PLAN DURABLE AUDIO MODEL CACHE"
printf '%s\n' "========================================"
run_node scripts/provision-avantiqo-audio-runpod-storage-local.mjs --plan

printf '%s\n' "========================================"
printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_PREPARE=PLAN_COMPLETE"
printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_MUTATION_PERFORMED=false"
printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_GENERATION_SUBMITTED=false"
printf '%s\n' "AVANTIQO_MUSIC_RUNPOD_PRODUCTION_DEPLOY_PERFORMED=false"
