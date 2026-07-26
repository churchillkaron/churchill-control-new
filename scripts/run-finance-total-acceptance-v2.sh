#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
SOURCE="$PROJECT_ROOT/scripts/run-finance-total-acceptance.sh"
TEMP="/tmp/avantiqo-finance-total-acceptance-v2-$$.sh"

cleanup() {
  rm -f "$TEMP"
}
trap cleanup EXIT

cd "$PROJECT_ROOT" || exit 1

if [ ! -f "$SOURCE" ]; then
  echo "Missing source launcher: $SOURCE"
  exit 1
fi

node - "$SOURCE" "$TEMP" <<'NODE'
const fs = require("fs");
const sourcePath = process.argv[2];
const targetPath = process.argv[3];
let source = fs.readFileSync(sourcePath, "utf8");

source = source
  .replace(
    'echo "================ LOCALHOST 3000 ================"nSTATUS=',
    'echo "================ LOCALHOST 3000 ================"\nSTATUS='
  )
  .replace(
    'echo "================ EXPLICIT WRITE-SAFE CONFIRMATION ================"necho ',
    'echo "================ EXPLICIT WRITE-SAFE CONFIRMATION ================"\necho '
  )
  .replace(
    'echo "================ RUN TOTAL ACCEPTANCE ================"nFINANCE_ACCEPTANCE_BASE_URL=',
    'echo "================ RUN TOTAL ACCEPTANCE ================"\nFINANCE_ACCEPTANCE_BASE_URL='
  )
  .replace(
    'echo "================ FINAL STATUS ================"necho ',
    'echo "================ FINAL STATUS ================"\necho '
  );

for (const invalid of [
  '===============\"nSTATUS=',
  '===============\"necho ',
  '===============\"nFINANCE_',
]) {
  if (source.includes(invalid)) {
    throw new Error(`Launcher correction incomplete: ${invalid}`);
  }
}

fs.writeFileSync(targetPath, source, { mode: 0o700 });
NODE

bash "$TEMP"
