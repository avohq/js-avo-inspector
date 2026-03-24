# Lite Bundle Size — Terser-Only Pipeline

Simulates a GTM custom HTML tag setup.

## Pipeline

1. esbuild bundles `avo-inspector/lite` into a single ES5 file
2. terser minifies with aggressive compression

## Run

```bash
npm install && bash build.sh
```

## Expected output

- `build/bundle.min.js` — under 7 KB gzipped
- Zero encryption code, zero event-spec validation code
