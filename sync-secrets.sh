#!/usr/bin/env bash
set -euo pipefail

REPO="churchillkaron/churchill-control-new"
ENV_FILE=".env.local"

# 1. Make sure gh is installed and logged in
command -v gh >/dev/null 2>&1 || brew install gh
gh auth status >/dev/null 2>&1 || gh auth login

KEYS=(
  RUNPOD_API_KEY
  RUNPOD_MANAGEMENT_API_KEY
  RUNPOD_AVANTIQO_IMAGE_API_KEY
  RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID
  RUNPOD_AVANTIQO_VIDEO_API_KEY
  RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID
  RUNPOD_AVANTIQO_AUDIO_ENDPOINT_ID
  RUNPOD_AVANTIQO_CODE_API_KEY
  RUNPOD_AVANTIQO_CODE_ENDPOINT_ID
  RUNPOD_AVANTIQO_INTELLIGENCE_API_KEY
  RUNPOD_AVANTIQO_INTELLIGENCE_ENDPOINT_ID
  RUNPOD_AVANTIQO_INTELLIGENCE_FAST_API_KEY
  RUNPOD_AVANTIQO_INTELLIGENCE_CANDIDATE_ENDPOINT_ID
  RUNPOD_AVANTIQO_INTELLIGENCE_TRAINER_ENDPOINT_ID
  RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID
  RUNPOD_AVANTIQO_VOICE_STT_ENDPOINT_ID
  RUNPOD_AVANTIQO_VOICE_TTS_ENDPOINT_ID
  HF_TOKEN
  NEXT_PUBLIC_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
  AVANTIQO_AUDIO_BENCHMARK_UPLOAD_URL
  AVANTIQO_AUDIO_BENCHMARK_STORAGE_REFERENCE
)

for key in "${KEYS[@]}"; do
  raw=$(grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d'=' -f2-) || true
  value="${raw%\"}"; value="${value#\"}"
  value="${value%\'}"; value="${value#\'}"

  if [ -z "$value" ]; then
    echo "SKIP (not found in $ENV_FILE): $key"
    continue
  fi

  printf '%s' "$value" | gh secret set "$key" --repo "$REPO"
  echo "SET: $key"
done

echo
echo "Done. Verify at: https://github.com/${REPO}/settings/secrets/actions"
