#!/bin/bash
set -eo pipefail

echo "=== Lite Copy Drift Detection ==="

# Pairs: original -> lite copy
# AvoSchemaParserLite is excluded — it has structural changes (methods removed),
# requiring manual review rather than automated threshold checking.
PAIRS=(
  "src/AvoNetworkCallsHandler.ts:src/lite/AvoNetworkCallsHandlerLite.ts"
  "src/AvoBatcher.ts:src/lite/AvoBatcherLite.ts"
  "src/AvoDeduplicator.ts:src/lite/AvoDeduplicatorLite.ts"
  "src/AvoStreamId.ts:src/lite/AvoStreamIdLite.ts"
)

THRESHOLD=15  # max allowed diff lines (import path changes, class rename, alias export)
FAILED=0

for pair in "${PAIRS[@]}"; do
  IFS=: read -r original lite <<< "$pair"
  DIFF_LINES=$(diff <(sed '1,2d' "$original") <(sed '1,2d' "$lite") | grep '^[<>]' | wc -l | tr -d ' ')
  echo "  $lite: $DIFF_LINES diff lines (threshold: $THRESHOLD)"
  if [ "$DIFF_LINES" -gt "$THRESHOLD" ]; then
    echo "    FAIL: drift exceeds threshold"
    FAILED=1
  fi
done

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo "FAILED: Some lite copies have drifted beyond threshold."
  echo "Review the diffs and update lite copies if needed."
  exit 1
fi

echo ""
echo "PASSED: All lite copies within drift threshold."
