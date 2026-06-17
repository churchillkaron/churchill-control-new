#!/bin/bash

set -e

OUT="audit/avantiqo-full-audit.txt"

echo "AVANTIQO FULL AUDIT" > "$OUT"
echo "Generated: $(date)" >> "$OUT"
echo "==============================" >> "$OUT"

echo "" >> "$OUT"
echo "PROJECT TREE SUMMARY" >> "$OUT"
echo "==============================" >> "$OUT"
find app lib components hooks contexts providers public \
  -maxdepth 5 \
  -type f 2>/dev/null \
  | sort >> "$OUT"

echo "" >> "$OUT"
echo "ROUTES" >> "$OUT"
echo "==============================" >> "$OUT"
find app -name "page.js" -o -name "page.jsx" -o -name "route.js" \
  | sort >> "$OUT"

echo "" >> "$OUT"
echo "DUPLICATE / LEGACY SUSPICIOUS FILES" >> "$OUT"
echo "==============================" >> "$OUT"
find . \
  \( -name "*copy*" -o -name "*backup*" -o -name "*old*" -o -name "*.bak" -o -name "*.tmp" -o -name "*legacy*" \) \
  -not -path "./node_modules/*" \
  -not -path "./.next/*" \
  | sort >> "$OUT"

echo "" >> "$OUT"
echo "SUPABASE CLIENT USAGE" >> "$OUT"
echo "==============================" >> "$OUT"
grep -R "createClient\|supabaseAdmin\|createServerSupabase\|createBrowserClient\|SERVICE_ROLE" \
  app lib components \
  --exclude-dir=node_modules \
  -n >> "$OUT" || true

echo "" >> "$OUT"
echo "DIRECT DATABASE TABLE REFERENCES" >> "$OUT"
echo "==============================" >> "$OUT"
grep -R "\.from(\"\\|\.from('" \
  app lib components \
  --exclude-dir=node_modules \
  -n >> "$OUT" || true

echo "" >> "$OUT"
echo "TODO / FIXME / TEMP / MOCK / TEST DATA" >> "$OUT"
echo "==============================" >> "$OUT"
grep -R "TODO\|FIXME\|TEMP\|MOCK\|mock\|test data\|hardcoded\|dummy\|fake" \
  app lib components \
  --exclude-dir=node_modules \
  -n >> "$OUT" || true

echo "" >> "$OUT"
echo "POSSIBLE DEAD IMPORTS / BROKEN IMPORTS" >> "$OUT"
echo "==============================" >> "$OUT"
grep -R "^import .* from" \
  app lib components \
  --exclude-dir=node_modules \
  -n >> "$OUT" || true

echo "" >> "$OUT"
echo "API ROUTES" >> "$OUT"
echo "==============================" >> "$OUT"
find app/api -name "route.js" 2>/dev/null | sort >> "$OUT"

echo "" >> "$OUT"
echo "DUPLICATE FILENAMES" >> "$OUT"
echo "==============================" >> "$OUT"
find app lib components \
  -type f 2>/dev/null \
  | awk -F/ '{print $NF}' \
  | sort \
  | uniq -d >> "$OUT"

echo "" >> "$OUT"
echo "LARGE FILES" >> "$OUT"
echo "==============================" >> "$OUT"
find app lib components \
  -type f 2>/dev/null \
  -exec wc -l {} \; \
  | sort -nr \
  | head -80 >> "$OUT"

echo "" >> "$OUT"
echo "DONE" >> "$OUT"

cat "$OUT"
