#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if [ ! -f .env.local ]; then
  echo "AVANTIQO_MEDIA_CERTIFICATION_ENV_LOCAL_REQUIRED" >&2
  exit 1
fi

MISSING_ENV_COUNT=0
for name in \
  AVANTIQO_MEDIA_CERTIFICATION_FACE_VIDEO_PATH \
  AVANTIQO_MEDIA_CERTIFICATION_FACE_AUDIO_PATH \
  RUNPOD_API_KEY \
  RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID \
  RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID \
  RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID \
  NEXT_PUBLIC_SUPABASE_URL \
  SUPABASE_SERVICE_ROLE_KEY \
  AVANTIQO_IMAGE_GPU_USD_PER_SECOND \
  AVANTIQO_VIDEO_GPU_USD_PER_SECOND \
  AVANTIQO_LIPSYNC_GPU_USD_PER_SECOND
do
  if ! grep -Eq "^(export[[:space:]]+)?${name}=.+$" .env.local; then
    echo "AVANTIQO_MEDIA_CERTIFICATION_ENV_MISSING:${name}" >&2
    MISSING_ENV_COUNT=$((MISSING_ENV_COUNT + 1))
  fi
done

if [ "$MISSING_ENV_COUNT" -ne 0 ]; then
  echo "AVANTIQO_MEDIA_CERTIFICATION_ENV_MISSING_COUNT=${MISSING_ENV_COUNT}" >&2
  echo "AVANTIQO_MEDIA_CERTIFICATION_PREFLIGHT_NOT_STARTED" >&2
  echo "AVANTIQO_MEDIA_CERTIFICATION_RUNPOD_GENERATION_JOBS_SUBMITTED=0" >&2
  exit 1
fi

command -v node >/dev/null 2>&1 || {
  echo "AVANTIQO_MEDIA_CERTIFICATION_NODE_REQUIRED" >&2
  exit 1
}
command -v ffmpeg >/dev/null 2>&1 || {
  echo "AVANTIQO_MEDIA_CERTIFICATION_FFMPEG_REQUIRED" >&2
  exit 1
}
command -v ffprobe >/dev/null 2>&1 || {
  echo "AVANTIQO_MEDIA_CERTIFICATION_FFPROBE_REQUIRED" >&2
  exit 1
}

RESUME_ENABLED=0
case "${AVANTIQO_MEDIA_CERTIFICATION_RESUME:-}" in
  1|true|TRUE|yes|YES|on|ON) RESUME_ENABLED=1 ;;
esac

TARGET_CAPABILITY=${AVANTIQO_MEDIA_CERTIFICATION_CAPABILITY:-}
TARGETED_RETRY_ENABLED=0
if [ -n "$TARGET_CAPABILITY" ]; then
  TARGETED_RETRY_ENABLED=1
fi

BENCHMARK_PATH=${AVANTIQO_MEDIA_FULL_BENCHMARK_OUTPUT:-/tmp/avantiqo-owned-media-full-capability-benchmark.json}

if [ "$TARGETED_RETRY_ENABLED" -eq 1 ]; then
  if [ "$RESUME_ENABLED" -ne 1 ]; then
    echo "AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_REQUIRES_RESUME" >&2
    exit 1
  fi
  case "$TARGET_CAPABILITY" in
    ai.image.generate|ai.image.edit|ai.image.inpaint|ai.image.outpaint|ai.image.upscale|ai.image.analyze|ai.video.generate|ai.video.image_to_video|ai.video.first_last_frame_to_video|ai.video.video_to_video|ai.video.edit|ai.video.inpaint|ai.video.extend|ai.video.upscale|ai.video.lipsync) ;;
    *)
      echo "AVANTIQO_MEDIA_CERTIFICATION_TARGET_INVALID:${TARGET_CAPABILITY}" >&2
      exit 1
      ;;
  esac
  if [ ! -f "$BENCHMARK_PATH" ]; then
    echo "AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_CHECKPOINT_REQUIRED:${BENCHMARK_PATH}" >&2
    exit 1
  fi
  echo "AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY=${TARGET_CAPABILITY}"
fi

