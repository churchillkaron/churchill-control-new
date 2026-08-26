#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

RUN_ROOT="${AVANTIQO_MUSIC_SEPARATOR_LOCAL_CERT_ROOT:-/tmp/avantiqo-music-separator-certification}"
FIXTURE_DIR="$RUN_ROOT/review-audio"
OUTPUT_DIR="$FIXTURE_DIR/outputs"
SOURCE_WAV="$FIXTURE_DIR/source-rights-owned.wav"
VOCAL_WAV="$FIXTURE_DIR/vocal-source.wav"
VOCAL_AIFF="$FIXTURE_DIR/vocal-source.aiff"
PROVISION_OUTPUT="$RUN_ROOT/music-separator-provision.json"
PREFLIGHT_OUTPUT="$RUN_ROOT/music-separator-preflight.json"
BENCHMARK_OUTPUT="$RUN_ROOT/music-separator-benchmark.json"
BENCHMARK_LOG="$RUN_ROOT/music-separator-benchmark.log"
ECONOMICS_OUTPUT="$RUN_ROOT/music-separator-economics.json"
HUMAN_REVIEW_OUTPUT="$RUN_ROOT/music-separator-human-review.json"
SUBMISSION_RECEIPT="$RUN_ROOT/music-separator-submission-receipt.json"

MUSIC_OWNED_PATHS=(
  "services/avantiqo-music-separator-engine"
  "scripts/run-avantiqo-music-separator-certification-local.sh"
  "scripts/certify-avantiqo-music-separator-local.sh"
  "scripts/run-avantiqo-music-separator-benchmark-local.mjs"
  "scripts/benchmark-avantiqo-music-separator.mjs"
  "scripts/avantiqo-music-separator-economics.mjs"
  "scripts/prepare-avantiqo-music-separator-human-review.mjs"
  "scripts/preflight-avantiqo-music-separator-runpod-local.mjs"
  "scripts/provision-avantiqo-music-separator-runpod-local.mjs"
  "audits/results/avantiqo-music-separator-worker-image.json"
  "lib/creative/runtime/engines/MusicEngine.js"
  "lib/platform/service-runtime/providers/avantiqo-audio/AvantiqoMusicSeparatorProvider.js"
)

fail() {
  echo "AVANTIQO_MUSIC_SEPARATOR_LOCAL_CERTIFICATION=FAIL"
  echo "AVANTIQO_MUSIC_SEPARATOR_LOCAL_CERTIFICATION_REASON=$1"
  echo "AVANTIQO_MUSIC_SEPARATOR_PROVIDER_JOB_SUBMITTED_BY_FAILURE_HANDLER=false"
  echo "AVANTIQO_MUSIC_SEPARATOR_PRODUCTION_DEPLOY_PERFORMED=false"
  echo "AVANTIQO_MUSIC_SEPARATOR_PRICING_ACTIVATION_PERFORMED=false"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "$2"
}

sync_main_before_spend() {
  git fetch origin main >/dev/null 2>&1 || fail "FETCH_MAIN_FAILED"
  local branch head remote relation ahead changed
  branch="$(git branch --show-current)"
  [ "$branch" = "main" ] || fail "MAIN_BRANCH_REQUIRED:$branch"
  head="$(git rev-parse HEAD)"
  remote="$(git rev-parse origin/main)"
  relation="$(git rev-list --left-right --count "$head...$remote")"
  ahead="$(printf '%s\n' "$relation" | awk '{print $1}')"
  [ "${ahead:-0}" = "0" ] || fail "LOCAL_MAIN_DIVERGED_FROM_ORIGIN_MAIN"
  if [ "$head" != "$remote" ]; then
    changed="$(git diff --name-only "$head" "$remote" -- "${MUSIC_OWNED_PATHS[@]}")"
    [ -z "$changed" ] || fail "MUSIC_INPUTS_CHANGED_ON_MAIN:$changed"
    git merge --ff-only origin/main >/dev/null 2>&1 || fail "FAST_FORWARD_MAIN_FAILED"
  fi
  git status --porcelain --untracked-files=no -- "${MUSIC_OWNED_PATHS[@]}" | grep -q . \
    && fail "MUSIC_OWNED_FILES_HAVE_LOCAL_CHANGES" || true
}

