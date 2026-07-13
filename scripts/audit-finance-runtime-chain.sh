#!/bin/bash

echo "=================================================="
echo "FINANCE RUNTIME CHAIN AUDIT"
echo "=================================================="


echo
echo "1. ERP ENGINE"
echo "=================================================="

grep -R -n \
"getWorkspaceItemByRoute\|ERP_REGISTRY\|RendererRegistry" \
lib/platform/erp-engine \
lib/platform/registry \
2>/dev/null | head -100


echo
echo "2. MASTER DATA RUNTIME"
echo "=================================================="

grep -R -n \
"MasterDataRuntime\|MasterDataRenderer\|MasterDataWorkCenter" \
components lib \
2>/dev/null | head -100


echo
echo "3. FORM REGISTRY"
echo "=================================================="

sed -n '1,220p' \
lib/platform/forms/FormRegistry.js


echo
echo "4. ENGINE REGISTRY"
echo "=================================================="

sed -n '1,220p' \
lib/platform/engines/EngineRegistry.js


echo
echo "5. ACTION RESOLUTION"
echo "=================================================="

sed -n '1,220p' \
components/workspace/master-data/CapabilityActionResolver.jsx


echo
echo "6. CAPABILITY REGISTRY"
echo "=================================================="

sed -n '1,220p' \
lib/capability-registry/CapabilityRegistry.js


echo
echo "7. MASTER DATA CONFIG CHECK"
echo "=================================================="

grep -R -n \
"repository\|table\|form\|capability\|actions" \
lib/platform/registry/erpRegistry.js \
components/workspace/master-data \
2>/dev/null | head -200


echo
echo "=================================================="
echo "RUNTIME CHAIN AUDIT COMPLETE"
echo "=================================================="

