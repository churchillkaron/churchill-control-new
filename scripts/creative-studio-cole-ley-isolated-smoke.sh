#!/usr/bin/env bash

set -u

SOURCE_REPO="${AVANTIQO_SOURCE_REPO:-$HOME/Projects/churchill-control-new}"
CREATIVE_WORKTREE="${AVANTIQO_CREATIVE_WORKTREE:-$HOME/Projects/churchill-control-creative}"
TARGET_BRANCH="agent/creative-world-class-hardening"
PORT="${CREATIVE_SMOKE_PORT:-3011}"
BASE_URL="http://127.0.0.1:${PORT}"
SERVER_LOG="/tmp/avantiqo-cole-isolated-server.log"
ORGANIZATION_ID="9550b843-b83c-4d15-b02d-a0b5ca23346e"
BUCKET_LIMIT_BYTES="47185920"
PROXY_TARGET_BYTES="43000000"
PROXY_DIR="$HOME/Downloads/cole-ley-ingest-proxies"
STAMP="$(date +%Y%m%d_%H%M%S)"
REPORT="$HOME/Downloads/COLE_LEY_AVANTIQO_3MIN_SMOKE_${STAMP}.json"
LOGO_FILE="$HOME/Downloads/cole-logo1.png"
CREATED_PROXY=""

SOURCE_VIDEOS=(
  "$HOME/Downloads/IMG_0013.MOV"
  "$HOME/Downloads/IMG_0021.MOV"
  "$HOME/Downloads/IMG_0023.MOV"
  "$HOME/Downloads/IMG_0973.MOV"
  "$HOME/Downloads/IMG_0974.MOV"
  "$HOME/Downloads/IMG_0975.MOV"
  "$HOME/Downloads/IMG_2622.MOV"
  "$HOME/Downloads/IMG_2628.MOV"
)

fail() {
  echo
  echo "STOP: $*"
  exit 1
}

read_env_value() {
  local name="$1"
  local file="$2"
  grep -E "^${name}=" "$file" 2>/dev/null \
    | tail -1 \
    | cut -d= -f2- \
    | sed 's/^"//;s/"$//;s/^'"'"'//;s/'"'"'$//'
}

wait_for_server() {
  local attempt status
  for attempt in $(seq 1 90); do
    status="$(
      curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/" 2>/dev/null || true
    )"
    case "$status" in
      2*|3*|4*) return 0 ;;
    esac
    sleep 1
  done
  return 1
}

probe_value() {
  local ffprobe="$1"
  local file="$2"
  local entry="$3"
  "$ffprobe" \
    -v error \
    -show_entries "$entry" \
    -of default=nw=1:nk=1 \
    "$file" \
    2>/dev/null \
    | head -1
}

verify_proxy() {
  local source="$1"
  local proxy="$2"
  local ffprobe="$3"
  local source_duration proxy_duration proxy_size video_codec audio_codec

  [ -s "$proxy" ] || return 1

  proxy_size="$(stat -f '%z' "$proxy")"
  [ "$proxy_size" -le "$BUCKET_LIMIT_BYTES" ] || return 1

  source_duration="$(probe_value "$ffprobe" "$source" "format=duration")"
  proxy_duration="$(probe_value "$ffprobe" "$proxy" "format=duration")"
  video_codec="$(probe_value "$ffprobe" "$proxy" "stream=codec_name:stream_tags=handler_name" | head -1)"
  audio_codec="$(
    "$ffprobe" \
      -v error \
      -select_streams a:0 \
      -show_entries stream=codec_name \
      -of default=nw=1:nk=1 \
      "$proxy" \
      2>/dev/null \
      | head -1
  )"

  [ -n "$video_codec" ] || return 1
  [ -n "$audio_codec" ] || return 1

  node -e '
    const source = Number(process.argv[1]);
    const proxy = Number(process.argv[2]);
    if (!Number.isFinite(source) || !Number.isFinite(proxy)) process.exit(1);
    process.exit(Math.abs(source - proxy) <= 0.75 ? 0 : 1);
  ' "$source_duration" "$proxy_duration" || return 1

  echo "INGEST_PROXY_VALIDATED=$(basename "$proxy") BYTES=$proxy_size SOURCE_SECONDS=$source_duration PROXY_SECONDS=$proxy_duration VIDEO_CODEC=$video_codec AUDIO_CODEC=$audio_codec"
  return 0
}

