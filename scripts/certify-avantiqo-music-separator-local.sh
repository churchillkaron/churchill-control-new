#!/bin/sh
set -eu
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"
: "${AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED:?AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED=YES_REQUIRED}"
: "${AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED:?AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED=YES_REQUIRED}"
[ "$AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED" = "YES" ] || { echo "SPEND_APPROVAL_REQUIRED" >&2; exit 1; }
[ "$AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED" = "YES" ] || { echo "RIGHTS_APPROVAL_REQUIRED" >&2; exit 1; }
node scripts/audit-avantiqo-music-separator-certification-readiness.mjs
node scripts/run-avantiqo-music-separator-benchmark-local.mjs
node scripts/avantiqo-music-separator-economics.mjs
node scripts/prepare-avantiqo-music-separator-human-review.mjs
printf '%s\n' 'AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION=TECHNICAL_PASS_HUMAN_REVIEW_REQUIRED'
printf '%s\n' 'AVANTIQO_MUSIC_SEPARATOR_INFRASTRUCTURE=MODAL_DIRECT_A10G_ASYNC_V1'
printf '%s\n' 'AVANTIQO_MUSIC_SEPARATOR_PRODUCTION_ACTIVATION=false'
