#!/usr/bin/env bash
set -euo pipefail

CONTRACT="AVANTIQO_BUSINESS_PARTNER_TWO_TURN_MODAL_E2E_WRAPPER_V1"
PINNED_MODAL_VERSION="0.10.0"
ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

MODE="preflight"
case "${1:-}" in
  "") MODE="preflight" ;;
  --execute) MODE="execute" ;;
  *) echo "${CONTRACT}_INVALID_ARGUMENT:${1}" >&2; false ;;
esac

[[ -f "$ROOT/.env.local" ]] || { echo "${CONTRACT}_ENV_LOCAL_REQUIRED" >&2; false; }
[[ -d "$ROOT/node_modules" ]] || { echo "${CONTRACT}_LOCAL_NODE_MODULES_REQUIRED" >&2; false; }

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/avantiqo-operator-modal-e2e.XXXXXX")"
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
[[ "$MAIN_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "${CONTRACT}_ORIGIN_MAIN_SHA_INVALID" >&2; false; }

modal_version=""
if [[ -f "$ROOT/node_modules/modal/package.json" ]]; then
  modal_version="$(node -p "require('./node_modules/modal/package.json').version" 2>/dev/null || true)"
fi
if [[ "$modal_version" != "$PINNED_MODAL_VERSION" ]]; then
  echo "${CONTRACT}_MODAL_JS_SDK_LOCAL_SYNC_START pinned=${PINNED_MODAL_VERSION} scripts=false"
  npm install --no-save --package-lock=false --ignore-scripts --no-audit --no-fund "modal@${PINNED_MODAL_VERSION}" >/dev/null
  modal_version="$(node -p "require('./node_modules/modal/package.json').version" 2>/dev/null || true)"
  [[ "$modal_version" == "$PINNED_MODAL_VERSION" ]] || {
    echo "${CONTRACT}_MODAL_JS_SDK_VERSION_INVALID:${modal_version}" >&2
    false
  }
  echo "${CONTRACT}_MODAL_JS_SDK_LOCAL_SYNC=PASS version=${modal_version} tracked_package_metadata_preserved=true"
fi

cp "$BACKUP/package.json" "$ROOT/package.json"
cp "$BACKUP/package-lock.json" "$ROOT/package-lock.json"
cmp -s "$BACKUP/package.json" "$ROOT/package.json" && cmp -s "$BACKUP/package-lock.json" "$ROOT/package-lock.json" || {
  echo "${CONTRACT}_LOCAL_PACKAGE_METADATA_PRESERVATION_FAILED" >&2
  false
}

git worktree add --detach "$WORKTREE" "$MAIN_SHA" >/dev/null
ln -s "$ROOT/node_modules" "$WORKTREE/node_modules"

(
  cd "$WORKTREE"
  export NODE_ENV=development
  export AVANTIQO_INTELLIGENCE_MODAL_BASE_URL=""
  export AVANTIQO_INTELLIGENCE_MODAL_GATEWAY_TOKEN=""
  if [[ "$MODE" == "execute" ]]; then
    node --env-file="$ROOT/.env.local" scripts/run-avantiqo-operator-two-turn-e2e-local.mjs --execute
  else
    node --env-file="$ROOT/.env.local" scripts/run-avantiqo-operator-two-turn-e2e-local.mjs
  fi
)

echo "${CONTRACT}=PASS mode=${MODE} source_main=${MAIN_SHA} local_branch_mutated=false production_vercel_deploy_performed=false terminal_close_requested=false"