rm -f \
  /tmp/avantiqo-owned-media-local-preflight.json \
  /tmp/avantiqo-media-certification-fixtures.json \
  /tmp/avantiqo-owned-media-human-review.json

if [ "$RESUME_ENABLED" -eq 0 ]; then
  rm -f "$BENCHMARK_PATH"
  echo "AVANTIQO_MEDIA_CERTIFICATION_RESUME=DISABLED_FRESH_BENCHMARK"
else
  echo "AVANTIQO_MEDIA_CERTIFICATION_RESUME=ENABLED_PRESERVE_BENCHMARK_CHECKPOINT"
fi

node --env-file=.env.local scripts/preflight-avantiqo-owned-media-local.mjs
node --env-file=.env.local -e '
const fs = require("node:fs");
const preflightPath = process.env.AVANTIQO_MEDIA_PREFLIGHT_OUTPUT || "/tmp/avantiqo-owned-media-local-preflight.json";
const preflight = JSON.parse(fs.readFileSync(preflightPath, "utf8"));
if (preflight?.contract !== "AVANTIQO_OWNED_MEDIA_LOCAL_PREFLIGHT_V1" || preflight?.success !== true) {
  console.error("AVANTIQO_MEDIA_CERTIFICATION_PREFLIGHT_INVALID");
  process.exit(1);
}
if (preflight?.safety?.runpod_generation_jobs_submitted !== 0 || preflight?.safety?.runpod_run_called !== false || preflight?.safety?.runpod_runsync_called !== false) {
  console.error("AVANTIQO_MEDIA_CERTIFICATION_PREFLIGHT_SPEND_SAFETY_INVALID");
  process.exit(1);
}
if (preflight?.ready_for_fixture_preparation !== true) {
  console.error("AVANTIQO_MEDIA_CERTIFICATION_PREFLIGHT_NOT_READY");
  process.exit(1);
}
console.log(`AVANTIQO_MEDIA_CERTIFICATION_PREFLIGHT=${preflightPath}`);
'

node --env-file=.env.local scripts/prepare-avantiqo-owned-media-certification-fixtures.mjs
node --env-file=.env.local -e '
const fs = require("node:fs");
const fixturePath = process.env.AVANTIQO_MEDIA_CERTIFICATION_FIXTURES || "/tmp/avantiqo-media-certification-fixtures.json";
const fixtures = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
if (fixtures?.contract !== "AVANTIQO_OWNED_MEDIA_CERTIFICATION_FIXTURES_V1") {
  console.error("AVANTIQO_MEDIA_CERTIFICATION_FIXTURE_CONTRACT_INVALID");
  process.exit(1);
}
if (fixtures?.source_scope !== "BENCHMARK_ONLY" || fixtures?.provider_calls_added !== 0) {
  console.error("AVANTIQO_MEDIA_CERTIFICATION_FIXTURE_SCOPE_INVALID");
  process.exit(1);
}
if (fixtures?.lipsync_fixture?.normalized !== true || fixtures?.policy?.lipsync_input_normalized_locally_before_upload !== true) {
  console.error("AVANTIQO_MEDIA_CERTIFICATION_LIPSYNC_FIXTURE_NOT_NORMALIZED");
  process.exit(1);
}
if (!fixtures?.lipsync_video_source_url || !fixtures?.audio_source_url) {
  console.error("AVANTIQO_MEDIA_CERTIFICATION_LIPSYNC_FIXTURE_REQUIRED");
  process.exit(1);
}
console.log(`AVANTIQO_MEDIA_CERTIFICATION_FIXTURES=${fixturePath}`);
'

