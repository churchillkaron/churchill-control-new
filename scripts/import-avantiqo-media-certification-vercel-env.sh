#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

if [ ! -f .env.local ]; then
  echo "AVANTIQO_MEDIA_CERTIFICATION_ENV_LOCAL_REQUIRED" >&2
  exit 1
fi

command -v vercel >/dev/null 2>&1 || {
  echo "AVANTIQO_MEDIA_CERTIFICATION_VERCEL_CLI_REQUIRED" >&2
  exit 1
}
command -v node >/dev/null 2>&1 || {
  echo "AVANTIQO_MEDIA_CERTIFICATION_NODE_REQUIRED" >&2
  exit 1
}

TMP_VERCEL_ENV=$(mktemp "${TMPDIR:-/tmp}/avantiqo-vercel-media-env.XXXXXX")
TMP_LOCAL_ENV=$(mktemp "${TMPDIR:-/tmp}/avantiqo-local-media-env.XXXXXX")
trap 'rm -f "$TMP_VERCEL_ENV" "$TMP_LOCAL_ENV"' EXIT HUP INT TERM

vercel env pull "$TMP_VERCEL_ENV" --environment=production --yes >/dev/null

node_has_effective_local_value() {
  name="$1"
  env -u "$name" AVANTIQO_ENV_CHECK_NAME="$name" node --env-file=.env.local -e '
    const name = process.env.AVANTIQO_ENV_CHECK_NAME;
    const value = String(process.env[name] || "").trim();
    process.exit(value ? 0 : 1);
  ' >/dev/null 2>&1
}

IMPORTED_COUNT=0
REFRESHED_COUNT=0
NOT_IN_VERCEL_COUNT=0

for name in \
  RUNPOD_API_KEY \
  RUNPOD_MANAGEMENT_API_KEY \
  RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID \
  RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID \
  RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID \
  RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID \
  NEXT_PUBLIC_SUPABASE_URL \
  SUPABASE_SERVICE_ROLE_KEY \
  AVANTIQO_IMAGE_GPU_USD_PER_SECOND \
  AVANTIQO_VIDEO_GPU_USD_PER_SECOND \
  AVANTIQO_AUDIO_GPU_USD_PER_HOUR \
  AVANTIQO_LIPSYNC_GPU_USD_PER_SECOND
do
  if node_has_effective_local_value "$name"; then
    echo "AVANTIQO_MEDIA_CERTIFICATION_LOCAL_EFFECTIVE:${name}"
    continue
  fi

  SOURCE_LINE=$(grep -E "^(export[[:space:]]+)?${name}=.+$" "$TMP_VERCEL_ENV" | tail -n 1 || true)
  if [ -z "$SOURCE_LINE" ]; then
    echo "AVANTIQO_MEDIA_CERTIFICATION_NOT_IN_VERCEL:${name}"
    NOT_IN_VERCEL_COUNT=$((NOT_IN_VERCEL_COUNT + 1))
    continue
  fi

  if grep -Eq "^(export[[:space:]]+)?${name}=" .env.local; then
    REFRESHED_COUNT=$((REFRESHED_COUNT + 1))
    echo "AVANTIQO_MEDIA_CERTIFICATION_REFRESHING_INEFFECTIVE_LOCAL_VALUE:${name}"
  fi

  grep -Ev "^(export[[:space:]]+)?${name}=" .env.local > "$TMP_LOCAL_ENV" || true
  cat "$TMP_LOCAL_ENV" > .env.local
  printf '%s\n' "$SOURCE_LINE" >> .env.local
  chmod 600 .env.local

  if ! node_has_effective_local_value "$name"; then
    echo "AVANTIQO_MEDIA_CERTIFICATION_IMPORTED_VALUE_NOT_EFFECTIVE:${name}" >&2
    exit 1
  fi

  IMPORTED_COUNT=$((IMPORTED_COUNT + 1))
  echo "AVANTIQO_MEDIA_CERTIFICATION_IMPORTED_FROM_VERCEL:${name}"
done

echo "AVANTIQO_MEDIA_CERTIFICATION_IMPORTED_FROM_VERCEL_COUNT=${IMPORTED_COUNT}"
echo "AVANTIQO_MEDIA_CERTIFICATION_REFRESHED_INEFFECTIVE_COUNT=${REFRESHED_COUNT}"
echo "AVANTIQO_MEDIA_CERTIFICATION_NOT_IN_VERCEL_COUNT=${NOT_IN_VERCEL_COUNT}"
echo "AVANTIQO_MEDIA_CERTIFICATION_FACE_FIXTURES_LOCAL_ONLY=true"
echo "AVANTIQO_MEDIA_CERTIFICATION_SECRET_VALUES_PRINTED=false"
echo "AVANTIQO_MEDIA_CERTIFICATION_PRODUCTION_DEPLOY_PERFORMED=false"
