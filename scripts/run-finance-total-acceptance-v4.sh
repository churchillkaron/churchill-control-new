#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
SOURCE="$PROJECT_ROOT/scripts/run-finance-total-acceptance-v3.sh"
CACHE_DIR="$PROJECT_ROOT/.next/cache"
TEMP_WRAPPER="$CACHE_DIR/avantiqo-finance-total-acceptance-v4-$$.sh"

cleanup() {
  rm -f "$TEMP_WRAPPER"
}
trap cleanup EXIT INT TERM

cd "$PROJECT_ROOT" || exit 1

if [ ! -f "$SOURCE" ]; then
  echo "Missing source launcher: $SOURCE"
  exit 1
fi

mkdir -p "$CACHE_DIR" || exit 1

node - "$SOURCE" "$TEMP_WRAPPER" <<'NODE'
const fs = require("fs");
const sourcePath = process.argv[2];
const targetPath = process.argv[3];
let source = fs.readFileSync(sourcePath, "utf8");

const assignmentPattern = /^TEMP_ORCHESTRATOR=.*$/m;
const currentAssignment = source.match(assignmentPattern)?.[0] || "";
const replacement = 'TEMP_ORCHESTRATOR="$PROJECT_ROOT/.next/cache/avantiqo-finance-total-acceptance-v3-$$.mjs"';

if (!currentAssignment.includes("avantiqo-finance-total-acceptance-v3-$$.mjs")) {
  throw new Error(`Unexpected temporary orchestrator assignment: ${currentAssignment || "missing"}`);
}

source = source.replace(assignmentPattern, () => replacement);

const rewrittenAssignment = source.match(assignmentPattern)?.[0] || "";
if (rewrittenAssignment !== replacement) {
  throw new Error(`Finance acceptance module-resolution patch failed: ${rewrittenAssignment || "missing"}`);
}

fs.writeFileSync(targetPath, source, { mode: 0o700 });
NODE

if [ ! -f "$TEMP_WRAPPER" ]; then
  echo "Finance acceptance wrapper was not generated"
  exit 1
fi

bash -n "$TEMP_WRAPPER" || exit 1
bash "$TEMP_WRAPPER"
