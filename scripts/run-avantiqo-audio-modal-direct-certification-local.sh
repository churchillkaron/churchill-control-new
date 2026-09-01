#!/usr/bin/env bash
set -euo pipefail

CONTRACT="AVANTIQO_AUDIO_MODAL_DIRECT_CERT_WRAPPER_V1"
PINNED_MODAL_VERSION="0.10.0"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

MODE="preflight"
case "${1:-}" in
  "") MODE="preflight" ;;
  --execute) MODE="execute" ;;
  --resume) MODE="resume" ;;
  *) echo "${CONTRACT}_INVALID_ARGUMENT:${1}" >&2; exit 2 ;;
esac

if [[ ! -f "$ROOT/.env.local" ]]; then
  echo "${CONTRACT}_ENV_LOCAL_REQUIRED" >&2
  exit 1
fi
if [[ ! -d "$ROOT/node_modules" ]]; then
  echo "${CONTRACT}_LOCAL_NODE_MODULES_REQUIRED" >&2
  exit 1
fi

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-audio-modal-cert.XXXXXX")"
WORKTREE="$TMP_ROOT/origin-main"
BACKUP="$TMP_ROOT/package-backup"
mkdir -p "$BACKUP"

cp "$ROOT/package.json" "$BACKUP/package.json"
cp "$ROOT/package-lock.json" "$BACKUP/package-lock.json"

cleanup() {
  cp "$BACKUP/package.json" "$ROOT/package.json" 2>/dev/null || true
  cp "$BACKUP/package-lock.json" "$ROOT/package-lock.json" 2>/dev/null || true
  if [[ -e "$WORKTREE/.git" || -f "$WORKTREE/.git" ]]; then
    git -C "$ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

git fetch origin main
MAIN_SHA="$(git rev-parse origin/main)"
if [[ ! "$MAIN_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "${CONTRACT}_ORIGIN_MAIN_SHA_INVALID" >&2
  exit 1
fi

modal_version=""
if [[ -f "$ROOT/node_modules/modal/package.json" ]]; then
  modal_version="$(node -p "require('./node_modules/modal/package.json').version" 2>/dev/null || true)"
fi
if [[ "$modal_version" != "$PINNED_MODAL_VERSION" ]]; then
  echo "AVANTIQO_AUDIO_MODAL_JS_SDK_LOCAL_SYNC_START pinned=${PINNED_MODAL_VERSION} scripts=false"
  npm install \
    --no-save \
    --package-lock=false \
    --ignore-scripts \
    --no-audit \
    --no-fund \
    "modal@${PINNED_MODAL_VERSION}" >/dev/null
  modal_version="$(node -p "require('./node_modules/modal/package.json').version" 2>/dev/null || true)"
  if [[ "$modal_version" != "$PINNED_MODAL_VERSION" ]]; then
    echo "${CONTRACT}_MODAL_JS_SDK_VERSION_INVALID:${modal_version}" >&2
    exit 1
  fi
  echo "AVANTIQO_AUDIO_MODAL_JS_SDK_LOCAL_SYNC=PASS version=${modal_version} tracked_package_metadata_preserved=true"
fi

cp "$BACKUP/package.json" "$ROOT/package.json"
cp "$BACKUP/package-lock.json" "$ROOT/package-lock.json"

if ! cmp -s "$BACKUP/package.json" "$ROOT/package.json" || \
   ! cmp -s "$BACKUP/package-lock.json" "$ROOT/package-lock.json"; then
  echo "${CONTRACT}_LOCAL_PACKAGE_METADATA_PRESERVATION_FAILED" >&2
  exit 1
fi

git worktree add --detach "$WORKTREE" "$MAIN_SHA" >/dev/null
ln -s "$ROOT/node_modules" "$WORKTREE/node_modules"

OUTPUT_DIR="$ROOT/local-audit-output/avantiqo-audio-modal-direct-service-certification"
mkdir -p "$OUTPUT_DIR"
STATE_PATH="$OUTPUT_DIR/state.json"

# The funding guard executes before any provider runtime is loaded. A terminal
# state caused by this exact blocker therefore proves no Modal function call
# was submitted. The database evidence for the failed certification also has
# provider_request_id = null and a full RESERVE/RELEASE pair. Only this exact
# pre-provider failure may be cleared automatically; ambiguous submission or
# GPU/runtime failures remain terminal and require manual investigation.
if [[ "$MODE" == "execute" && -f "$STATE_PATH" ]]; then
  retryable_state="$(node -e '
    const fs = require("fs");
    const p = process.argv[1];
    const s = JSON.parse(fs.readFileSync(p, "utf8"));
    const message = String(s?.error?.message || "");
    const retryable =
      s?.contract === "AVANTIQO_AUDIO_MODAL_DIRECT_SERVICE_CERTIFICATION_V1" &&
      s?.phase === "SUBMISSION_FAILED" &&
      s?.terminal === true &&
      s?.success === false &&
      !s?.provider_job_id &&
      message === "AVANTIQO_PROVIDER_PAYER_ORGANIZATION_REQUIRED:avantiqo-audio";
    process.stdout.write(retryable ? "YES" : "NO");
  ' "$STATE_PATH")"
  if [[ "$retryable_state" == "YES" ]]; then
    mv "$STATE_PATH" "$OUTPUT_DIR/state-pre-provider-funding-failure.json"
    echo "AVANTIQO_AUDIO_MODAL_CERT_PRE_PROVIDER_FAILURE_REOPENED=PASS duplicate_job_possible=false"
  fi
fi

run_certification() {
  if [[ "$MODE" == "execute" ]]; then
    node --env-file="$ROOT/.env.local" scripts/certify-avantiqo-audio-modal-direct-service-live.mjs --execute
    return
  fi
  if [[ "$MODE" == "resume" ]]; then
    node --env-file="$ROOT/.env.local" scripts/certify-avantiqo-audio-modal-direct-service-live.mjs --resume
    return
  fi
  node --env-file="$ROOT/.env.local" scripts/certify-avantiqo-audio-modal-direct-service-live.mjs
}

(
  cd "$WORKTREE"
  export NODE_ENV=development
  export AVANTIQO_AUDIO_MODAL_CERT_BENCHMARK_PREVIEW=YES
  export AVANTIQO_AUDIO_MODAL_CERT_EXPECTED_MAIN_COMMIT="$MAIN_SHA"
  export AVANTIQO_AUDIO_MODAL_CERT_SOURCE_MAIN_COMMIT="$MAIN_SHA"
  export AVANTIQO_AUDIO_MODAL_CERT_OUTPUT_DIR="$OUTPUT_DIR"
  run_certification
)

echo "${CONTRACT}=PASS mode=${MODE} source_main=${MAIN_SHA} local_branch_mutated=false production_vercel_deploy_performed=false"
