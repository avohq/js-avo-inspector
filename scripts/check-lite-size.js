const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const OUTPUT_DIR = path.join(__dirname, "..", "test-bundle-size", "output");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const WEBPACK_CONFIG = path.join(__dirname, "webpack.lite-size.config.js");
const BUNDLE_PATH = path.join(OUTPUT_DIR, "bundle-lite.js");
const TERSER_PATH = path.join(OUTPUT_DIR, "bundle-lite-terser.js");

console.log("=== Lite Bundle Size Check ===\n");

// Build with webpack
console.log("Building lite bundle with webpack...");
execSync(`npx webpack --config ${WEBPACK_CONFIG}`, { stdio: "inherit" });

// Minify with terser
console.log("\nMinifying with terser...");
execSync(
  `npx terser ${BUNDLE_PATH} --compress passes=2,unsafe=true,unsafe_comps=true --mangle --output ${TERSER_PATH}`,
  { stdio: "inherit" }
);

// Measure
const minified = fs.readFileSync(TERSER_PATH);
const gzipped = zlib.gzipSync(minified);

const minKB = (minified.length / 1024).toFixed(1);
const gzKB = (gzipped.length / 1024).toFixed(1);

console.log(`\nResults:`);
console.log(`  Minified: ${minKB} KB`);
console.log(`  Gzipped:  ${gzKB} KB`);

const MAX_GZIP_KB = 7;
if (gzipped.length / 1024 > MAX_GZIP_KB) {
  console.error(`\nFAIL: Gzipped size ${gzKB} KB exceeds ${MAX_GZIP_KB} KB limit`);
  process.exit(1);
} else {
  console.log(`\nPASS: Under ${MAX_GZIP_KB} KB gzipped limit`);
}
