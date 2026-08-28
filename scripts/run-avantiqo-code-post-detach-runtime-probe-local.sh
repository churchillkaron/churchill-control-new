#!/usr/bin/env bash
set -u

ROOT="$(git rev-parse --show-toplevel)" || exit 1
cd "$ROOT" || exit 1

git fetch origin main || exit 1
PINNED_MAIN="$(git rev-parse origin/main)" || exit 1
WT="$(mktemp -d /tmp/avantiqo-code-post-detach-probe.XXXXXX)" || exit 1
PROBE_RC=1

cleanup() {
  git -C "$ROOT" worktree remove --force "$WT" >/dev/null 2>&1 || true
  rm -rf "$WT" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

if git worktree add --detach "$WT" "$PINNED_MAIN"; then
  if [ -f "$ROOT/.env.local" ]; then
    ln -s "$ROOT/.env.local" "$WT/.env.local"
  else
    echo "AVANTIQO_CODE_POST_DETACH_PROBE_ENV_LOCAL_REQUIRED"
    exit 1
  fi

  if [ -d "$ROOT/node_modules" ] && [ ! -e "$WT/node_modules" ]; then
    ln -s "$ROOT/node_modules" "$WT/node_modules"
  fi

  echo "PINNED_MAIN=$PINNED_MAIN"
  (
    cd "$WT" || exit 1
    AVANTIQO_CODE_RUNTIME_PROBE_SPEND_APPROVED=YES \
      node --env-file=.env.local \
      scripts/run-avantiqo-code-placement-aware-runtime-probe-safe-lease-local.mjs
  )
  PROBE_RC=$?
fi

echo ""
echo "CODE_POST_DETACH_RUNTIME_PROBE_RC=$PROBE_RC"
echo "MUSIC_WORK_UNTOUCHED=true"
echo "VIDEO_WORK_UNTOUCHED=true"
echo "VOICE_WORK_UNTOUCHED=true"
echo "INTELLIGENCE_WORK_UNTOUCHED=true"
echo "Terminal remains open."

exit "$PROBE_RC"