calculate_video_bitrate() {
  local duration="$1"
  node -e '
    const bytes = Number(process.argv[1]);
    const duration = Number(process.argv[2]);
    const audioKbps = 128;
    const containerReserveKbps = 32;
    if (!Number.isFinite(bytes) || !Number.isFinite(duration) || duration <= 0) process.exit(1);
    const totalKbps = bytes * 8 / duration / 1000;
    console.log(Math.max(320, Math.floor(totalKbps - audioKbps - containerReserveKbps)));
  ' "$PROXY_TARGET_BYTES" "$duration"
}

encode_two_pass() {
  local source="$1"
  local output="$2"
  local ffmpeg="$3"
  local bitrate="$4"
  local passlog="$5"
  local filter

  filter="scale=1280:1280:force_original_aspect_ratio=decrease:flags=lanczos,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p"

  rm -f "$output" "${passlog}"* 2>/dev/null || true

  echo "ENCODE_PASS=1 SOURCE=$(basename "$source") VIDEO_KBPS=$bitrate"

  "$ffmpeg" \
    -hide_banner \
    -loglevel warning \
    -stats \
    -y \
    -i "$source" \
    -map "0:v:0" \
    -an \
    -sn \
    -dn \
    -vf "$filter" \
    -c:v libx264 \
    -preset fast \
    -profile:v high \
    -level:v 4.1 \
    -x264-params "weightp=1" \
    -b:v "${bitrate}k" \
    -pass 1 \
    -passlogfile "$passlog" \
    -f null \
    /dev/null \
    || return 1

  echo "ENCODE_PASS=2 SOURCE=$(basename "$source") VIDEO_KBPS=$bitrate"

  "$ffmpeg" \
    -hide_banner \
    -loglevel warning \
    -stats \
    -y \
    -i "$source" \
    -map "0:v:0" \
    -map "0:a:0?" \
    -sn \
    -dn \
    -vf "$filter" \
    -c:v libx264 \
    -preset fast \
    -profile:v high \
    -level:v 4.1 \
    -x264-params "weightp=1" \
    -b:v "${bitrate}k" \
    -pass 2 \
    -passlogfile "$passlog" \
    -c:a aac \
    -b:a 128k \
    -ar 48000 \
    -movflags +faststart \
    -color_primaries bt709 \
    -color_trc bt709 \
    -colorspace bt709 \
    "$output" \
    || return 1

  rm -f "${passlog}"* 2>/dev/null || true
  return 0
}

create_ingest_proxy() {
  local source="$1"
  local ffmpeg="$2"
  local ffprobe="$3"
  local base output duration bitrate passlog output_size retry_bitrate

  CREATED_PROXY=""
  base="$(basename "${source%.*}")"
  output="$PROXY_DIR/${base}_INGEST.mp4"

  if verify_proxy "$source" "$output" "$ffprobe"; then
    echo "INGEST_PROXY_REUSED=$(basename "$output")"
    CREATED_PROXY="$output"
    return 0
  fi

  duration="$(probe_value "$ffprobe" "$source" "format=duration")"
  bitrate="$(calculate_video_bitrate "$duration")" || return 1
  passlog="$PROXY_DIR/.${base}-pass"

  echo "CREATING_INGEST_PROXY=$(basename "$source") TARGET_VIDEO_KBPS=$bitrate"

  encode_two_pass \
    "$source" \
    "$output" \
    "$ffmpeg" \
    "$bitrate" \
    "$passlog" \
    || return 1

  output_size="$(stat -f '%z' "$output")"

  if [ "$output_size" -gt "$BUCKET_LIMIT_BYTES" ]; then
    retry_bitrate="$(
      node -e '
        const bitrate = Number(process.argv[1]);
        const actual = Number(process.argv[2]);
        const target = Number(process.argv[3]);
        console.log(Math.max(280, Math.floor(bitrate * target / actual * 0.95)));
      ' "$bitrate" "$output_size" "$PROXY_TARGET_BYTES"
    )"

    echo "INGEST_PROXY_RETRY=$(basename "$source") VIDEO_KBPS=$retry_bitrate"

    encode_two_pass \
      "$source" \
      "$output" \
      "$ffmpeg" \
      "$retry_bitrate" \
      "$passlog" \
      || return 1
  fi

  verify_proxy "$source" "$output" "$ffprobe" || return 1
  CREATED_PROXY="$output"
  return 0
}

