#!/bin/bash

FILES=(
"lib/audit/createAuditLog.js"
"lib/finance/core/createAuditLog.js"
"lib/pos/audit/createAuditLog.js"
"lib/shared/audit/createAuditLog.js"
"lib/finance/closeAccountingPeriod.js"
"lib/finance/monthEnd/closeAccountingPeriod.js"
"lib/finance/period-close/closeAccountingPeriod.js"
"lib/finance/core/runBankReconciliation.js"
"lib/finance/reconciliation/runBankReconciliation.js"
"lib/finance/core/runConsolidation.js"
"lib/finance/runConsolidation.js"
"lib/finance/invoice-matching/runThreeWayMatch.js"
"lib/procurement/core/runThreeWayMatch.js"
)

for file in "${FILES[@]}"; do
  echo "========================================"
  echo "$file"
  echo "----------------------------------------"
  base="${file%.js}"
  alias="@/${base}"
  grep -R "$alias\|$base" app lib components -n \
    --exclude="*.bak" \
    --exclude="*.legacy" \
    --exclude="*.backup" \
    --exclude="*.json" \
    | head -40
done
