#!/bin/bash

echo "Checking finance/core purity..."

RESULT=$(grep -R "@/lib/intelligence\|@/domains\|@/lib/platform\|@/lib/runtime" lib/finance/core --exclude-dir=node_modules)

if [ -z "$RESULT" ]; then
  echo "PASS: finance/core is pure"
else
  echo "FAIL: finance/core contamination detected"
  echo "$RESULT"
  exit 1
fi
