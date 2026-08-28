#!/usr/bin/env bash
set -u

CONTRACT="AVANTIQO_CODE_AI_EMPLOYEE_DETACHED_CERTIFICATION_LAUNCHER_V1"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$ROOT" ] || [ ! -d "$ROOT/.git" ]; then
  echo "${CONTRACT}_REPOSITORY_ROOT_REQUIRED" >&2
  exit 1
fi

if [ ! -f "$ROOT/.env.local" ]; then
  echo "${CONTRACT}_ENV_LOCAL_REQUIRED:$ROOT/.env.local" >&2
  exit 1
fi

if [ ! -d "$ROOT/node_modules" ]; then
  echo "${CONTRACT}_ROOT_NODE_MODULES_REQUIRED:$ROOT/node_modules" >&2
  exit 1
fi

WT="/tmp/avantiqo-code-employee-cert-$$"
WT_CREATED=0

cleanup() {
  if [ "$WT_CREATED" -eq 1 ]; then
    git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

echo "${CONTRACT}_ROOT=$ROOT"
echo "${CONTRACT}_DIRTY_ROOT_PRESERVED=true"
echo "${CONTRACT}_GIT_STASH_PERFORMED=false"
echo "${CONTRACT}_GIT_RESET_PERFORMED=false"
echo "${CONTRACT}_GIT_CLEAN_PERFORMED=false"
echo "${CONTRACT}_SECRETS_PRINTED=false"

git -C "$ROOT" fetch origin main || exit $?
MAIN_SHA="$(git -C "$ROOT" rev-parse origin/main)"
if ! printf '%s' "$MAIN_SHA" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "${CONTRACT}_ORIGIN_MAIN_SHA_INVALID" >&2
  exit 1
fi

echo "${CONTRACT}_ORIGIN_MAIN=$MAIN_SHA"

git -C "$ROOT" worktree add --detach "$WT" origin/main || exit $?
WT_CREATED=1

ln -s "$ROOT/node_modules" "$WT/node_modules"
ln -s "$ROOT/.env.local" "$WT/.env.local"

(
  cd "$WT" || exit 1
  NODE_ENV=development \
  AVANTIQO_CODE_EMPLOYEE_CERT_SPEND_APPROVED=YES \
  node --env-file="$ROOT/.env.local" scripts/run-code-ai-employee-fast-start-certification-local.mjs
)
RC=$?

echo ""
echo "${CONTRACT}_RC=$RC"
echo "${CONTRACT}_TEMP_WORKTREE_REMOVED_ON_EXIT=true"
echo "${CONTRACT}_DIRTY_ROOT_PRESERVED=true"
echo "Terminal remains open."

exit "$RC"