echo "============================================================"
echo "AVANTIQO ISOLATED COLE LEY SMOKE"
echo "============================================================"

echo "SOURCE_REPO=$SOURCE_REPO"
echo "CREATIVE_WORKTREE=$CREATIVE_WORKTREE"
echo "TARGET_BRANCH=$TARGET_BRANCH"

[ -d "$SOURCE_REPO/.git" ] || fail "Source repository not found: $SOURCE_REPO"
[ -s "$SOURCE_REPO/.env.local" ] || fail ".env.local missing from source repository"

for file in "${SOURCE_VIDEOS[@]}" "$LOGO_FILE"; do
  [ -s "$file" ] || fail "Missing or empty source file: $file"
done

git -C "$SOURCE_REPO" fetch origin "$TARGET_BRANCH" || fail "Could not fetch Creative branch"

if git -C "$CREATIVE_WORKTREE" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  if [ -n "$(git -C "$CREATIVE_WORKTREE" status --porcelain --untracked-files=no)" ]; then
    fail "Dedicated Creative worktree contains tracked changes"
  fi
  git -C "$CREATIVE_WORKTREE" fetch origin "$TARGET_BRANCH" || fail "Could not update Creative worktree"
  git -C "$CREATIVE_WORKTREE" checkout --detach "origin/$TARGET_BRANCH" || fail "Could not detach Creative worktree"
  git -C "$CREATIVE_WORKTREE" reset --hard "origin/$TARGET_BRANCH" || fail "Could not reset Creative worktree"
else
  if [ -e "$CREATIVE_WORKTREE" ] && [ -n "$(ls -A "$CREATIVE_WORKTREE" 2>/dev/null)" ]; then
    fail "Creative worktree path exists and is not empty: $CREATIVE_WORKTREE"
  fi
  rm -rf "$CREATIVE_WORKTREE"
  git -C "$SOURCE_REPO" worktree prune
  git -C "$SOURCE_REPO" worktree add --detach "$CREATIVE_WORKTREE" "origin/$TARGET_BRANCH" \
    || fail "Could not create isolated Creative worktree"
fi

cp "$SOURCE_REPO/.env.local" "$CREATIVE_WORKTREE/.env.local" \
  || fail "Could not copy .env.local"
chmod 600 "$CREATIVE_WORKTREE/.env.local"

if [ -f "$SOURCE_REPO/.env" ]; then
  cp "$SOURCE_REPO/.env" "$CREATIVE_WORKTREE/.env"
fi

if [ ! -e "$CREATIVE_WORKTREE/node_modules" ]; then
  [ -d "$SOURCE_REPO/node_modules" ] || fail "node_modules missing from source repository"
  ln -s "$SOURCE_REPO/node_modules" "$CREATIVE_WORKTREE/node_modules" \
    || fail "Could not link node_modules"
fi

cd "$CREATIVE_WORKTREE" || fail "Could not enter isolated Creative worktree"

echo "ISOLATED_COMMIT=$(git rev-parse --short HEAD)"
echo "SHARED_REPOSITORY_BRANCH_UNTOUCHED=$(git -C "$SOURCE_REPO" branch --show-current)"

