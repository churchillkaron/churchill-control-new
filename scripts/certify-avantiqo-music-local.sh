#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

MODE=${1:-preflight}
case "$MODE" in
  preflight|benchmark) ;;
  *)
    echo "usage: $0 [preflight|benchmark]" >&2
    exit 2
    ;;
esac

if [ ! -f .env.local ]; then
  echo "AVANTIQO_MUSIC_LOCAL_ENV_REQUIRED" >&2
  exit 1
fi

command -v vercel >/dev/null 2>&1 || {
  echo "AVANTIQO_MUSIC_VERCEL_CLI_REQUIRED" >&2
  exit 1
}

run_node() {
  node --env-file=.env.local "$@"
}

printf '%s\n' "========================================"
printf '%s\n' "STEP 1: IMPORT CURRENT VERCEL MEDIA ENV LOCALLY"
printf '%s\n' "========================================"
sh scripts/import-avantiqo-media-certification-vercel-env.sh

printf '%s\n' "========================================"
printf '%s\n' "STEP 2: MUSIC STUDIO RELEASE AUDIT"
printf '%s\n' "========================================"
node scripts/music-studio-release-audit.mjs

printf '%s\n' "========================================"
printf '%s\n' "STEP 3: ZERO-SPEND MUSIC PREFLIGHT"
printf '%s\n' "========================================"
run_node scripts/preflight-avantiqo-music-local.mjs

if [ "$MODE" = "preflight" ]; then
  echo "AVANTIQO_MUSIC_LOCAL_CERTIFICATION=PREFLIGHT_COMPLETE"
  echo "AVANTIQO_MUSIC_LOCAL_BENCHMARK_SUBMITTED=false"
  echo "AVANTIQO_MUSIC_LOCAL_PRODUCTION_DEPLOY_PERFORMED=false"
  echo "AVANTIQO_MUSIC_LOCAL_ACTIVATION_PERFORMED=false"
  exit 0
fi

if [ "${AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED:-}" != "YES" ]; then
  echo "AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED=YES_REQUIRED" >&2
  exit 3
fi

RESULT_ROOT=${AVANTIQO_MUSIC_LOCAL_CERTIFICATION_DIR:-"${TMPDIR:-/tmp}/avantiqo-music-certification-$(date -u +%Y%m%dT%H%M%SZ)"}
mkdir -p "$RESULT_ROOT"
BENCHMARK_OUTPUT="$RESULT_ROOT/music-certification-benchmark.json"
ECONOMICS_OUTPUT="$RESULT_ROOT/music-economics.json"
REVIEW_OUTPUT="$RESULT_ROOT/music-human-review.json"

printf '%s\n' "========================================"
printf '%s\n' "STEP 4: CONTROLLED OWNED MUSIC BENCHMARK"
printf '%s\n' "========================================"
AVANTIQO_AUDIO_BENCHMARK_SPEND_APPROVED=YES \
AVANTIQO_AUDIO_BENCHMARK_RUNS=1 \
AVANTIQO_AUDIO_BENCHMARK_DURATION_SECONDS=12 \
AVANTIQO_AUDIO_BENCHMARK_OUTPUT="$BENCHMARK_OUTPUT" \
node --env-file=.env.local scripts/benchmark-avantiqo-music.mjs

printf '%s\n' "========================================"
printf '%s\n' "STEP 5: MEASURE MUSIC GPU ECONOMICS"
printf '%s\n' "========================================"
AVANTIQO_AUDIO_BENCHMARK_OUTPUT="$BENCHMARK_OUTPUT" \
AVANTIQO_AUDIO_ECONOMICS_OUTPUT="$ECONOMICS_OUTPUT" \
node --env-file=.env.local scripts/avantiqo-music-economics.mjs

printf '%s\n' "========================================"
printf '%s\n' "STEP 6: PREPARE HUMAN LISTENING REVIEW"
printf '%s\n' "========================================"
AVANTIQO_AUDIO_BENCHMARK_OUTPUT="$BENCHMARK_OUTPUT" \
AVANTIQO_AUDIO_ECONOMICS_OUTPUT="$ECONOMICS_OUTPUT" \
AVANTIQO_MUSIC_HUMAN_REVIEW_OUTPUT="$REVIEW_OUTPUT" \
node --env-file=.env.local scripts/prepare-avantiqo-music-human-review.mjs

printf '%s\n' "========================================"
printf '%s\n' "AVANTIQO MUSIC LOCAL CERTIFICATION READY FOR HUMAN REVIEW"
printf '%s\n' "========================================"
echo "AVANTIQO_MUSIC_LOCAL_CERTIFICATION=BENCHMARK_COMPLETE"
echo "AVANTIQO_MUSIC_LOCAL_BENCHMARK_RUNS=1"
echo "AVANTIQO_MUSIC_LOCAL_BENCHMARK_DURATION_SECONDS=12"
echo "AVANTIQO_MUSIC_LOCAL_BENCHMARK_OUTPUT=$BENCHMARK_OUTPUT"
echo "AVANTIQO_MUSIC_LOCAL_ECONOMICS_OUTPUT=$ECONOMICS_OUTPUT"
echo "AVANTIQO_MUSIC_LOCAL_HUMAN_REVIEW_OUTPUT=$REVIEW_OUTPUT"
echo "AVANTIQO_MUSIC_LOCAL_HUMAN_REVIEW_REQUIRED=true"
echo "AVANTIQO_MUSIC_LOCAL_PRICING_ACTIVATION_PERFORMED=false"
echo "AVANTIQO_MUSIC_LOCAL_PROVIDER_SELECTION_CHANGED=false"
echo "AVANTIQO_MUSIC_LOCAL_PRODUCTION_DEPLOY_PERFORMED=false"
echo "AVANTIQO_MUSIC_LOCAL_ACTIVATION_ALLOWED=false"
