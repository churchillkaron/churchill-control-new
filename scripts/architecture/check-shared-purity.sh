#!/bin/bash

echo "Checking shared purity..."

RESULT=$(grep -R "@/domains\|restaurant\|kitchen\|vip" lib/shared \
--exclude-dir=node_modules \
--exclude="*.backup.js" \
--exclude=moduleRegistry.js \
--exclude=registerSystemEvents.js)

if [ -z "$RESULT" ]; then
  echo "PASS: shared is pure"
else
  echo "FAIL: shared contamination detected"
  echo "$RESULT"
  exit 1
fi
