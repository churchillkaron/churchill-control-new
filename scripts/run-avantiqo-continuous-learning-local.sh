#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$SCRIPT_DIR/run-avantiqo-continuous-learning-local.mjs"

is_supported_node() {
  local candidate="$1"
  [ -x "$candidate" ] || return 1
  [ "$($candidate -p 'Number(process.versions.node.split(".")[0]) >= 20 ? "YES" : "NO"' 2>/dev/null || true)" = "YES" ]
}

run_with() {
  local candidate="$1"
  shift
  echo "AVANTIQO_CONTINUOUS_LEARNING_NODE_BIN=$candidate"
  echo "AVANTIQO_CONTINUOUS_LEARNING_NODE_VERSION=$($candidate -p 'process.versions.node')"
  echo "AVANTIQO_CONTINUOUS_LEARNING_RUNPOD_USED=NO"
  exec "$candidate" "$RUNNER" "$@"
}

if [ -n "${AVANTIQO_NODE_BIN:-}" ]; then
  if ! is_supported_node "$AVANTIQO_NODE_BIN"; then
    echo "AVANTIQO_NODE_BIN_INVALID_OR_BELOW_NODE_20" >&2
    exit 2
  fi
  run_with "$AVANTIQO_NODE_BIN" "$@"
fi

# Backward-compatible explicit node path. The variable name is historical;
# Node 20+ is sufficient for this provider-free local learning runner.
if [ -n "${AVANTIQO_NODE_24_BIN:-}" ]; then
  if ! is_supported_node "$AVANTIQO_NODE_24_BIN"; then
    echo "AVANTIQO_NODE_24_BIN_INVALID_OR_BELOW_NODE_20" >&2
    exit 2
  fi
  run_with "$AVANTIQO_NODE_24_BIN" "$@"
fi

CURRENT_NODE="$(command -v node 2>/dev/null || true)"
if [ -n "$CURRENT_NODE" ] && is_supported_node "$CURRENT_NODE"; then
  run_with "$CURRENT_NODE" "$@"
fi

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$NVM_DIR/nvm.sh"
  for version in 20 22 24; do
    if nvm use "$version" >/dev/null 2>&1; then
      NVM_NODE="$(command -v node 2>/dev/null || true)"
      if [ -n "$NVM_NODE" ] && is_supported_node "$NVM_NODE"; then
        run_with "$NVM_NODE" "$@"
      fi
    fi
  done
fi

for candidate in \
  "$HOME"/.nvm/versions/node/v20.*/bin/node \
  "$HOME"/.nvm/versions/node/v22.*/bin/node \
  "$HOME"/.nvm/versions/node/v24.*/bin/node \
  "$HOME"/.fnm/node-versions/v20.*/installation/bin/node \
  "$HOME"/.fnm/node-versions/v22.*/installation/bin/node \
  "$HOME"/.fnm/node-versions/v24.*/installation/bin/node \
  "$HOME"/.asdf/installs/nodejs/20.*/bin/node \
  "$HOME"/.asdf/installs/nodejs/22.*/bin/node \
  "$HOME"/.asdf/installs/nodejs/24.*/bin/node \
  /opt/homebrew/opt/node@20/bin/node \
  /opt/homebrew/opt/node@22/bin/node \
  /opt/homebrew/opt/node@24/bin/node \
  /usr/local/opt/node@20/bin/node \
  /usr/local/opt/node@22/bin/node \
  /usr/local/opt/node@24/bin/node
do
  if is_supported_node "$candidate"; then
    run_with "$candidate" "$@"
  fi
done

echo "AVANTIQO_CONTINUOUS_LEARNING_NODE_20_PLUS_NOT_FOUND" >&2
echo "Install/use Node 20+ or set AVANTIQO_NODE_BIN to an existing Node 20+ executable." >&2
exit 2
