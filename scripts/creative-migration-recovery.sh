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
PUSH_ROOT="$BACKUP_ROOT/isolated-push"
PUSH_MIGRATION_DIR="$PUSH_ROOT/supabase/migrations"

REMOTE_ONLY=()
LOCAL_ONLY=()
REMOTE_ONLY_AFTER=()
LOCAL_ONLY_AFTER=()
REMOTE_VERSIONS=()
UNRESOLVED=()
CREATIVE_PENDING_VERSIONS=(
  "20260722033000"
  "20260722043000"
  "20260722050000"
  "20260722050500"
  "20260722051000"
)

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
      if (mode == "remote" && remote_version != "") print remote_version;
    }
  ' "$file" | sort -u
}

load_versions() {
  local target="$1"
  local mode="$2"
  local file="$3"
  local version

  case "$target" in
    remote-only) REMOTE_ONLY=() ;;
    local-only) LOCAL_ONLY=() ;;
    remote-only-after) REMOTE_ONLY_AFTER=() ;;
    local-only-after) LOCAL_ONLY_AFTER=() ;;
    remote) REMOTE_VERSIONS=() ;;
  esac

  while IFS= read -r version; do
    [ -n "$version" ] || continue
    case "$target" in
      remote-only) REMOTE_ONLY+=("$version") ;;
      local-only) LOCAL_ONLY+=("$version") ;;
      remote-only-after) REMOTE_ONLY_AFTER+=("$version") ;;
      local-only-after) LOCAL_ONLY_AFTER+=("$version") ;;
      remote) REMOTE_VERSIONS+=("$version") ;;
    esac
  done < <(extract_versions "$mode" "$file")
}

print_versions_or_none() {
  if [ "$#" -eq 0 ]; then
    printf 'none\n'
  else
    printf '%s\n' "$@"
  fi
}

contains_version() {
  local wanted="$1"
  shift
  local candidate
  for candidate in "$@"; do
    [ "$candidate" = "$wanted" ] && return 0
  done
  return 1
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

copy_supabase_link() {
  local destination="$1"
  rm -rf "$destination"
  mkdir -p "$destination/supabase"

  [ -f "$ROOT/supabase/config.toml" ] || {
    printf 'FAIL: supabase/config.toml is required\n'
    return 1
  }

  cp "$ROOT/supabase/config.toml" "$destination/supabase/config.toml"
  if [ -d "$ROOT/supabase/.temp" ]; then
    cp -R "$ROOT/supabase/.temp" "$destination/supabase/.temp"
  fi
  mkdir -p "$destination/supabase/migrations"
}

run_isolated_fetch() {
  copy_supabase_link "$FETCH_ROOT"
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
  copy_supabase_link "$FETCH_ROOT"
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

prepare_isolated_push() {
  local version source
  copy_supabase_link "$PUSH_ROOT"

  printf 'Staging remote migration history:\n'
  for version in "${REMOTE_VERSIONS[@]}"; do
    source="$(find_local_file "$version" || true)"
    if [ -z "$source" ]; then
      printf 'FAIL: remote migration %s has no exact local SQL file\n' "$version"
      return 1
    fi
    cp "$source" "$PUSH_MIGRATION_DIR/$(basename "$source")"
    printf '  REMOTE: %s -> %s\n' "$version" "$(basename "$source")"
  done

  printf 'Staging approved Creative migrations:\n'
  for version in "${CREATIVE_PENDING_VERSIONS[@]}"; do
    source="$(find_local_file "$version" || true)"
    if [ -z "$source" ]; then
      printf 'FAIL: approved Creative migration %s is missing\n' "$version"
      return 1
    fi
    cp "$source" "$PUSH_MIGRATION_DIR/$(basename "$source")"
    printf '  PENDING: %s -> %s\n' "$version" "$(basename "$source")"
  done

  printf 'PASS: isolated canonical push chain prepared at %s\n' "$PUSH_ROOT"
}

run_isolated_push_dry_run() {
  (
    cd "$PUSH_ROOT"
    supabase db push --linked --dry-run
  )
}

run_isolated_push() {
  (
    cd "$PUSH_ROOT"
    supabase db push --linked
  )
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

load_versions remote-only remote-only "$BACKUP_ROOT/migration-list-before.txt"
load_versions local-only local-only "$BACKUP_ROOT/migration-list-before.txt"
load_versions remote remote "$BACKUP_ROOT/migration-list-before.txt"

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
  if run_isolated_fetch; then
    printf 'PASS: installed Supabase CLI fetch completed in isolation\n'
  else
    printf 'WARN: installed Supabase CLI isolated fetch failed\n'
  fi
  copy_isolated_migrations

  if [ "$(count_missing_remote_files)" -gt 0 ]; then
    printf 'WARN: retrying isolated migration fetch with latest Supabase CLI\n'
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

load_versions remote-only-after remote-only "$BACKUP_ROOT/migration-list-after.txt"
load_versions local-only-after local-only "$BACKUP_ROOT/migration-list-after.txt"
load_versions remote remote "$BACKUP_ROOT/migration-list-after.txt"

if [ "${#REMOTE_ONLY_AFTER[@]}" -gt 0 ]; then
  printf 'FAIL: remote-only migration rows remain:\n'
  printf '%s\n' "${REMOTE_ONLY_AFTER[@]}"
  exit 2
fi

printf 'PASS: local migration files cover every remote migration version\n'
printf '\nRepository local-only versions:\n'
print_versions_or_none "${LOCAL_ONLY_AFTER[@]}"

printf '\nApproved pending Creative versions:\n'
print_versions_or_none "${CREATIVE_PENDING_VERSIONS[@]}"

printf '\nLegacy local-only versions excluded from execution:\n'
LEGACY_COUNT=0
for version in "${LOCAL_ONLY_AFTER[@]}"; do
  if ! contains_version "$version" "${CREATIVE_PENDING_VERSIONS[@]}"; then
    printf '%s\n' "$version"
    LEGACY_COUNT=$((LEGACY_COUNT + 1))
  fi
done
[ "$LEGACY_COUNT" -gt 0 ] || printf 'none\n'

section "ISOLATED CANONICAL DRY RUN"
prepare_isolated_push
if run_isolated_push_dry_run; then
  printf 'PASS: isolated Supabase db push dry-run\n'
else
  printf 'FAIL: isolated dry-run rejected the canonical migration chain\n'
  exit 1
fi

if [ "${APPLY_CREATIVE_MIGRATIONS:-0}" = "1" ]; then
  section "APPLY APPROVED CREATIVE MIGRATIONS"
  run_isolated_push
  printf 'PASS: approved Creative migrations applied\n'
else
  printf '\nWARN: dry-run only. Set APPLY_CREATIVE_MIGRATIONS=1 after reviewing this report.\n'
fi

section "FINAL"
supabase migration list --linked
printf 'Recovery report: %s\n' "$REPORT"
printf 'Backup directory: %s\n' "$BACKUP_ROOT"
printf 'Canonical push workspace: %s\n' "$PUSH_ROOT"
printf 'CREATIVE_MIGRATION_RECOVERY=PASS\n'
