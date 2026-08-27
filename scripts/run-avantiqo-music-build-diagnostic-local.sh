#!/usr/bin/env bash
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date +%Y%m%d_%H%M%S)"
LOG="/tmp/AVANTIQO_MUSIC_BUILD_DIAGNOSTIC_${STAMP}.log"
LINT_LOG="/tmp/AVANTIQO_MUSIC_SCOPED_LINT_${STAMP}.log"

cd "$ROOT"

echo "============================================================"
echo "AVANTIQO MUSIC - FOCUSED BUILD DIAGNOSTIC"
echo "============================================================"
echo "ROOT=$ROOT"
echo "HEAD=$(git rev-parse --short HEAD 2>/dev/null || echo UNKNOWN)"
echo "BUILD_LOG=$LOG"
echo "LINT_LOG=$LINT_LOG"
echo ""

MUSIC_LINT_RC=0
if [ -x "$ROOT/node_modules/.bin/eslint" ]; then
  "$ROOT/node_modules/.bin/eslint" \
    app/api/creative/music \
    lib/creative/music \
    components/creative/ProductionStudio/workspaces \
    --ext .js,.jsx,.ts,.tsx \
    >"$LINT_LOG" 2>&1
  MUSIC_LINT_RC=$?
  echo "AVANTIQO_MUSIC_SCOPED_LINT_RC=$MUSIC_LINT_RC"
  if [ "$MUSIC_LINT_RC" -ne 0 ]; then
    echo ""
    echo "---------------- MUSIC-SCOPED LINT FAILURE ----------------"
    grep -nE -B 3 -A 8 '(^|[[:space:]])(Error:|error[[:space:]]|Parsing error|React Hook|react-hooks/)' "$LINT_LOG" | tail -n 180 || tail -n 180 "$LINT_LOG"
    echo "------------------------------------------------------------"
  fi
else
  echo "AVANTIQO_MUSIC_SCOPED_LINT_RC=SKIPPED_ESLINT_NOT_INSTALLED"
fi

echo ""
echo "Running production build with full output captured..."
NEXT_TELEMETRY_DISABLED=1 npm run build >"$LOG" 2>&1
BUILD_RC=$?

echo "AVANTIQO_MUSIC_BUILD_RC=$BUILD_RC"

if [ "$BUILD_RC" -ne 0 ]; then
  echo ""
  echo "---------------- ACTUAL BUILD FAILURE ----------------"
  MATCHED=0
  if grep -nE -B 5 -A 14 'Failed to compile|Build error occurred|Module not found|Type error:|Parsing error|React Hook|react-hooks/|ReferenceError:|SyntaxError:|Error:' "$LOG" | tail -n 240; then
    MATCHED=1
  fi
  if [ "$MATCHED" -eq 0 ]; then
    tail -n 240 "$LOG"
  fi
  echo "------------------------------------------------------"
  echo "FULL_BUILD_LOG=$LOG"
else
  echo "AVANTIQO_MUSIC_BUILD=PASS"
fi

echo ""
if [ "$MUSIC_LINT_RC" -eq 0 ] && [ "$BUILD_RC" -ne 0 ]; then
  echo "AVANTIQO_MUSIC_DIAGNOSIS=MUSIC_SCOPED_LINT_GREEN_GLOBAL_BUILD_FAILED"
elif [ "$MUSIC_LINT_RC" -ne 0 ]; then
  echo "AVANTIQO_MUSIC_DIAGNOSIS=MUSIC_SCOPED_LINT_FAILED"
elif [ "$BUILD_RC" -eq 0 ]; then
  echo "AVANTIQO_MUSIC_DIAGNOSIS=BUILD_GREEN"
fi

echo "============================================================"
echo "AVANTIQO_MUSIC_BUILD_DIAGNOSTIC_RC=$BUILD_RC"
echo "============================================================"
echo "Terminal remains open."

exit "$BUILD_RC"
