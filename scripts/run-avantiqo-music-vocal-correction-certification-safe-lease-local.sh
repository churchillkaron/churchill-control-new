#!/bin/sh
set -eu
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"
printf '%s\n' 'AVANTIQO_MUSIC_VOCAL_CORRECTION_LEGACY_SAFE_LEASE_WRAPPER=MODAL_DIRECT_COMPATIBILITY_ALIAS'
node scripts/run-avantiqo-music-vocal-correction-certification-local.mjs
node scripts/prepare-avantiqo-music-vocal-correction-human-review.mjs
printf '%s\n' 'AVANTIQO_MUSIC_VOCAL_CORRECTION_CERTIFICATION=TECHNICAL_PASS_HUMAN_REVIEW_REQUIRED'
printf '%s\n' 'AVANTIQO_MUSIC_VOCAL_CORRECTION_INFRASTRUCTURE=MODAL_DIRECT_A10G_ASYNC_V1'
printf '%s\n' 'AVANTIQO_MUSIC_VOCAL_CORRECTION_PRODUCTION_ACTIVATION=false'
