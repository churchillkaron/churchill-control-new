#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
SOURCE="$PROJECT_ROOT/scripts/run-finance-total-acceptance-v5.sh"
CACHE_DIR="$PROJECT_ROOT/.next/cache"
TEMP_RUNNER="$CACHE_DIR/avantiqo-finance-total-acceptance-v6-$$.sh"

cleanup() {
  rm -f "$TEMP_RUNNER"
}
trap cleanup EXIT INT TERM

cd "$PROJECT_ROOT" || exit 1
mkdir -p "$CACHE_DIR" || exit 1

if [ ! -f "$SOURCE" ]; then
  echo "Missing source launcher: $SOURCE"
  exit 1
fi

node - "$SOURCE" "$TEMP_RUNNER" <<'NODE'
const fs = require("fs");
const sourcePath = process.argv[2];
const targetPath = process.argv[3];
let source = fs.readFileSync(sourcePath, "utf8");

source = source
  .replaceAll(
    "20260726113000_finance_total_acceptance_repair.sql",
    "20260726114500_finance_total_acceptance_probe_reference_alignment.sql"
  )
  .replaceAll("20260726113000", "20260726114500")
  .replaceAll("Acceptance repair v5", "Acceptance probe alignment v6")
  .replaceAll("acceptance repair v5", "acceptance probe alignment v6")
  .replaceAll("Acceptance repair migration v5", "Acceptance probe alignment migration v6")
  .replaceAll("acceptance repair migration v5", "acceptance probe alignment migration v6");

for (const expected of [
  "20260726114500_finance_total_acceptance_probe_reference_alignment.sql",
  "20260726114500",
]) {
  if (!source.includes(expected)) {
    throw new Error(`Finance v6 launcher patch missing: ${expected}`);
  }
}

for (const obsolete of [
  "20260726113000_finance_total_acceptance_repair.sql",
  "Dry run did not show the expected acceptance repair migration v5",
]) {
  if (source.includes(obsolete)) {
    throw new Error(`Finance v6 launcher still contains obsolete gate: ${obsolete}`);
  }
}

fs.writeFileSync(targetPath, source, { mode: 0o700 });
NODE

if [ ! -f "$TEMP_RUNNER" ]; then
  echo "Finance acceptance v6 runner was not generated"
  exit 1
fi

bash -n "$TEMP_RUNNER" || exit 1
bash "$TEMP_RUNNER"
