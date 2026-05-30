#!/bin/bash

echo "Checking runtime purity..."

RESULT=$(grep -R "@/domains\|@/lib/intelligence\|@/lib/finance" lib/runtime --exclude-dir=node_modules)

if [ -z "$RESULT" ]; then
  echo "PASS: runtime is pure"
else
  echo "FAIL: runtime contamination detected"
  echo "$RESULT"
  exit 1
fi
