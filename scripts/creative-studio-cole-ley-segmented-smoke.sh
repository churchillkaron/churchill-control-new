#!/usr/bin/env bash

set -u

SOURCE_REPO="${AVANTIQO_SOURCE_REPO:-$HOME/Projects/churchill-control-new}"
CREATIVE_WORKTREE="${AVANTIQO_CREATIVE_WORKTREE:-$HOME/Projects/churchill-control-creative}"
TARGET_BRANCH="agent/creative-world-class-hardening"
PORT="${CREATIVE_SMOKE_PORT:-3011}"
BASE_URL="http://127.0.0.1:${PORT}"
SERVER_LOG="/tmp/avantiqo-cole-segmented-server.log"
ORGANIZATION_ID="9550b843-b83c-4d15-b02d-a0b5ca23346e"
BUCKET_LIMIT_BYTES="47185920"
DIRECT_UPLOAD_BYTES="43000000"
SEGMENT_SECONDS="36"
SEGMENT_DIR="$HOME/Downloads/cole-ley-segmented-ingest"
STAMP="$(date +%Y%m%d_%H%M%S)"
REPORT="$HOME/Downloads/COLE_LEY_AVANTIQO_3MIN_SMOKE_${STAMP}.json"
MANIFEST="$HOME/Downloads/COLE_LEY_SEGMENT_MANIFEST_${STAMP}.tsv"
LOGO_FILE="$HOME/Downloads/cole-logo1.png"

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

probe_duration() {
  local ffprobe="$1"
  local file="$2"
  "$ffprobe" \
    -v error \
    -show_entries format=duration \
    -of default=nw=1:nk=1 \
    "$file" \
    2>/dev/null \
    | head -1
}

probe_stream() {
  local ffprobe="$1"
  local file="$2"
  local selector="$3"
  "$ffprobe" \
    -v error \
    -select_streams "$selector" \
    -show_entries stream=codec_name \
    -of default=nw=1:nk=1 \
    "$file" \
    2>/dev/null \
    | head -1
}

wait_for_server() {
  local attempt status
  for attempt in $(seq 1 90); do
    status="$(curl -sS -o /dev/null -w '%{http_code}' "$BASE_URL/" 2>/dev/null || true)"
    case "$status" in
      2*|3*|4*) return 0 ;;
    esac
    sleep 1
  done
  return 1
}

candidate_starts() {
  local duration="$1"
  node -e '
    const duration = Number(process.argv[1]);
    const segment = Number(process.argv[2]);
    if (!Number.isFinite(duration) || duration <= 0) process.exit(1);
    const usable = Math.max(0, duration - segment);
    let factors;
    if (duration <= segment + 1) factors = [0];
    else if (duration <= 90) factors = [0, 1];
    else if (duration <= 240) factors = [0.08, 0.48, 0.92];
    else if (duration <= 600) factors = [0.06, 0.35, 0.65, 0.94];
    else factors = [0.07, 0.36, 0.65, 0.94];
    const starts = [];
    for (const factor of factors) {
      const value = Math.max(0, Math.min(usable, usable * factor));
      if (!starts.some((entry) => Math.abs(entry - value) < 2)) starts.push(value);
    }
    for (const value of starts) console.log(value.toFixed(3));
  ' "$duration" "$SEGMENT_SECONDS"
}

expected_clip_duration() {
  local source_duration="$1"
  local start="$2"
  node -e '
    const source = Number(process.argv[1]);
    const start = Number(process.argv[2]);
    const requested = Number(process.argv[3]);
    console.log(Math.max(0, Math.min(requested, source - start)).toFixed(3));
  ' "$source_duration" "$start" "$SEGMENT_SECONDS"
}

segment_name() {
  local source="$1"
  local start="$2"
  local base seconds
  base="$(basename "${source%.*}")"
  seconds="$(node -e 'console.log(String(Math.round(Number(process.argv[1]))).padStart(6,"0"))' "$start")"
  printf '%s/%s__s%s__d%s.mp4\n' "$SEGMENT_DIR" "$base" "$seconds" "$SEGMENT_SECONDS"
}

