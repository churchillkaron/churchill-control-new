#!/bin/bash

echo ""
echo "ENTERPRISE ARCHITECTURE VALIDATION"
echo "================================="

./scripts/architecture/check-runtime-purity.sh || exit 1
./scripts/architecture/check-finance-core-purity.sh || exit 1
./scripts/architecture/check-shared-purity.sh || exit 1
./scripts/architecture/check-orchestration-purity.sh || exit 1
./scripts/architecture/check-intelligence-purity.sh || exit 1
./scripts/architecture/check-domain-registry.sh || exit 1

echo ""
echo "ALL ARCHITECTURE CHECKS PASSED"
