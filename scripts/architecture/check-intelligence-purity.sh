#!/bin/bash

echo "Checking intelligence purity..."

RESULT=$(grep -R "@/app/" lib/intelligence --exclude-dir=node_modules)

if [ -z "$RESULT" ]; then
  echo "PASS: intelligence is isolated from UI"
else
  echo "FAIL: intelligence importing UI"
  echo "$RESULT"
  exit 1
fi
