#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$SCRIPT_DIR/run-avantiqo-continuous-learning-local.mjs"
SLOT_MANAGER="$SCRIPT_DIR/manage-avantiqo-intelligence-lane-slot-local.mjs"

run_requested() {
  local argument
  for argument in "$@"; do
    if [ "$argument" = "--run" ]; then
      return 0
    fi
  done
  return 1
}

is_node24() {
  local candidate="$1"
  [ -x "$candidate" ] || return 1
  [ "$($candidate -p 'Number(process.versions.node.split(".")[0]) >= 24 ? "YES" : "NO"' 2>/dev/null || true)" = "YES" ]
}

run_with() {
  local candidate="$1"
  shift
  echo "AVANTIQO_CONTINUOUS_LEARNING_NODE_BIN=$candidate"
  echo "AVANTIQO_CONTINUOUS_LEARNING_NODE_VERSION=$($candidate -p 'process.versions.node')"

  if ! run_requested "$@"; then
    exec "$candidate" "$RUNNER" "$@"
  fi

  if [ "${AVANTIQO_CONTINUOUS_LEARNING_FAST_SLOT_APPROVED:-}" != "YES" ]; then
    echo "AVANTIQO_CONTINUOUS_LEARNING_FAST_SLOT_APPROVED=YES_REQUIRED" >&2
    exit 2
  fi
  if [ -z "${AVANTIQO_ENV_FILE:-}" ] || [ ! -f "$AVANTIQO_ENV_FILE" ]; then
    echo "AVANTIQO_CONTINUOUS_LEARNING_ENV_FILE_REQUIRED_FOR_FAST_SLOT" >&2
    exit 2
  fi
  if [ ! -f "$SLOT_MANAGER" ]; then
    echo "AVANTIQO_CONTINUOUS_LEARNING_SLOT_MANAGER_REQUIRED" >&2
    exit 2
  fi

  local fast_slot_active="NO"
  restore_deep_slot() {
    local original_status="${1:-0}"
    local restore_status=0
    trap - EXIT INT TERM
    if [ "$fast_slot_active" = "YES" ]; then
      echo "AVANTIQO_CONTINUOUS_LEARNING_RESTORING_DEEP_SLOT=true"
      set +e
      AVANTIQO_INTELLIGENCE_FAST_SLOT_RESTORE_APPROVED=YES \
        "$candidate" --env-file="$AVANTIQO_ENV_FILE" "$SLOT_MANAGER" --restore-deep
      restore_status=$?
      set -e
      if [ "$restore_status" -ne 0 ]; then
        echo "AVANTIQO_CONTINUOUS_LEARNING_DEEP_SLOT_RESTORE_FAILED:exit=$restore_status" >&2
        if [ "$original_status" -eq 0 ]; then
          original_status="$restore_status"
        fi
      fi
    fi
    exit "$original_status"
  }
  trap 'restore_deep_slot $?' EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  echo "AVANTIQO_CONTINUOUS_LEARNING_PREPARING_FAST_SLOT=true"
  AVANTIQO_INTELLIGENCE_FAST_RUNPOD_PROVISION_APPROVED=YES \
    "$candidate" --env-file="$AVANTIQO_ENV_FILE" "$SLOT_MANAGER" --provision
  AVANTIQO_INTELLIGENCE_FAST_SLOT_SWAP_APPROVED=YES \
    "$candidate" --env-file="$AVANTIQO_ENV_FILE" "$SLOT_MANAGER" --activate-fast
  fast_slot_active="YES"

  AVANTIQO_CONTINUOUS_LEARNING_FAST_SLOT_ACTIVE=YES \
    "$candidate" "$RUNNER" "$@"
  exit 0
}

if [ -n "${AVANTIQO_NODE_24_BIN:-}" ]; then
  if ! is_node24 "$AVANTIQO_NODE_24_BIN"; then
    echo "AVANTIQO_NODE_24_BIN_INVALID_OR_NOT_NODE_24" >&2
    exit 2
  fi
  run_with "$AVANTIQO_NODE_24_BIN" "$@"
fi

CURRENT_NODE="$(command -v node 2>/dev/null || true)"
if [ -n "$CURRENT_NODE" ] && is_node24 "$CURRENT_NODE"; then
  run_with "$CURRENT_NODE" "$@"
fi

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  if nvm use 24 >/dev/null 2>&1; then
    NVM_NODE="$(command -v node 2>/dev/null || true)"
    if [ -n "$NVM_NODE" ] && is_node24 "$NVM_NODE"; then
      run_with "$NVM_NODE" "$@"
    fi
  fi
fi

for candidate in \
  "$HOME"/.nvm/versions/node/v24.*/bin/node \
  "$HOME"/.fnm/node-versions/v24.*/installation/bin/node \
  "$HOME"/.asdf/installs/nodejs/24.*/bin/node \
  /opt/homebrew/opt/node@24/bin/node \
  /usr/local/opt/node@24/bin/node
do
  if is_node24 "$candidate"; then
    run_with "$candidate" "$@"
  fi
done

echo "AVANTIQO_CONTINUOUS_LEARNING_NODE_24_NOT_FOUND" >&2
echo "Install/use Node 24 or set AVANTIQO_NODE_24_BIN to an existing Node 24 executable." >&2
exit 2
