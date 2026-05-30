#!/bin/bash

echo "Checking orchestration purity..."

RESULT=$(grep -RE "\brestaurant\b|\bkitchen\b|\bvip\b|\btables\b|@/domains" lib/orchestration \
--exclude-dir=node_modules)

if [ -z "$RESULT" ]; then
  echo "PASS: orchestration is pure"
else
  echo "FAIL: orchestration contamination detected"
  echo "$RESULT"
  exit 1
fi
