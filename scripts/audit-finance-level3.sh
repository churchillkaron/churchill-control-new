#!/bin/bash

echo "=================================================="
echo "FINANCE LEVEL 3 CAPABILITY AUDIT"
echo "=================================================="

echo
echo "Checking Finance registry workspaces..."
echo

REGISTRY="lib/platform/registry/erpRegistry.js"

if [ ! -f "$REGISTRY" ]; then
  echo "ERROR: Registry not found"
  exit 1
fi


FINANCE_ITEMS=$(grep -o 'id: "[^"]*"' "$REGISTRY" | sed 's/id: "//;s/"//' | sort -u)


for ITEM in $FINANCE_ITEMS
do

  case "$ITEM" in
    customers|customer_invoices|customer_payments|vendors|vendor_bills|bank_accounts|payments|journals|chart_of_accounts|legal_entities|cost_centers|tax_codes|fixed_assets|fiscal_periods|dimensions)
      
      echo
      echo "=================================================="
      echo "WORKSPACE: $ITEM"
      echo "=================================================="


      echo
      echo "REGISTRY"
      grep -n \
      "id: \"$ITEM\"" \
      "$REGISTRY" \
      | head -1


      echo
      echo "ROUTE"
      grep -n \
      "/finance/$ITEM" \
      "$REGISTRY" \
      | head -1


      echo
      echo "API SEARCH"
      grep -R -n \
      "/api/finance/$ITEM\|api/finance/${ITEM//_/-}" \
      app/api/finance \
      2>/dev/null \
      | head -5


      echo
      echo "FORM SEARCH"
      grep -R -n \
      "$ITEM\|${ITEM//_/ -}" \
      lib/platform/forms \
      2>/dev/null \
      | head -5


      echo
      echo "CAPABILITY SEARCH"
      grep -R -n \
      "$ITEM\|${ITEM//_/\.}" \
      lib/capability-registry \
      lib/finance/runtime \
      2>/dev/null \
      | head -5


      echo
      echo "SERVICE SEARCH"
      grep -R -n \
      "$ITEM" \
      lib/finance \
      2>/dev/null \
      | head -5


      echo
      echo "DATABASE REFERENCES"
      grep -R -n \
      "\.from(" \
      lib/finance \
      2>/dev/null \
      | grep "$ITEM\|${ITEM//_/}" \
      | head -5

      ;;

  esac

done


echo
echo "=================================================="
echo "LEVEL 3 AUDIT COMPLETE"
echo "=================================================="