FFMPEG_PATH="$(read_env_value CREATIVE_MEDIA_FFMPEG_PATH .env.local)"
FFPROBE_PATH="$(read_env_value CREATIVE_MEDIA_FFPROBE_PATH .env.local)"
[ -x "$FFMPEG_PATH" ] || fail "FFmpeg is not executable: $FFMPEG_PATH"
[ -x "$FFPROBE_PATH" ] || fail "FFprobe is not executable: $FFPROBE_PATH"

mkdir -p "$PROXY_DIR"
UPLOAD_VIDEOS=()
FIRST_PROXY_VALIDATED="NO"

for source in "${SOURCE_VIDEOS[@]}"; do
  source_size="$(stat -f '%z' "$source")"

  if [ "$source_size" -le "$PROXY_TARGET_BYTES" ]; then
    echo "DIRECT_INGEST_SOURCE=$(basename "$source") BYTES=$source_size"
    UPLOAD_VIDEOS+=("$source")
    continue
  fi

  create_ingest_proxy "$source" "$FFMPEG_PATH" "$FFPROBE_PATH" \
    || fail "Could not create and validate ingest proxy for $(basename "$source")"

  [ -s "$CREATED_PROXY" ] \
    || fail "Validated ingest proxy path missing for $(basename "$source")"

  UPLOAD_VIDEOS+=("$CREATED_PROXY")

  if [ "$FIRST_PROXY_VALIDATED" = "NO" ]; then
    FIRST_PROXY_VALIDATED="YES"
    echo "FIRST_PROXY_GATE=PASS"
  fi
done

[ "$FIRST_PROXY_VALIDATED" = "YES" ] \
  || fail "At least one validated proxy was expected"

export CREATIVE_MEDIA_ASSET_MAX_UPLOAD_BYTES="$BUCKET_LIMIT_BYTES"
export CREATIVE_ASSET_MAX_UPLOAD_BYTES="$BUCKET_LIMIT_BYTES"
export CREATIVE_MEDIA_RENDER_MAX_UPLOAD_BYTES="$BUCKET_LIMIT_BYTES"
export CREATIVE_MEDIA_DERIVATIVE_MAX_UPLOAD_BYTES="$BUCKET_LIMIT_BYTES"

npm run bootstrap:creative-storage || fail "Creative storage bootstrap failed"

rm -rf .next
NEXT_TELEMETRY_DISABLED=1 npm run build || fail "Creative production build failed"

PORT_PIDS="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
if [ -n "$PORT_PIDS" ]; then
  for pid in $PORT_PIDS; do
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    case "$command" in
      *"next start"*|*"next-server"*|*"standalone/server.js"*)
        kill "$pid" 2>/dev/null || true
        echo "STOPPED_OLD_CREATIVE_SERVER_PID=$pid"
        ;;
      *)
        fail "Unexpected process uses port $PORT: $command"
        ;;
    esac
  done
  sleep 2
fi

rm -f "$SERVER_LOG"
nohup npm run start -- -p "$PORT" > "$SERVER_LOG" 2>&1 &
SERVER_PID=$!
echo "SERVER_PID=$SERVER_PID"

wait_for_server || {
  tail -120 "$SERVER_LOG"
  fail "Isolated Creative server did not become ready"
}

echo "SERVER_READY=YES"
echo "BASE_URL=$BASE_URL"

if [ -z "${CREATIVE_SMOKE_BEARER_TOKEN:-}" ]; then
  AUTH_EMAIL="${CREATIVE_SMOKE_EMAIL:-patric@pcsphuket.com}"
  AUTH_FILE="$(mktemp)"
  SUPABASE_URL="$(read_env_value NEXT_PUBLIC_SUPABASE_URL .env.local)"
  SUPABASE_ANON_KEY="$(read_env_value NEXT_PUBLIC_SUPABASE_ANON_KEY .env.local)"

  [ -n "$SUPABASE_URL" ] || fail "NEXT_PUBLIC_SUPABASE_URL missing"
  [ -n "$SUPABASE_ANON_KEY" ] || fail "NEXT_PUBLIC_SUPABASE_ANON_KEY missing"

  printf "Supabase password for %s: " "$AUTH_EMAIL"
  IFS= read -r -s AUTH_PASSWORD
  echo

  SUPABASE_URL="$SUPABASE_URL" \
  SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
  CREATIVE_AUTH_EMAIL="$AUTH_EMAIL" \
  CREATIVE_AUTH_PASSWORD="$AUTH_PASSWORD" \
  CREATIVE_AUTH_OUTPUT="$AUTH_FILE" \
  node --input-type=module <<'NODE'
