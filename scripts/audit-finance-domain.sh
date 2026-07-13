#!/bin/bash

echo "=================================================="
echo "AVANTIQO / CHURCHILL FINANCE DOMAIN AUDIT"
echo "=================================================="

ROOT="$(pwd)"

echo
echo "PROJECT:"
echo "$ROOT"

echo
echo "=================================================="
echo "1. FINANCE REGISTRY CHECK"
echo "=================================================="

grep -R -n \
"finance" \
lib/platform/registry \
2>/dev/null | head -100


echo
echo "=================================================="
echo "2. FINANCE ROUTE CHECK"
echo "=================================================="

find app -type f | grep finance || true


echo
echo "=================================================="
echo "3. FINANCE HARD CODED PAGE CHECK"
echo "=================================================="

grep -R -n \
"FinanceNav\|FinanceMegaMenu\|finance/page\|createCustomer\|createVendor" \
app components lib \
2>/dev/null | head -200


echo
echo "=================================================="
echo "4. TENANT VIOLATION CHECK"
echo "=================================================="

grep -R -n \
"tenant_id\|tenantId\|TenantProvider\|requireTenantAccess" \
app lib components \
2>/dev/null | head -200


echo
echo "=================================================="
echo "5. FINANCE CONTEXT CHECK"
echo "=================================================="

grep -R -n \
"organization_id\|entity_id\|period_id" \
lib/finance app/api/finance \
2>/dev/null | head -200


echo
echo "=================================================="
echo "6. FORM REGISTRY CHECK"
echo "=================================================="

grep -R -n \
"FormRegistry\|form:" \
lib components app \
2>/dev/null | head -200


echo
echo "=================================================="
echo "7. ACTION ENGINE CHECK"
echo "=================================================="

grep -R -n \
"EngineRegistry\|engine:" \
lib components app \
2>/dev/null | head -200


echo
echo "=================================================="
echo "8. CAPABILITY CHECK"
echo "=================================================="

grep -R -n \
"CapabilityRegistry\|capability:" \
lib components app \
2>/dev/null | head -200


echo
echo "=================================================="
echo "9. FINANCE SERVICE / REPOSITORY CHECK"
echo "=================================================="

find lib/finance -type f \
2>/dev/null | sort


echo
echo "=================================================="
echo "10. DATABASE REFERENCE CHECK"
echo "=================================================="

grep -R -n \
"from(\"" \
lib/finance app/api/finance \
2>/dev/null | head -200


echo
echo "=================================================="
echo "AUDIT COMPLETE"
echo "=================================================="
