#!/bin/sh
set -eu
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"
: "${AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED:?AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED=YES_REQUIRED}"
[ "$AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED" = "YES" ] || { echo "RIGHTS_APPROVAL_REQUIRED" >&2; exit 1; }
if [ "${AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED:-}" = "YES" ]; then
  echo "NODE01_LANE_MUST_NOT_REQUIRE_EXTERNAL_SPEND_APPROVAL" >&2
  exit 1
fi
node scripts/audit-avantiqo-music-separator-certification-readiness.mjs
node scripts/benchmark-avantiqo-music-separator-node01.mjs
node scripts/avantiqo-music-separator-economics.mjs
node scripts/prepare-avantiqo-music-separator-human-review.mjs
printf '%s\n' 'AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION=NODE01_TECHNICAL_PASS_HUMAN_REVIEW_REQUIRED'
printf '%s\n' 'AVANTIQO_MUSIC_SEPARATOR_INFRASTRUCTURE=AVANTIQO_LOCAL_NODE_V1'
printf '%s\n' 'AVANTIQO_MUSIC_SEPARATOR_EXTERNAL_PROVIDER_SPEND=0'
printf '%s\n' 'AVANTIQO_MUSIC_SEPARATOR_PRODUCTION_ACTIVATION=false'
