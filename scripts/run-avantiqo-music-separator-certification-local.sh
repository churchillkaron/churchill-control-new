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
ECONOMICS_OUTPUT="$RUN_ROOT/music-separator-economics.json"
HUMAN_REVIEW_OUTPUT="$RUN_ROOT/music-separator-human-review.json"

fail() {
  echo "AVANTIQO_MUSIC_SEPARATOR_LOCAL_CERTIFICATION=FAIL"
  echo "AVANTIQO_MUSIC_SEPARATOR_LOCAL_CERTIFICATION_REASON=$1"
  echo "AVANTIQO_MUSIC_SEPARATOR_PROVIDER_JOB_SUBMITTED_BY_FAILURE_HANDLER=false"
  echo "AVANTIQO_MUSIC_SEPARATOR_PRODUCTION_DEPLOY_PERFORMED=false"
  echo "AVANTIQO_MUSIC_SEPARATOR_PRICING_ACTIVATION_PERFORMED=false"
  echo "AVANTIQO_MUSIC_SEPARATOR_SECRET_VALUES_PRINTED=false"
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "$2"
}

approved() {
  [ "${!1:-}" = "YES" ] || fail "$1=YES_REQUIRED"
}

approved AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED
approved AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED
require_cmd git "GIT_REQUIRED"
require_cmd node "NODE_REQUIRED"
require_cmd ffmpeg "FFMPEG_REQUIRED"
require_cmd ffprobe "FFPROBE_REQUIRED"

branch="$(git branch --show-current)"
[ "$branch" = "main" ] || fail "MAIN_BRANCH_REQUIRED:$branch"
git fetch origin main >/dev/null 2>&1 || fail "FETCH_MAIN_FAILED"
git merge --ff-only origin/main >/dev/null 2>&1 || fail "FAST_FORWARD_MAIN_FAILED"

mkdir -p "$RUN_ROOT" "$FIXTURE_DIR" "$OUTPUT_DIR"
chmod 700 "$RUN_ROOT" "$FIXTURE_DIR" "$OUTPUT_DIR" 2>/dev/null || true

if ! node --input-type=module <<'NODE' >/dev/null 2>&1
await import("@next/env");
await import("@supabase/supabase-js");
NODE
then
  require_cmd npm "NPM_REQUIRED"
  npm install --no-save --package-lock=false @next/env@14.2.35 @supabase/supabase-js@2.105.4 >/dev/null \
    || fail "MUSIC_RUNTIME_DEPENDENCY_INSTALL_FAILED"
fi

AVANTIQO_PROJECT_ROOT="$ROOT_DIR" bash scripts/repair-avantiqo-runpod-env-local.sh >/tmp/avantiqo-music-separator-env-repair.log \
  || fail "RUNPOD_ENV_REPAIR_FAILED"
grep '^AVANTIQO_' /tmp/avantiqo-music-separator-env-repair.log || true

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

echo "AVANTIQO_MUSIC_SEPARATOR_LOCAL_FIXTURE_RIGHTS_OWNED=true"

AVANTIQO_MUSIC_SEPARATOR_PROVISION_APPROVED=YES \
AVANTIQO_MUSIC_SEPARATOR_CERTIFICATION_QUOTA_MODE=YES \
AVANTIQO_MUSIC_SEPARATOR_RUNPOD_WORKERS_MAX=0 \
AVANTIQO_MUSIC_SEPARATOR_RUNPOD_IDLE_TIMEOUT_SECONDS=5 \
node scripts/provision-avantiqo-music-separator-runpod-local.mjs --apply >"$PROVISION_OUTPUT"

node --input-type=module "$PROVISION_OUTPUT" <<'NODE'
import { readFileSync } from "node:fs";
const result = JSON.parse(readFileSync(process.argv[2], "utf8"));
const endpoint = result.separator_endpoint || {};
if (result.success !== true) throw new Error("AVANTIQO_MUSIC_SEPARATOR_PROVISION_REQUIRED");
if (endpoint.workers_min !== 0 || endpoint.workers_max !== 0) throw new Error("AVANTIQO_MUSIC_SEPARATOR_ENDPOINT_MUST_REST_0_0");
if ((endpoint.network_volume_ids || []).length !== 0) throw new Error("AVANTIQO_MUSIC_SEPARATOR_NETWORK_VOLUME_FORBIDDEN");
if (result.provider_job_submitted !== false) throw new Error("AVANTIQO_MUSIC_SEPARATOR_PROVISION_JOB_FORBIDDEN");
console.log("AVANTIQO_MUSIC_SEPARATOR_PARKED_ENDPOINT=PASS");
NODE

node scripts/preflight-avantiqo-music-separator-runpod-local.mjs >"$PREFLIGHT_OUTPUT"

AVANTIQO_RUNPOD_SAFE_LEASE_APPROVED=YES \
AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SPEND_APPROVED=YES \
AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_RIGHTS_APPROVED=YES \
AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_SOURCE_FILE="$SOURCE_WAV" \
AVANTIQO_MUSIC_SEPARATOR_BENCHMARK_OUTPUT="$BENCHMARK_OUTPUT" \
node scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs \
  --lane=music-separator \
  --ttl-ms=1800000 \
  -- \
  node scripts/benchmark-avantiqo-music-separator-safe-lease-local.mjs

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
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
await mkdir(process.env.OUTPUT_DIR, { recursive: true });
for (const [key, reference] of Object.entries(references)) {
  const prefix = "storage://creative-assets/";
  if (!String(reference).startsWith(prefix)) throw new Error(`MUSIC_SEPARATOR_REVIEW_REFERENCE_INVALID:${key}`);
  const storagePath = String(reference).slice(prefix.length);
  const { data, error } = await supabase.storage.from("creative-assets").download(storagePath);
  if (error) throw error;
  const extension = key.endsWith("mp3") ? "mp3" : "wav";
  await writeFile(`${process.env.OUTPUT_DIR}/${key}.${extension}`, Buffer.from(await data.arrayBuffer()));
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
NODE

echo "AVANTIQO_MUSIC_SEPARATOR_LOCAL_CERTIFICATION=PASS"
echo "AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_CONTRACT=AVANTIQO_RUNPOD_SAFE_LEASE_V2"
echo "AVANTIQO_MUSIC_SEPARATOR_SAFE_LEASE_LANE=music-separator"
echo "AVANTIQO_MUSIC_SEPARATOR_HUMAN_REVIEW=PENDING"
echo "AVANTIQO_MUSIC_SEPARATOR_PRODUCTION_ACTIVATION=false"
echo "AVANTIQO_MUSIC_SEPARATOR_PRICING_ACTIVATION=false"
echo "AVANTIQO_MUSIC_SEPARATOR_SECRET_VALUES_PRINTED=false"