verify_segment() {
  local source="$1"
  local output="$2"
  local ffprobe="$3"
  local expected="$4"
  local size duration video_codec audio_codec

  [ -s "$output" ] || return 1
  size="$(stat -f '%z' "$output")"
  [ "$size" -le "$BUCKET_LIMIT_BYTES" ] || return 1

  duration="$(probe_duration "$ffprobe" "$output")"
  video_codec="$(probe_stream "$ffprobe" "$output" "v:0")"
  audio_codec="$(probe_stream "$ffprobe" "$output" "a:0")"

  [ -n "$video_codec" ] || return 1
  [ -n "$audio_codec" ] || return 1

  node -e '
    const actual = Number(process.argv[1]);
    const expected = Number(process.argv[2]);
    if (!Number.isFinite(actual) || !Number.isFinite(expected)) process.exit(1);
    process.exit(Math.abs(actual - expected) <= 1.25 ? 0 : 1);
  ' "$duration" "$expected" || return 1

  echo "SEGMENT_VALIDATED=$(basename "$output") BYTES=$size SECONDS=$duration VIDEO_CODEC=$video_codec AUDIO_CODEC=$audio_codec"
  return 0
}

encode_segment() {
  local source="$1"
  local output="$2"
  local start="$3"
  local expected="$4"
  local ffmpeg="$5"
  local ffprobe="$6"
  local filter

  if verify_segment "$source" "$output" "$ffprobe" "$expected"; then
    echo "SEGMENT_REUSED=$(basename "$output")"
    return 0
  fi

  rm -f "$output"
  filter="scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,scale=trunc(iw/2)*2:trunc(ih/2)*2,setsar=1,format=yuv420p,fps=30000/1001,setpts=N/(30000/1001*TB)"

  echo "SEGMENT_ENCODING=$(basename "$source") START=$start DURATION=$expected OUTPUT=$(basename "$output")"

  "$ffmpeg" \
    -hide_banner \
    -loglevel warning \
    -stats \
    -y \
    -ss "$start" \
    -t "$expected" \
    -fflags +genpts+discardcorrupt \
    -analyzeduration 200M \
    -probesize 200M \
    -i "$source" \
    -map "0:v:0" \
    -map "0:a:0?" \
    -sn \
    -dn \
    -vf "$filter" \
    -af "aresample=async=1:first_pts=0" \
    -c:v libx264 \
    -preset fast \
    -crf 19 \
    -maxrate 7600k \
    -bufsize 15200k \
    -profile:v high \
    -level:v 4.1 \
    -c:a aac \
    -b:a 192k \
    -ar 48000 \
    -movflags +faststart \
    -avoid_negative_ts make_zero \
    -shortest \
    "$output" \
    || return 1

  verify_segment "$source" "$output" "$ffprobe" "$expected"
}

echo "============================================================"
echo "AVANTIQO SEGMENTED COLE LEY SMOKE"
echo "============================================================"
echo "FULL_FILE_COMPRESSION=DISABLED"
echo "LONG_VIDEO_MODE=SHORT_VALIDATED_CANDIDATE_SEGMENTS"
echo "SOURCE_REPO=$SOURCE_REPO"
echo "CREATIVE_WORKTREE=$CREATIVE_WORKTREE"

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

cp "$SOURCE_REPO/.env.local" "$CREATIVE_WORKTREE/.env.local" || fail "Could not copy .env.local"
chmod 600 "$CREATIVE_WORKTREE/.env.local"
[ ! -f "$SOURCE_REPO/.env" ] || cp "$SOURCE_REPO/.env" "$CREATIVE_WORKTREE/.env"

if [ ! -e "$CREATIVE_WORKTREE/node_modules" ]; then
  [ -d "$SOURCE_REPO/node_modules" ] || fail "node_modules missing from source repository"
  ln -s "$SOURCE_REPO/node_modules" "$CREATIVE_WORKTREE/node_modules" || fail "Could not link node_modules"
fi

cd "$CREATIVE_WORKTREE" || fail "Could not enter isolated Creative worktree"

echo "ISOLATED_COMMIT=$(git rev-parse --short HEAD)"
echo "SHARED_REPOSITORY_BRANCH_UNTOUCHED=$(git -C "$SOURCE_REPO" branch --show-current)"

