#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_ROOT="${CREATIVE_MIGRATION_BACKUP_DIR:-$ROOT/.avantiqo-backups/creative-migration-recovery-$STAMP}"
REPORT="${CREATIVE_MIGRATION_REPORT:-$ROOT/creative-migration-recovery-$STAMP.txt}"
EXPECTED_PROJECT_REF="${CREATIVE_SUPABASE_PROJECT_REF:-vfsjqabpkcbiuerhzugk}"
MIGRATION_DIR="$ROOT/supabase/migrations"
FETCH_ROOT="$BACKUP_ROOT/isolated-fetch"
FETCH_MIGRATION_DIR="$FETCH_ROOT/supabase/migrations"

REMOTE_ONLY=()
LOCAL_ONLY=()
REMOTE_ONLY_AFTER=()
LOCAL_ONLY_AFTER=()
UNRESOLVED=()

mkdir -p "$BACKUP_ROOT"
exec > >(tee "$REPORT") 2>&1

section() {
  printf '\n============================================================\n'
  printf '%s\n' "$1"
  printf '============================================================\n'
}

extract_versions() {
  local mode="$1"
  local file="$2"
  awk -F'|' -v mode="$mode" '
    {
      local_version=$1; remote_version=$2;
      gsub(/[^0-9]/, "", local_version);
      gsub(/[^0-9]/, "", remote_version);
      if (length(local_version) != 14) local_version="";
      if (length(remote_version) != 14) remote_version="";
      if (mode == "remote-only" && local_version == "" && remote_version != "") print remote_version;
      if (mode == "local-only" && local_version != "" && remote_version == "") print local_version;
      if (mode == "matched" && local_version != "" && local_version == remote_version) print local_version;
    }
  ' "$file" | sort -u
}

load_remote_only() {
  local file="$1"
  local version
  REMOTE_ONLY=()
  while IFS= read -r version; do
    [ -n "$version" ] || continue
    REMOTE_ONLY+=("$version")
  done < <(extract_versions remote-only "$file")
}

load_local_only() {
  local file="$1"
  local version
  LOCAL_ONLY=()
  while IFS= read -r version; do
    [ -n "$version" ] || continue
    LOCAL_ONLY+=("$version")
  done < <(extract_versions local-only "$file")
}

load_remote_only_after() {
  local file="$1"
  local version
  REMOTE_ONLY_AFTER=()
  while IFS= read -r version; do
    [ -n "$version" ] || continue
    REMOTE_ONLY_AFTER+=("$version")
  done < <(extract_versions remote-only "$file")
}

load_local_only_after() {
  local file="$1"
  local version
  LOCAL_ONLY_AFTER=()
  while IFS= read -r version; do
    [ -n "$version" ] || continue
    LOCAL_ONLY_AFTER+=("$version")
  done < <(extract_versions local-only "$file")
}

print_versions_or_none() {
  if [ "$#" -eq 0 ]; then
    printf 'none\n'
  else
    printf '%s\n' "$@"
  fi
}

find_version_file() {
  local directory="$1"
  local version="$2"
  local candidate
  for candidate in "$directory/${version}_"*.sql; do
    if [ -f "$candidate" ]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  return 1
}

find_local_file() {
  find_version_file "$MIGRATION_DIR" "$1"
}

restore_from_git() {
  local version="$1"
  local path commit
  while IFS= read -r path; do
    [ -n "$path" ] || continue
    commit="$(git rev-list --all -- "$path" | head -n 1 || true)"
    [ -n "$commit" ] || continue
    if git cat-file -e "$commit:$path" 2>/dev/null; then
      git show "$commit:$path" > "$MIGRATION_DIR/$(basename "$path")"
      printf 'RESTORED_FROM_GIT: %s from %s\n' "$(basename "$path")" "$commit"
      return 0
    fi
  done < <(git log --all --name-only --pretty=format: -- "supabase/migrations/${version}_*.sql" | sed '/^$/d' | sort -u)
  return 1
}

restore_from_backups() {
  local version="$1"
  local source=""
  local search_root

  for search_root in "$ROOT/.avantiqo-backups" "$HOME/Downloads"; do
    [ -d "$search_root" ] || continue
    source="$(find "$search_root" -type f -name "${version}_*.sql" -print 2>/dev/null | head -n 1 || true)"
    [ -n "$source" ] && break
  done

  [ -n "$source" ] || return 1
  cp "$source" "$MIGRATION_DIR/$(basename "$source")"
  printf 'RESTORED_FROM_BACKUP: %s\n' "$source"
}

