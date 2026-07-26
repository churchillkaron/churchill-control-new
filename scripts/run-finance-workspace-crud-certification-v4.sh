#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
SOURCE="$PROJECT_ROOT/scripts/run-finance-workspace-crud-certification-v3.sh"
CACHE_DIR="$PROJECT_ROOT/.next/cache"
TEMP_RUNNER="$CACHE_DIR/avantiqo-finance-workspace-crud-certification-v4-$$.sh"

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
    "20260726130000_finance_workspace_legacy_required_column_completion.sql",
    "20260726131500_finance_e_invoicing_routing_identifier_completion.sql"
  )
  .replaceAll("20260726130000", "20260726131500")
  .replaceAll("Finance legacy required-column completion", "Finance e-invoicing routing-identifier completion")
  .replaceAll("legacy required-column completion migration", "e-invoicing routing-identifier completion migration")
  .replaceAll("legacy required-column completion is already deployed", "e-invoicing routing-identifier completion is already deployed");

for (const expected of [
  "20260726131500_finance_e_invoicing_routing_identifier_completion.sql",
  "20260726131500",
]) {
  if (!source.includes(expected)) {
    throw new Error(`Finance CRUD v4 launcher patch missing: ${expected}`);
  }
}

for (const obsolete of [
  "20260726130000_finance_workspace_legacy_required_column_completion.sql",
  "grep -v '^20260726130000$'",
]) {
  if (source.includes(obsolete)) {
    throw new Error(`Finance CRUD v4 launcher still contains obsolete gate: ${obsolete}`);
  }
}

fs.writeFileSync(targetPath, source, { mode: 0o700 });
NODE

if [ ! -f "$TEMP_RUNNER" ]; then
  echo "Finance CRUD certification v4 runner was not generated"
  exit 1
fi

bash -n "$TEMP_RUNNER" || exit 1
bash "$TEMP_RUNNER"