write_submission_receipt() {
  local status="$1"
  local job_id=""
  if [ -f "$BENCHMARK_LOG" ]; then
    job_id="$(awk -F= '/^AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_JOB_ID=/{print $2; exit}' "$BENCHMARK_LOG" | tr -d '\r\n')"
  fi
  if [ -n "$job_id" ]; then
    JOB_ID="$job_id" BENCHMARK_STATUS="$status" RECEIPT_PATH="$SUBMISSION_RECEIPT" node --input-type=module <<'NODE'
import { writeFile } from "node:fs/promises";
const receipt = {
  success: true,
  contract: "AVANTIQO_MUSIC_SEPARATOR_LOCAL_SUBMISSION_RECEIPT_V1",
  created_at: new Date().toISOString(),
  provider_job_submitted: true,
  job_id: process.env.JOB_ID,
  benchmark_exit_status: Number(process.env.BENCHMARK_STATUS || 0),
  production_deploy_performed: false,
  pricing_activation_performed: false,
  secrets_printed: false,
};
await writeFile(process.env.RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
NODE
  fi
}

require_cmd git "GIT_REQUIRED"
require_cmd node "NODE_REQUIRED"
require_cmd ffmpeg "FFMPEG_REQUIRED"
require_cmd ffprobe "FFPROBE_REQUIRED"
mkdir -p "$RUN_ROOT" "$FIXTURE_DIR" "$OUTPUT_DIR"
chmod 700 "$RUN_ROOT" "$FIXTURE_DIR" "$OUTPUT_DIR" 2>/dev/null || true

if [ -f "$SUBMISSION_RECEIPT" ]; then
  if node --input-type=module - "$SUBMISSION_RECEIPT" <<'NODE'
import { readFile } from "node:fs/promises";
const receipt = JSON.parse(await readFile(process.argv[2], "utf8"));
process.exit(receipt?.provider_job_submitted === true ? 0 : 1);
NODE
  then
    fail "EXISTING_PROVIDER_SUBMISSION_RECEIPT_REVIEW_REQUIRED:$SUBMISSION_RECEIPT"
  fi
fi

sync_main_before_spend

AVANTIQO_PROJECT_ROOT="$ROOT_DIR" bash scripts/repair-avantiqo-runpod-env-local.sh

rm -f "$VOCAL_WAV" "$VOCAL_AIFF" "$SOURCE_WAV"
if command -v espeak-ng >/dev/null 2>&1; then
  espeak-ng -s 138 -p 46 -a 155 -w "$VOCAL_WAV" \
    "Avantiqo music separator certification. Vocal isolation, backing track integrity, timing, drums, bass and accompaniment."
elif command -v say >/dev/null 2>&1; then
  say -r 138 -o "$VOCAL_AIFF" \
    "Avantiqo music separator certification. Vocal isolation, backing track integrity, timing, drums, bass and accompaniment."
  ffmpeg -loglevel error -y -i "$VOCAL_AIFF" -ar 44100 -ac 1 "$VOCAL_WAV"
else
  fail "VOICE_FIXTURE_SYNTHESIZER_REQUIRED_ESPEAK_OR_MACOS_SAY"
fi

ffmpeg -loglevel error -y \
  -stream_loop -1 -i "$VOCAL_WAV" \
  -f lavfi -i "sine=frequency=110:sample_rate=44100:duration=32" \
  -f lavfi -i "sine=frequency=220:sample_rate=44100:duration=32" \
  -f lavfi -i "sine=frequency=330:sample_rate=44100:duration=32" \
  -f lavfi -i "anoisesrc=color=pink:sample_rate=44100:duration=32" \
  -filter_complex "[0:a]atrim=0:32,volume=0.9[v];[1:a]volume=0.16[b];[2:a]volume=0.09[o1];[3:a]volume=0.07[o2];[4:a]highpass=f=1200,lowpass=f=9000,volume=0.035[n];[v][b][o1][o2][n]amix=inputs=5:duration=first:normalize=0,alimiter=limit=0.92,aresample=44100[a]" \
  -map "[a]" -ac 2 -c:a pcm_s24le "$SOURCE_WAV"

SOURCE_DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$SOURCE_WAV")"
echo "AVANTIQO_MUSIC_SEPARATOR_LOCAL_FIXTURE_DURATION_SECONDS=$SOURCE_DURATION"
echo "AVANTIQO_MUSIC_SEPARATOR_LOCAL_FIXTURE_RIGHTS_OWNED=true"

echo "AVANTIQO_MUSIC_SEPARATOR_LOCAL_CERTIFICATION_PROVISION=START"
AVANTIQO_MUSIC_SEPARATOR_PROVISION_APPROVED=YES \
AVANTIQO_MUSIC_SEPARATOR_RUNPOD_WORKERS_MAX=1 \
AVANTIQO_MUSIC_SEPARATOR_RUNPOD_IDLE_TIMEOUT_SECONDS=5 \
node scripts/provision-avantiqo-music-separator-runpod-local.mjs --apply | tee "$PROVISION_OUTPUT"

node scripts/preflight-avantiqo-music-separator-runpod-local.mjs | tee "$PREFLIGHT_OUTPUT"

# Recheck main immediately before the one permitted provider submission. Unrelated
# concurrent work is fast-forwarded; any Music-owned change aborts before spend.
sync_main_before_spend

rm -f "$BENCHMARK_LOG" "$BENCHMARK_OUTPUT"
set +e
AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED=YES \
AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED=YES \
AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SOURCE_FILE="$SOURCE_WAV" \
AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_OUTPUT="$BENCHMARK_OUTPUT" \
node scripts/run-avantiqo-music-separator-benchmark-local.mjs 2>&1 | tee "$BENCHMARK_LOG"
BENCHMARK_STATUS=${PIPESTATUS[0]}
set -e
write_submission_receipt "$BENCHMARK_STATUS"
[ "$BENCHMARK_STATUS" -eq 0 ] || fail "CONTROLLED_BENCHMARK_FAILED:exit=$BENCHMARK_STATUS"

AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_OUTPUT="$BENCHMARK_OUTPUT" \
AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_OUTPUT="$ECONOMICS_OUTPUT" \
AVANTIQO_MUSIC_SEPARATOR_BILLED_GPU_COUNT=1 \
AVANTIQO_MUSIC_SEPARATOR_TARGET_UTILIZATION=1 \
node scripts/avantiqo-music-separator-economics.mjs

AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_OUTPUT="$BENCHMARK_OUTPUT" \
AVANTIQO_MUSIC_SEPARATOR_ECONOMICS_OUTPUT="$ECONOMICS_OUTPUT" \
AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW_OUTPUT="$HUMAN_REVIEW_OUTPUT" \
node scripts/prepare-avantiqo-music-separator-human-review.mjs

BENCHMARK_PATH="$BENCHMARK_OUTPUT" OUTPUT_DIR="$OUTPUT_DIR" node --input-type=module <<'NODE'
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { loadAvantiqoEnv } from "./scripts/load-avantiqo-env.mjs";
import { createClient } from "@supabase/supabase-js";

loadAvantiqoEnv();
const benchmark = JSON.parse(await readFile(process.env.BENCHMARK_PATH, "utf8"));
const references = benchmark?.observations?.[0]?.storage_references || {};
if (!Object.keys(references).length) throw new Error("MUSIC_SEPARATOR_REVIEW_OUTPUT_REFERENCES_REQUIRED");
const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!supabaseUrl || !serviceRoleKey) throw new Error("MUSIC_SEPARATOR_REVIEW_SUPABASE_BINDINGS_REQUIRED");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
await mkdir(process.env.OUTPUT_DIR, { recursive: true });
for (const [key, reference] of Object.entries(references)) {
  const prefix = "storage://creative-assets/";
  if (!String(reference).startsWith(prefix)) throw new Error(`MUSIC_SEPARATOR_REVIEW_REFERENCE_INVALID:${key}`);
  const path = String(reference).slice(prefix.length);
  const { data, error } = await supabase.storage.from("creative-assets").download(path);
  if (error) throw error;
  const bytes = Buffer.from(await data.arrayBuffer());
  const extension = key.endsWith("mp3") ? "mp3" : "wav";
  await writeFile(`${process.env.OUTPUT_DIR}/${key}.${extension}`, bytes);
}
NODE