prepare_isolated_fetch() {
  rm -rf "$FETCH_ROOT"
  mkdir -p "$FETCH_ROOT/supabase"

  if [ ! -f "$ROOT/supabase/config.toml" ]; then
    printf 'FAIL: supabase/config.toml is required for isolated fetch\n'
    return 1
  fi

  cp "$ROOT/supabase/config.toml" "$FETCH_ROOT/supabase/config.toml"

  if [ -d "$ROOT/supabase/.temp" ]; then
    cp -R "$ROOT/supabase/.temp" "$FETCH_ROOT/supabase/.temp"
  fi

  mkdir -p "$FETCH_MIGRATION_DIR"
  printf 'PASS: isolated Supabase fetch workspace prepared at %s\n' "$FETCH_ROOT"
}

run_isolated_fetch() {
  (
    cd "$FETCH_ROOT"
    if supabase migration fetch --help 2>&1 | grep -q -- '--linked'; then
      printf 'y\n' | supabase migration fetch --linked
    else
      printf 'y\n' | supabase migration fetch
    fi
  )
}

run_latest_isolated_fetch() {
  command -v npx >/dev/null 2>&1 || return 1
  (
    cd "$FETCH_ROOT"
    printf 'y\n' | npx --yes supabase@latest migration fetch --linked
  )
}

copy_isolated_migrations() {
  local version source
  for version in "${REMOTE_ONLY[@]}"; do
    [ -n "$version" ] || continue
    if find_local_file "$version" >/dev/null 2>&1; then
      continue
    fi
    source="$(find_version_file "$FETCH_MIGRATION_DIR" "$version" || true)"
    if [ -n "$source" ]; then
      cp "$source" "$MIGRATION_DIR/$(basename "$source")"
      printf 'RESTORED_FROM_ISOLATED_FETCH: %s\n' "$(basename "$source")"
    fi
  done
}

count_missing_remote_files() {
  local version count=0
  for version in "${REMOTE_ONLY[@]}"; do
    if ! find_local_file "$version" >/dev/null 2>&1; then
      count=$((count + 1))
    fi
  done
  printf '%s\n' "$count"
}

section "AVANTIQO CREATIVE MIGRATION RECOVERY"
printf 'Repository: %s\n' "$ROOT"
printf 'Backup: %s\n' "$BACKUP_ROOT"
printf 'Report: %s\n' "$REPORT"
printf 'Expected Supabase ref: %s\n' "$EXPECTED_PROJECT_REF"
printf 'Bash: %s\n' "${BASH_VERSION:-unknown}"
printf 'Started: %s\n' "$(date -Iseconds)"

for command in git awk supabase; do
  command -v "$command" >/dev/null 2>&1 || {
    printf 'FAIL: %s is required\n' "$command"
    exit 1
  }
  printf 'PASS: %s available\n' "$command"
done

section "PROJECT IDENTITY"
if [ -f supabase/.temp/project-ref ]; then
  ACTUAL_PROJECT_REF="$(tr -d '[:space:]' < supabase/.temp/project-ref)"
  printf 'Linked Supabase ref: %s\n' "$ACTUAL_PROJECT_REF"
  [ "$ACTUAL_PROJECT_REF" = "$EXPECTED_PROJECT_REF" ] || {
    printf 'FAIL: linked project is not the expected application project\n'
    exit 1
  }
  printf 'PASS: linked project identity verified\n'
else
  printf 'FAIL: linked Supabase project reference is unavailable\n'
  exit 1
fi

section "BACKUP"
cp -R "$MIGRATION_DIR" "$BACKUP_ROOT/migrations-before"
printf 'PASS: local migration directory backed up\n'

if supabase migration list --linked > "$BACKUP_ROOT/migration-list-before.txt"; then
  cat "$BACKUP_ROOT/migration-list-before.txt"
else
  printf 'FAIL: unable to read migration history\n'
  exit 1
fi

load_remote_only "$BACKUP_ROOT/migration-list-before.txt"
load_local_only "$BACKUP_ROOT/migration-list-before.txt"

