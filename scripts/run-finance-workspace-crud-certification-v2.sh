#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
SOURCE="$PROJECT_ROOT/scripts/run-finance-workspace-crud-certification.sh"
CACHE_DIR="$PROJECT_ROOT/.next/cache"
TEMP_RUNNER="$CACHE_DIR/avantiqo-finance-workspace-crud-certification-v2-$$.sh"

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
    "20260726121500_finance_workspace_crud_certification.sql",
    "20260726124500_finance_workspace_crud_contract_convergence.sql"
  )
  .replaceAll("20260726121500", "20260726124500")
  .replaceAll("CRUD certification migration", "CRUD contract convergence migration")
  .replaceAll("CRUD certification probe is already deployed", "CRUD contract convergence is already deployed")
  .replaceAll("rollback-safe CRUD certification probe", "Finance CRUD contract convergence");

for (const expected of [
  "20260726124500_finance_workspace_crud_contract_convergence.sql",
  "20260726124500",
]) {
  if (!source.includes(expected)) {
    throw new Error(`Finance CRUD v2 launcher patch missing: ${expected}`);
  }
}

for (const obsolete of [
  "20260726121500_finance_workspace_crud_certification.sql",
  "grep -v '^20260726121500$'",
]) {
  if (source.includes(obsolete)) {
    throw new Error(`Finance CRUD v2 launcher still contains obsolete gate: ${obsolete}`);
  }
}

fs.writeFileSync(targetPath, source, { mode: 0o700 });
NODE

if [ ! -f "$TEMP_RUNNER" ]; then
  echo "Finance CRUD certification v2 runner was not generated"
  exit 1
fi

bash -n "$TEMP_RUNNER" || exit 1
bash "$TEMP_RUNNER"
