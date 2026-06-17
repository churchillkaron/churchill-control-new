#!/bin/bash

OUT="audits/operational-audit-$(date +%Y%m%d-%H%M%S).txt"

echo "CHURCHILL OPERATIONAL AUDIT" > "$OUT"
echo "Generated: $(date)" >> "$OUT"
echo "" >> "$OUT"

echo "=== PROJECT ROOT ===" >> "$OUT"
find . -maxdepth 2 \
  -not -path "./node_modules*" \
  -not -path "./.next*" \
  -not -path "./.git*" \
  | sort >> "$OUT"

echo "" >> "$OUT"
echo "=== APP ROUTES ===" >> "$OUT"
find app -type f \( -name "page.js" -o -name "page.jsx" -o -name "route.js" -o -name "layout.js" \) \
  | sort >> "$OUT"

echo "" >> "$OUT"
echo "=== LOGIN / AUTH FILES ===" >> "$OUT"
find app lib -type f \
  \( -iname "*login*" -o -iname "*auth*" -o -iname "*callback*" -o -iname "*middleware*" \) \
  -not -path "*/node_modules/*" \
  | sort >> "$OUT"

echo "" >> "$OUT"
echo "=== ORGANIZATION / TENANT FILES ===" >> "$OUT"
grep -R "organizationId\|organization_id\|tenantId\|tenant_id\|useOrganization\|OrganizationProvider\|TenantProvider\|getTenantId" \
  app lib middleware.js \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  -n >> "$OUT" 2>/dev/null

echo "" >> "$OUT"
echo "=== SUPABASE CLIENT USAGE ===" >> "$OUT"
grep -R "createClient\|createServerSupabase\|createAdminSupabase\|supabase" \
  app lib middleware.js \
  --exclude-dir=node_modules \
  --exclude-dir=.next \
  -n >> "$OUT" 2>/dev/null

echo "" >> "$OUT"
echo "=== POSSIBLE DUPLICATE PROVIDERS / RUNTIMES ===" >> "$OUT"
find app lib -type f \
  \( -iname "*tenant*" -o -iname "*organization*" -o -iname "*runtime*" -o -iname "*workspace*" \) \
  -not -path "*/node_modules/*" \
  | sort >> "$OUT"

echo "" >> "$OUT"
echo "=== API ROUTES ===" >> "$OUT"
find app/api -type f -name "route.js" | sort >> "$OUT"

echo "" >> "$OUT"
echo "=== PACKAGE SCRIPTS ===" >> "$OUT"
cat package.json >> "$OUT"

echo "" >> "$OUT"
echo "Audit saved to: $OUT"