import fs from "node:fs/promises";
import WebSocket from "ws";
import { createClient } from "@supabase/supabase-js";

globalThis.WebSocket = WebSocket;

const client = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  },
);

const { data, error } = await client.auth.signInWithPassword({
  email: process.env.CREATIVE_AUTH_EMAIL,
  password: process.env.CREATIVE_AUTH_PASSWORD,
});

if (error) throw error;
if (!data.session?.access_token) throw new Error("AUTH_ACCESS_TOKEN_REQUIRED");

await fs.writeFile(
  process.env.CREATIVE_AUTH_OUTPUT,
  data.session.access_token,
  { encoding: "utf8", mode: 0o600 },
);

console.log("AUTH_BOOTSTRAP=PASS");
NODE

  AUTH_STATUS=$?
  unset AUTH_PASSWORD

  [ "$AUTH_STATUS" -eq 0 ] || {
    rm -f "$AUTH_FILE"
    fail "Authentication failed"
  }

  export CREATIVE_SMOKE_BEARER_TOKEN="$(cat "$AUTH_FILE")"
  rm -f "$AUTH_FILE"
else
  echo "AUTH_TOKEN=REUSED"
fi

[ -n "${CREATIVE_SMOKE_BEARER_TOKEN:-}" ] || fail "Creative bearer token missing"

export CREATIVE_SMOKE_BASE_URL="$BASE_URL"
export CREATIVE_SMOKE_ORGANIZATION_ID="$ORGANIZATION_ID"
export COLE_LEY_VIDEO_FILES="$(IFS=,; echo "${UPLOAD_VIDEOS[*]}")"
export COLE_LEY_LOGO_FILE="$LOGO_FILE"
export COLE_LEY_SMOKE_OUTPUT="$REPORT"
export CREATIVE_SMOKE_SEMANTIC_POLICY_JSON='{"version":"cole-ley-live-semantic-v2","service_id":"ai.image.analyze","provider_id":"openai","capability":"ai.image.analyze","model":"gpt-4.1-mini","minimum_confidence":85,"minimum_score":88,"require_audio_review":true,"required_checks":["identity_continuity","camera_plausibility","motion_cadence","performance_authenticity","lip_synchronisation","exposure_colour_and_texture","compression_consistency","shot_purpose","narrative_progression","pacing_and_transitions","emotional_arc","music_and_sound_design","mix_hierarchy_and_silence","brand_truth_and_claims","safe_area_and_channel_composition","detectable_synthetic_artifacts"]}'

echo "============================================================"
echo "LAUNCHING ISOLATED AVANTIQO COLE LEY MISSION"
echo "============================================================"
echo "UPLOAD_MODE=UPLOAD_SAFE_INGEST_COPIES"
echo "ORIGINALS_PRESERVED=YES"
echo "FINANCE_BRANCH_CAN_INTERRUPT=NO"

npm run smoke:creative-cole-live
SMOKE_STATUS=$?

echo "============================================================"
echo "COLE_LEY_LIVE_SMOKE_STATUS=$SMOKE_STATUS"
echo "REPORT=$REPORT"
echo "SERVER_PID=$SERVER_PID"
echo "SERVER_LOG=$SERVER_LOG"
echo "CREATIVE_WORKTREE=$CREATIVE_WORKTREE"
echo "============================================================"

if [ "$SMOKE_STATUS" -ne 0 ]; then
  echo
  echo "SERVER LOG"
  tail -160 "$SERVER_LOG"
  exit "$SMOKE_STATUS"
fi

echo "COLE_LEY_LIVE_SMOKE=MISSION_ACCEPTED"
echo "Keep the isolated Creative server running."
exit 0
