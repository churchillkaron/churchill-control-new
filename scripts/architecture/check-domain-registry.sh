#!/bin/bash

echo "Checking domain registry..."

grep -R "registerDomain(" domains --exclude-dir=node_modules > /dev/null

if [ $? -eq 0 ]; then
  echo "PASS: domains self-register"
else
  echo "FAIL: no registered domains found"
  exit 1
fi
