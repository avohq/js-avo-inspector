#!/bin/bash
set -e
cd "$(dirname "$0")"
mkdir -p build
npx esbuild entry.js --bundle --platform=browser --target=es5 --outfile=build/bundle.js
npx terser build/bundle.js --compress passes=2,unsafe=true,unsafe_comps=true --mangle --output build/bundle.min.js
echo ""
echo "Results:"
RAW=$(wc -c < build/bundle.js | tr -d ' ')
MIN=$(wc -c < build/bundle.min.js | tr -d ' ')
GZIP=$(gzip -c build/bundle.min.js | wc -c | tr -d ' ')
echo "  Raw:      $RAW bytes"
echo "  Minified: $MIN bytes"
echo "  Gzipped:  $GZIP bytes ($(echo "scale=1; $GZIP/1024" | bc) KB)"
echo ""
echo "Checking for dev-only code:"
grep -q "AvoEncryption\|noble\|EventSpecCache" build/bundle.min.js && echo "  FAIL: dev code found" || echo "  PASS: no dev code"
