#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

BENCHMARK_OUTPUT="${AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_OUTPUT:-/tmp/avantiqo-music-separator-certification-benchmark.json}"
ECONOMICS_OUTPUT="${AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_OUTPUT:-/tmp/avantiqo-music-separator-economics.json}"
HUMAN_REVIEW_OUTPUT="${AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_OUTPUT:-/tmp/avantiqo-music-separator-human-review.json}"
CERTIFICATION_EVIDENCE_OUTPUT="${AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_EVIDENCE_OUTPUT:-/tmp/avantiqo-music-separator-certification-evidence.json}"

export AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_OUTPUT="$BENCHMARK_OUTPUT"
export AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_OUTPUT="$ECONOMICS_OUTPUT"
export AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_OUTPUT="$HUMAN_REVIEW_OUTPUT"
export AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_EVIDENCE_OUTPUT="$CERTIFICATION_EVIDENCE_OUTPUT"

printf '%s\n' "============================================================"
printf '%s\n' "AVANTIQO MUSIC SEPARATOR CONTROLLED CERTIFICATION"
printf '%s\n' "============================================================"
printf 'Project: %s\n' "$ROOT_DIR"
printf 'Benchmark: %s\n' "$BENCHMARK_OUTPUT"
printf 'Economics: %s\n' "$ECONOMICS_OUTPUT"
printf 'Review: %s\n' "$HUMAN_REVIEW_OUTPUT"
printf 'Evidence: %s\n' "$CERTIFICATION_EVIDENCE_OUTPUT"

# Use the same credential recovery path as the other owned RunPod engines.
# It prefers the current shell/.env.local, then local traces, then the encrypted
# GitHub fallback. Secret values are never printed or committed.
AVANTIQO_PROJECT_ROOT="$ROOT_DIR" bash scripts/repair-avantiqo-runpod-env-local.sh

node scripts/audit-avantiqo-music-separator-certification-readiness.mjs
node scripts/preflight-avantiqo-music-separator-runpod-local.mjs

if [[ "${AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED:-}" != "YES" ]]; then
  printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION=READY_FOR_CONTROLLED_BENCHMARK"
  printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_BLOCKED=AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED_YES_REQUIRED"
  printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_PROVIDER_JOB_SUBMITTED=false"
  printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_PRICING_ACTIVATION_PERFORMED=false"
  printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_PRODUCTION_DEPLOY_PERFORMED=false"
  exit 2
fi

if [[ "${AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED:-}" != "YES" ]]; then
  printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_BLOCKED=AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED_YES_REQUIRED"
  printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_PROVIDER_JOB_SUBMITTED=false"
  printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_PRICING_ACTIVATION_PERFORMED=false"
  printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_PRODUCTION_DEPLOY_PERFORMED=false"
  exit 2
fi

if [[ -z "${AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SOURCE_FILE:-}" ]]; then
  printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_BLOCKED=AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SOURCE_FILE_REQUIRED"
  printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_PROVIDER_JOB_SUBMITTED=false"
  printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_PRICING_ACTIVATION_PERFORMED=false"
  printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_PRODUCTION_DEPLOY_PERFORMED=false"
  exit 2
fi

node scripts/run-avantiqo-music-separator-benchmark-local.mjs
node scripts/avantiqo-music-separator-economics.mjs
node scripts/prepare-avantiqo-music-separator-human-review.mjs

printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION=HUMAN_REVIEW_REQUIRED"
printf 'AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_FILE=%s\n' "$HUMAN_REVIEW_OUTPUT"
printf '%s\n' "Fill reviewer, reviewed_at, PASS statuses, scores and evidence notes after listening to every benchmark output."
printf '%s\n' "Automatic human approval is forbidden."
printf '%s\n' "After review: node scripts/finalize-avantiqo-music-separator-human-review.mjs"
printf '%s\n' "Then plan only: node scripts/plan-avantiqo-music-separator-promotion.mjs"
printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_PRICING_ACTIVATION_PERFORMED=false"
printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_PROVIDER_CERTIFICATION_MUTATION_PERFORMED=false"
printf '%s\n' "AVANTIQO_MUSIC_SEPARATOR_PRODUCTION_DEPLOY_PERFORMED=false"