FFMPEG_PATH="$(read_env_value CREATIVE_MEDIA_FFMPEG_PATH .env.local)"
FFPROBE_PATH="$(read_env_value CREATIVE_MEDIA_FFPROBE_PATH .env.local)"
[ -x "$FFMPEG_PATH" ] || fail "FFmpeg is not executable: $FFMPEG_PATH"
[ -x "$FFPROBE_PATH" ] || fail "FFprobe is not executable: $FFPROBE_PATH"

mkdir -p "$SEGMENT_DIR"
printf 'source\tasset\tstart_seconds\tduration_seconds\tbytes\n' > "$MANIFEST"
UPLOAD_VIDEOS=()

for source in "${SOURCE_VIDEOS[@]}"; do
  source_size="$(stat -f '%z' "$source")"
  source_duration="$(probe_duration "$FFPROBE_PATH" "$source")"

  [ -n "$source_duration" ] || fail "Duration unavailable for $(basename "$source")"

  if [ "$source_size" -le "$DIRECT_UPLOAD_BYTES" ]; then
    video_codec="$(probe_stream "$FFPROBE_PATH" "$source" "v:0")"
    audio_codec="$(probe_stream "$FFPROBE_PATH" "$source" "a:0")"
    [ -n "$video_codec" ] || fail "Video stream missing: $(basename "$source")"
    [ -n "$audio_codec" ] || fail "Audio stream missing: $(basename "$source")"
    echo "DIRECT_SOURCE_VALIDATED=$(basename "$source") BYTES=$source_size SECONDS=$source_duration"
    UPLOAD_VIDEOS+=("$source")
    printf '%s\t%s\t0\t%s\t%s\n' "$source" "$source" "$source_duration" "$source_size" >> "$MANIFEST"
    continue
  fi

  echo "SOURCE_SEGMENTATION=$(basename "$source") BYTES=$source_size SECONDS=$source_duration"

  while IFS= read -r start; do
    [ -n "$start" ] || continue
    expected="$(expected_clip_duration "$source_duration" "$start")"
    output="$(segment_name "$source" "$start")"

    encode_segment "$source" "$output" "$start" "$expected" "$FFMPEG_PATH" "$FFPROBE_PATH" \
      || fail "Segment encode/validation failed: $(basename "$source") start=$start"

    output_size="$(stat -f '%z' "$output")"
    UPLOAD_VIDEOS+=("$output")
    printf '%s\t%s\t%s\t%s\t%s\n' "$source" "$output" "$start" "$expected" "$output_size" >> "$MANIFEST"
  done < <(candidate_starts "$source_duration")
done

[ "${#UPLOAD_VIDEOS[@]}" -ge "${#SOURCE_VIDEOS[@]}" ] || fail "Insufficient validated ingest assets"

echo "ALL_INGEST_ASSETS_VALIDATED=YES"
echo "INGEST_ASSET_COUNT=${#UPLOAD_VIDEOS[@]}"
echo "SEGMENT_MANIFEST=$MANIFEST"

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
      *) fail "Unexpected process uses port $PORT: $command" ;;
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
NODE

  AUTH_STATUS=$?
  unset AUTH_PASSWORD
  [ "$AUTH_STATUS" -eq 0 ] || {
    rm -f "$AUTH_FILE"
    fail "Authentication failed"
  }

  export CREATIVE_SMOKE_BEARER_TOKEN="$(cat "$AUTH_FILE")"
  rm -f "$AUTH_FILE"
  echo "AUTH_BOOTSTRAP=PASS"
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
echo "LAUNCHING SEGMENTED AVANTIQO COLE LEY MISSION"
echo "============================================================"
echo "FULL_FILE_COMPRESSION=NO"
echo "ORIGINALS_PRESERVED=YES"
echo "FINANCE_BRANCH_CAN_INTERRUPT=NO"

npm run smoke:creative-cole-live
SMOKE_STATUS=$?

echo "============================================================"
echo "COLE_LEY_LIVE_SMOKE_STATUS=$SMOKE_STATUS"
echo "REPORT=$REPORT"
echo "SEGMENT_MANIFEST=$MANIFEST"
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
exit 0