printf '\nRemote-only versions before recovery:\n'
print_versions_or_none "${REMOTE_ONLY[@]}"
printf '\nLocal-only versions before recovery:\n'
print_versions_or_none "${LOCAL_ONLY[@]}"

section "RESTORE EXACT LOCAL MIGRATIONS"
for version in "${REMOTE_ONLY[@]}"; do
  [ -n "$version" ] || continue
  if find_local_file "$version" >/dev/null 2>&1; then
    printf 'PASS: %s already exists locally\n' "$version"
    continue
  fi
  if restore_from_git "$version"; then
    continue
  fi
  if restore_from_backups "$version"; then
    continue
  fi
  printf 'UNRESOLVED_BEFORE_FETCH: %s\n' "$version"
done

if [ "$(count_missing_remote_files)" -gt 0 ]; then
  section "ISOLATED SUPABASE MIGRATION FETCH"
  prepare_isolated_fetch

  if run_isolated_fetch; then
    printf 'PASS: installed Supabase CLI fetch completed in isolation\n'
  else
    printf 'WARN: installed Supabase CLI isolated fetch failed\n'
  fi
  copy_isolated_migrations

  if [ "$(count_missing_remote_files)" -gt 0 ]; then
    printf 'WARN: retrying isolated migration fetch with latest Supabase CLI\n'
    rm -rf "$FETCH_MIGRATION_DIR"
    mkdir -p "$FETCH_MIGRATION_DIR"
    if run_latest_isolated_fetch; then
      printf 'PASS: latest Supabase CLI fetch completed in isolation\n'
    else
      printf 'WARN: latest Supabase CLI isolated fetch failed\n'
    fi
    copy_isolated_migrations
  fi
fi

section "STRICT FILE VERIFICATION"
UNRESOLVED=()
for version in "${REMOTE_ONLY[@]}"; do
  [ -n "$version" ] || continue
  file="$(find_local_file "$version" || true)"
  if [ -n "$file" ]; then
    printf 'PASS: %s -> %s\n' "$version" "$(basename "$file")"
  else
    UNRESOLVED+=("$version")
    printf 'FAIL: no local SQL file for remote migration %s\n' "$version"
  fi
done

if [ "${#UNRESOLVED[@]}" -gt 0 ]; then
  printf '\nUnresolved remote migrations:\n'
  printf '%s\n' "${UNRESOLVED[@]}"
  printf '\nNo production migration history was modified.\n'
  printf 'Do not run migration repair --status reverted.\n'
  printf 'Recovery backup: %s\n' "$BACKUP_ROOT"
  printf 'CREATIVE_MIGRATION_RECOVERY=BLOCKED\n'
  exit 2
fi

section "VERIFY MIGRATION HISTORY"
supabase migration list --linked > "$BACKUP_ROOT/migration-list-after.txt"
cat "$BACKUP_ROOT/migration-list-after.txt"

load_remote_only_after "$BACKUP_ROOT/migration-list-after.txt"
load_local_only_after "$BACKUP_ROOT/migration-list-after.txt"

if [ "${#REMOTE_ONLY_AFTER[@]}" -gt 0 ]; then
  printf 'FAIL: remote-only migration rows remain:\n'
  printf '%s\n' "${REMOTE_ONLY_AFTER[@]}"
  exit 2
fi

printf 'PASS: local migration files cover every remote migration version\n'
printf '\nPending local versions:\n'
print_versions_or_none "${LOCAL_ONLY_AFTER[@]}"

section "DRY RUN"
if supabase db push --linked --dry-run; then
  printf 'PASS: Supabase db push dry-run\n'
else
  printf 'FAIL: dry-run rejected the recovered migration chain\n'
  exit 1
fi

if [ "${APPLY_CREATIVE_MIGRATIONS:-0}" = "1" ]; then
  section "APPLY PENDING MIGRATIONS"
  supabase db push --linked
  printf 'PASS: pending migrations applied\n'
else
  printf '\nWARN: dry-run only. Set APPLY_CREATIVE_MIGRATIONS=1 after reviewing this report.\n'
fi

section "FINAL"
supabase migration list --linked
printf 'Recovery report: %s\n' "$REPORT"
printf 'Backup directory: %s\n' "$BACKUP_ROOT"
printf 'CREATIVE_MIGRATION_RECOVERY=PASS\n'
