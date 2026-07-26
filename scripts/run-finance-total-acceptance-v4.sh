#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
SOURCE="$PROJECT_ROOT/scripts/run-finance-total-acceptance-v3.sh"
TEMP_WRAPPER="/tmp/avantiqo-finance-total-acceptance-v4-$$.sh"

cleanup() {
  rm -f "$TEMP_WRAPPER"
}
trap cleanup EXIT INT TERM

cd "$PROJECT_ROOT" || exit 1

if [ ! -f "$SOURCE" ]; then
  echo "Missing source launcher: $SOURCE"
  exit 1
fi

mkdir -p "$PROJECT_ROOT/.next/cache" || exit 1

node - "$SOURCE" "$TEMP_WRAPPER" <<'NODE'
const fs = require("fs");
const sourcePath = process.argv[2];
const targetPath = process.argv[3];
let source = fs.readFileSync(sourcePath, "utf8");

const original = 'TEMP_ORCHESTRATOR="/tmp/avantiqo-finance-total-acceptance-v3-$$.mjs"';
const replacement = 'TEMP_ORCHESTRATOR="$PROJECT_ROOT/.next/cache/avantiqo-finance-total-acceptance-v3-$$.mjs"';

if (!source.includes(original)) {
  throw new Error("Unable to locate the v3 temporary orchestrator path");
}

source = source.replace(original, replacement);

if (!source.includes(replacement) || source.includes(original)) {
  throw new Error("Finance acceptance module-resolution patch failed");
}

fs.writeFileSync(targetPath, source, { mode: 0o700 });
NODE

bash -n "$TEMP_WRAPPER" || exit 1
bash "$TEMP_WRAPPER"