node --env-file=.env.local scripts/benchmark-avantiqo-owned-media-full.mjs
node --env-file=.env.local -e '
const fs = require("node:fs");
const reportPath = process.env.AVANTIQO_MEDIA_FULL_BENCHMARK_OUTPUT || "/tmp/avantiqo-owned-media-full-capability-benchmark.json";
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
const target = String(process.env.AVANTIQO_MEDIA_CERTIFICATION_CAPABILITY || "").trim();
if (target) {
  if (report?.resume?.targeted_retry_enabled !== true || report?.resume?.target_capability !== target) {
    console.error("AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_REPORT_INVALID");
    process.exit(1);
  }
  if (report?.summary?.capabilities_executed_this_run !== 1 || report?.resume?.capabilities_executed_this_run?.[0] !== target) {
    console.error("AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_EXECUTION_SCOPE_INVALID");
    process.exit(1);
  }
  const result = Array.isArray(report?.cases)
    ? report.cases.find((item) => item?.capability === target)
    : null;
  if (result?.mechanical_passed !== true) {
    console.error(`AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_FAILED:${target}`);
    process.exit(1);
  }
  console.log(`AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_PASSED=${target}`);
} else {
  if (report?.summary?.all_mechanical_checks_passed !== true) {
    console.error("AVANTIQO_MEDIA_CERTIFICATION_MECHANICAL_EVIDENCE_INCOMPLETE");
    process.exit(1);
  }
  if (report?.summary?.economics_evidence_complete !== true) {
    console.error("AVANTIQO_MEDIA_CERTIFICATION_ECONOMICS_EVIDENCE_INCOMPLETE");
    process.exit(1);
  }
}
console.log(`AVANTIQO_MEDIA_CERTIFICATION_REPORT=${reportPath}`);
console.log(`AVANTIQO_MEDIA_CERTIFICATION_REUSED=${Number(report?.summary?.capabilities_reused || 0)}`);
console.log(`AVANTIQO_MEDIA_CERTIFICATION_PRESERVED=${Number(report?.summary?.capabilities_preserved_without_execution || 0)}`);
console.log(`AVANTIQO_MEDIA_CERTIFICATION_EXECUTED_THIS_RUN=${Number(report?.summary?.capabilities_executed_this_run || 0)}`);
'

node --env-file=.env.local -e '
const fs = require("node:fs");
const reportPath = process.env.AVANTIQO_MEDIA_FULL_BENCHMARK_OUTPUT || "/tmp/avantiqo-owned-media-full-capability-benchmark.json";
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
if (report?.summary?.ready_for_human_quality_review === true) process.exit(0);
console.log("AVANTIQO_MEDIA_HUMAN_REVIEW_PACK=DEFERRED_UNTIL_FULL_MECHANICAL_AND_ECONOMICS_PASS");
process.exit(10);
' || HUMAN_REVIEW_GATE=$?
HUMAN_REVIEW_GATE=${HUMAN_REVIEW_GATE:-0}

if [ "$HUMAN_REVIEW_GATE" -eq 0 ]; then
  node --env-file=.env.local scripts/prepare-avantiqo-owned-media-human-review.mjs
  node --env-file=.env.local -e '
const fs = require("node:fs");
const reviewPath = process.env.AVANTIQO_MEDIA_HUMAN_REVIEW_OUTPUT || "/tmp/avantiqo-owned-media-human-review.json";
const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
if (review?.contract !== "AVANTIQO_OWNED_MEDIA_HUMAN_REVIEW_V1" || review?.capability_count !== 15) {
  console.error("AVANTIQO_MEDIA_CERTIFICATION_HUMAN_REVIEW_PACK_INVALID");
  process.exit(1);
}
if (review?.review_status !== "PENDING_HUMAN_REVIEW" || review?.activation_allowed !== false) {
  console.error("AVANTIQO_MEDIA_CERTIFICATION_HUMAN_REVIEW_STATE_INVALID");
  process.exit(1);
}
console.log(`AVANTIQO_MEDIA_HUMAN_REVIEW_PACK=${reviewPath}`);
'
elif [ "$HUMAN_REVIEW_GATE" -ne 10 ]; then
  exit "$HUMAN_REVIEW_GATE"
fi

echo "AVANTIQO_OWNED_MEDIA_LOCAL_CERTIFICATION_MEASUREMENT_COMPLETE"
if [ "$HUMAN_REVIEW_GATE" -eq 0 ]; then
  echo "HUMAN_REVIEW=PENDING"
else
  echo "HUMAN_REVIEW=DEFERRED"
fi
echo "PRODUCTION_ACTIVATION=FORBIDDEN_PENDING_HUMAN_QUALITY_AND_FINAL_CERTIFICATION"
