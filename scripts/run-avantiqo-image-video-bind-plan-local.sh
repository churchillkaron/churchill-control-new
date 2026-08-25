#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if [ ! -f .env.local ]; then
  echo "AVANTIQO_IMAGE_VIDEO_BIND_PLAN_ENV_LOCAL_REQUIRED" >&2
  exit 1
fi

command -v node >/dev/null 2>&1 || {
  echo "AVANTIQO_IMAGE_VIDEO_BIND_PLAN_NODE_REQUIRED" >&2
  exit 1
}

node --check scripts/refresh-avantiqo-image-v6-runpod-worker-local.mjs
node --check scripts/bind-avantiqo-video-runpod-immutable-image-local.mjs

git fetch origin main
git merge --ff-only origin/main

if ! grep -Eq '^(export[[:space:]]+)?RUNPOD_MANAGEMENT_API_KEY=.+' .env.local && \
   ! grep -Eq '^(export[[:space:]]+)?RUNPOD_API_KEY=.+' .env.local; then
  echo "AVANTIQO_IMAGE_VIDEO_BIND_PLAN_IMPORTING_MEDIA_ENV=true"
  sh scripts/import-avantiqo-media-certification-vercel-env.sh
fi

ENV_ARGS="--env-file=.env.local"
IMAGE_OUT="${TMPDIR:-/tmp}/avantiqo-image-bind-plan-local.txt"
VIDEO_OUT="${TMPDIR:-/tmp}/avantiqo-video-bind-plan-local.txt"

rm -f "$IMAGE_OUT" "$VIDEO_OUT"

set +e
node $ENV_ARGS scripts/refresh-avantiqo-image-runpod-worker-canonical-local.mjs >"$IMAGE_OUT" 2>&1
IMAGE_STATUS=$?
node $ENV_ARGS scripts/bind-avantiqo-video-runpod-immutable-image-local.mjs >"$VIDEO_OUT" 2>&1
VIDEO_STATUS=$?
set -e

cat "$IMAGE_OUT"
cat "$VIDEO_OUT"

printf '%s\n' "AVANTIQO_IMAGE_VIDEO_BIND_PLAN_IMAGE_STATUS=$IMAGE_STATUS"
printf '%s\n' "AVANTIQO_IMAGE_VIDEO_BIND_PLAN_VIDEO_STATUS=$VIDEO_STATUS"
printf '%s\n' "AVANTIQO_IMAGE_VIDEO_BIND_PLAN_RUNPOD_MUTATION=false"
printf '%s\n' "AVANTIQO_IMAGE_VIDEO_BIND_PLAN_IMAGE_GENERATION=false"
printf '%s\n' "AVANTIQO_IMAGE_VIDEO_BIND_PLAN_VIDEO_GENERATION=false"
printf '%s\n' "AVANTIQO_IMAGE_VIDEO_BIND_PLAN_MODEL_DOWNLOAD=false"
printf '%s\n' "AVANTIQO_IMAGE_VIDEO_BIND_PLAN_PRODUCTION_WEB_DEPLOY=false"
printf '%s\n' "AVANTIQO_IMAGE_VIDEO_BIND_PLAN_SECRET_VALUES_PRINTED=false"

if [ "$IMAGE_STATUS" -ne 0 ] || [ "$VIDEO_STATUS" -ne 0 ]; then
  exit 1
fi

echo "AVANTIQO_IMAGE_VIDEO_BIND_PLAN_LOCAL=PASS"
