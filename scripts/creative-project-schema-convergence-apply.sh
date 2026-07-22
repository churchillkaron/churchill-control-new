#!/usr/bin/env bash
set -e
set -o pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d_%H%M%S)"
TARGET_VERSION="20260722060000"
TARGET_FILE="supabase/migrations/20260722060000_creative_projects_schema_convergence.sql"
EXPECTED_PROJECT_REF="${CREATIVE_SUPABASE_PROJECT_REF:-vfsjqabpkcbiuerhzugk}"
WORK_ROOT="$ROOT/.avantiqo-backups/creative-project-schema-convergence-$STAMP"
WORK_MIGRATIONS="$WORK_ROOT/supabase/migrations"
FETCH_ROOT="$WORK_ROOT/isolated-fetch"
REPORT="$ROOT/creative-project-schema-convergence-$STAMP.txt"
DRY_RUN_REPORT="$WORK_ROOT/dry-run.txt"

exec > >(tee "$REPORT") 2>&1

printf '============================================================\n'
printf 'AVANTIQO CREATIVE PROJECT SCHEMA CONVERGENCE\n'
printf '============================================================\n'
printf 'Repository: %s\n' "$ROOT"
printf 'Workspace: %s\n' "$WORK_ROOT"
printf 'Report: %s\n' "$REPORT"

for command in supabase awk find grep; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'FAIL: %s is required\n' "$command"
    exit 1
  }
done

[ -f "$TARGET_FILE" ] || {
  printf 'FAIL: target migration missing: %s\n' "$TARGET_FILE"
  exit 1
}

[ -f supabase/.temp/project-ref ] || {
  printf 'FAIL: linked Supabase project reference is unavailable\n'
  exit 1
}

ACTUAL_PROJECT_REF="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
[ "$ACTUAL_PROJECT_REF" = "$EXPECTED_PROJECT_REF" ] || {
  printf 'FAIL: linked project %s does not match expected %s\n' "$ACTUAL_PROJECT_REF" "$EXPECTED_PROJECT_REF"
  exit 1
}
printf 'PASS: linked project identity verified\n'

rm -rf "$WORK_ROOT"
mkdir -p "$WORK_ROOT/supabase" "$WORK_MIGRATIONS"
cp supabase/config.toml "$WORK_ROOT/supabase/config.toml"
cp -R supabase/.temp "$WORK_ROOT/supabase/.temp"

MIGRATION_LIST="$WORK_ROOT/migration-list-before.txt"
supabase migration list --linked > "$MIGRATION_LIST"
cat "$MIGRATION_LIST"

REMOTE_VERSIONS="$WORK_ROOT/remote-versions.txt"
awk -F'|' '
  {
    remote=$2;
    gsub(/[^0-9]/, "", remote);
    if (length(remote) == 14) print remote;
  }
' "$MIGRATION_LIST" | sort -u > "$REMOTE_VERSIONS"

MISSING_REMOTE="$WORK_ROOT/missing-remote.txt"
: > "$MISSING_REMOTE"
while IFS= read -r version; do
  [ -n "$version" ] || continue
  source_file="$(find supabase/migrations -type f -name "${version}_*.sql" -print | head -n 1 || true)"
  [ -n "$source_file" ] || printf '%s\n' "$version" >> "$MISSING_REMOTE"
done < "$REMOTE_VERSIONS"

if [ -s "$MISSING_REMOTE" ]; then
  printf '\nFetching exact missing remote migration SQL in isolation:\n'
  cat "$MISSING_REMOTE"
  mkdir -p "$FETCH_ROOT/supabase/migrations"
  cp supabase/config.toml "$FETCH_ROOT/supabase/config.toml"
  cp -R supabase/.temp "$FETCH_ROOT/supabase/.temp"
  (
    cd "$FETCH_ROOT"
    if supabase migration fetch --help 2>&1 | grep -q -- '--linked'; then
      printf 'y\n' | supabase migration fetch --linked
    else
      printf 'y\n' | supabase migration fetch
    fi
  )

  while IFS= read -r version; do
    [ -n "$version" ] || continue
    fetched="$(find "$FETCH_ROOT/supabase/migrations" -type f -name "${version}_*.sql" -print | head -n 1 || true)"
    [ -n "$fetched" ] || {
      printf 'FAIL: unable to recover remote migration %s\n' "$version"
      exit 1
    }
    cp "$fetched" "supabase/migrations/$(basename "$fetched")"
    printf 'RESTORED: %s\n' "$(basename "$fetched")"
  done < "$MISSING_REMOTE"
fi

printf '\nStaging canonical remote history:\n'
while IFS= read -r version; do
  [ -n "$version" ] || continue
  source_file="$(find supabase/migrations -type f -name "${version}_*.sql" -print | head -n 1 || true)"
  [ -n "$source_file" ] || {
    printf 'FAIL: local SQL missing for remote migration %s\n' "$version"
    exit 1
  }
  cp "$source_file" "$WORK_MIGRATIONS/$(basename "$source_file")"
  printf '  REMOTE: %s\n' "$(basename "$source_file")"
done < "$REMOTE_VERSIONS"

cp "$TARGET_FILE" "$WORK_MIGRATIONS/$(basename "$TARGET_FILE")"
printf '  PENDING: %s\n' "$(basename "$TARGET_FILE")"

printf '\n============================================================\n'
printf 'DRY RUN\n'
printf '============================================================\n'
(
  cd "$WORK_ROOT"
  supabase db push --linked --dry-run --include-all
) 2>&1 | tee "$DRY_RUN_REPORT"

EXPECTED_NAME="$(basename "$TARGET_FILE")"
grep -q "$EXPECTED_NAME" "$DRY_RUN_REPORT" || {
  printf 'FAIL: target migration absent from dry run\n'
  exit 1
}

UNEXPECTED="$(awk '/^ • / {print $2}' "$DRY_RUN_REPORT" | grep -v "^${EXPECTED_NAME}$" || true)"
[ -z "$UNEXPECTED" ] || {
  printf 'FAIL: unexpected migrations in dry run:\n%s\n' "$UNEXPECTED"
  exit 1
}

printf 'PASS: isolated dry run contains only %s\n' "$EXPECTED_NAME"

if [ "${APPLY_CREATIVE_PROJECT_SCHEMA_CONVERGENCE:-0}" != "1" ]; then
  printf 'CREATIVE_PROJECT_SCHEMA_CONVERGENCE=DRY_RUN_PASS\n'
  exit 0
fi

printf '\n============================================================\n'
printf 'APPLY\n'
printf '============================================================\n'
(
  cd "$WORK_ROOT"
  supabase db push --linked --include-all --yes
)

FINAL_LIST="$WORK_ROOT/migration-list-after.txt"
supabase migration list --linked > "$FINAL_LIST"
cat "$FINAL_LIST"

awk -F'|' -v wanted="$TARGET_VERSION" '
  {
    local_version=$1; remote_version=$2;
    gsub(/[^0-9]/, "", local_version);
    gsub(/[^0-9]/, "", remote_version);
    if (local_version == wanted && remote_version == wanted) found=1;
  }
  END { exit found ? 0 : 1 }
' "$FINAL_LIST" || {
  printf 'FAIL: target migration is not aligned remotely\n'
  exit 1
}

printf 'PASS: Creative project schema convergence applied and aligned\n'
printf 'CREATIVE_PROJECT_SCHEMA_CONVERGENCE=PASS\n'
