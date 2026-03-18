# Lite Bundle Size — Rollup

Rollup production build with node-resolve, commonjs, and terser plugins.

## Run
```bash
npm install && npx rollup -c
```

## Expected output
- `build/bundle.min.js` — under 7 KB gzipped
- Zero encryption code, zero event-spec validation code
