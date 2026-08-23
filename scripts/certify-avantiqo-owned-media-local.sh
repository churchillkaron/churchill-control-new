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

FIXTURES=${AVANTIQO_MEDIA_CERTIFICATION_FIXTURES:-/tmp/avantiqo-media-certification-fixtures.json}
REPORT=${AVANTIQO_MEDIA_FULL_BENCHMARK_OUTPUT:-/tmp/avantiqo-owned-media-full-capability-benchmark.json}

rm -f "$FIXTURES" "$REPORT"

node --env-file=.env.local scripts/prepare-avantiqo-owned-media-certification-fixtures.mjs
node --env-file=.env.local scripts/benchmark-avantiqo-owned-media-full.mjs

echo "AVANTIQO_OWNED_MEDIA_LOCAL_CERTIFICATION_MEASUREMENT_COMPLETE"
echo "FIXTURES=$FIXTURES"
echo "REPORT=$REPORT"
echo "PRODUCTION_ACTIVATION=FORBIDDEN_PENDING_HUMAN_QUALITY_AND_FINAL_CERTIFICATION"
