#!/usr/bin/env bash

set -u

PROJECT_ROOT="${AVANTIQO_PROJECT_ROOT:-$HOME/Projects/churchill-control-new}"
BASE_URL="http://127.0.0.1:3000"
STAMP="$(date +%Y%m%d_%H%M%S)"
SESSION_FILE="$(mktemp)"
BOOTSTRAP_FILE="$(mktemp)"
DRY_LOG="$(mktemp)"
REPORT="/tmp/AVANTIQO_FINANCE_WORKSPACE_CRUD_CERTIFICATION_${STAMP}.json"
MIGRATION="20260726121500_finance_workspace_crud_certification.sql"
CREATIVE_HOLD_DIR="/tmp/avantiqo-finance-crud-cert-creative-${STAMP}-$$"
CREATIVE_MIGRATIONS=(
