#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$SCRIPT_DIR/run-avantiqo-continuous-learning-local.mjs"

is_node24() {
  local candidate="$1"
  [ -x "$candidate" ] || return 1
  [ "$($candidate -p 'Number(process.versions.node.split(".")[0]) >= 24 ? "YES" : "NO"' 2>/dev/null || true)" = "YES" ]
}

run_with() {
  local candidate="$1"
  echo "AVANTIQO_CONTINUOUS_LEARNING_NODE_BIN=$candidate"
  echo "AVANTIQO_CONTINUOUS_LEARNING_NODE_VERSION=$($candidate -p 'process.versions.node')"
  exec "$candidate" "$RUNNER" "$@"
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
