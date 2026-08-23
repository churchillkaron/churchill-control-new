#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if [ ! -f .env.local ]; then
  echo "AVANTIQO_MEDIA_CERTIFICATION_ENV_LOCAL_REQUIRED" >&2
  exit 1
fi

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
  if ! grep -Eq "^(export[[:space:]]+)?${name}=" .env.local; then
    echo "AVANTIQO_MEDIA_CERTIFICATION_ENV_MISSING:${name}" >&2
    exit 1
  fi
done

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

rm -f \
  /tmp/avantiqo-media-certification-fixtures.json \
  /tmp/avantiqo-owned-media-full-capability-benchmark.json

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
if (report?.summary?.all_mechanical_checks_passed !== true) {
  console.error("AVANTIQO_MEDIA_CERTIFICATION_MECHANICAL_EVIDENCE_INCOMPLETE");
  process.exit(1);
}
if (report?.summary?.economics_evidence_complete !== true) {
  console.error("AVANTIQO_MEDIA_CERTIFICATION_ECONOMICS_EVIDENCE_INCOMPLETE");
  process.exit(1);
}
if (report?.summary?.ready_for_human_quality_review !== true) {
  console.error("AVANTIQO_MEDIA_CERTIFICATION_NOT_READY_FOR_HUMAN_REVIEW");
  process.exit(1);
}
console.log(`AVANTIQO_MEDIA_CERTIFICATION_REPORT=${reportPath}`);
'

echo "AVANTIQO_OWNED_MEDIA_LOCAL_CERTIFICATION_MEASUREMENT_COMPLETE"
echo "PRODUCTION_ACTIVATION=FORBIDDEN_PENDING_HUMAN_QUALITY_AND_FINAL_CERTIFICATION"
