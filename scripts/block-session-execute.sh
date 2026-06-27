#!/bin/bash

echo "Checking for forbidden session execute imports..."

if grep -R "@/lib/restaurant/session/.*/execute" lib/pos; then
  echo "❌ ERROR: Direct session execute usage detected in POS"
  exit 1
fi

echo "✅ OK: POS is clean"