BENCHMARK_PATH="$BENCHMARK_OUTPUT" ECONOMICS_PATH="$ECONOMICS_OUTPUT" REVIEW_PATH="$HUMAN_REVIEW_OUTPUT" node --input-type=module <<'NODE'
import { readFile } from "node:fs/promises";
const benchmark = JSON.parse(await readFile(process.env.BENCHMARK_PATH, "utf8"));
const economics = JSON.parse(await readFile(process.env.ECONOMICS_PATH, "utf8"));
const review = JSON.parse(await readFile(process.env.REVIEW_PATH, "utf8"));
if (benchmark?.summary?.passed !== true) throw new Error("MUSIC_SEPARATOR_TECHNICAL_BENCHMARK_REQUIRED");
if (economics?.certification?.economics_measured !== true) throw new Error("MUSIC_SEPARATOR_ECONOMICS_REQUIRED");
if (review?.review_status !== "PENDING") throw new Error("MUSIC_SEPARATOR_HUMAN_REVIEW_MUST_REMAIN_PENDING");
if (review?.automatic_human_approval_forbidden !== true) throw new Error("MUSIC_SEPARATOR_AUTO_HUMAN_APPROVAL_MUST_BE_FORBIDDEN");
if (benchmark?.certification?.production_certified !== false) throw new Error("MUSIC_SEPARATOR_BENCHMARK_MUST_NOT_CERTIFY_PRODUCTION");
if (economics?.pricing_activation_performed !== false) throw new Error("MUSIC_SEPARATOR_PRICING_MUST_NOT_ACTIVATE");
if (review?.activation_allowed !== false) throw new Error("MUSIC_SEPARATOR_REVIEW_MUST_NOT_ACTIVATE");
console.log("AVANTIQO_MUSIC_SEPARATOR_TECHNICAL_BENCHMARK=PASS");
console.log("AVANTIQO_MUSIC_SEPARATOR_ECONOMICS=MEASURED");
console.log("AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW=PENDING");
console.log("AVANTIQO_MUSIC_SEPARATOR_PRODUCTION_ACTIVATION=false");
NODE

echo "AVANTIQO_MUSIC_SEPARATOR_LOCAL_CERTIFICATION=HUMAN_REVIEW_REQUIRED"
echo "AVANTIQO_MUSIC_SEPARATOR_LOCAL_CERTIFICATION_ROOT=$RUN_ROOT"
echo "AVANTIQO_MUSIC_SEPARATOR_LOCAL_REVIEW_AUDIO_DIR=$OUTPUT_DIR"
echo "AVANTIQO_MUSIC_SEPARATOR_LOCAL_HUMAN_REVIEW_FILE=$HUMAN_REVIEW_OUTPUT"
echo "AVANTIQO_MUSIC_SEPARATOR_PRODUCTION_DEPLOY_PERFORMED=false"
echo "AVANTIQO_MUSIC_SEPARATOR_PRICING_ACTIVATION_PERFORMED=false"
echo "AVANTIQO_MUSIC_SEPARATOR_PROVIDER_CERTIFICATION_MUTATION_PERFORMED=false"
