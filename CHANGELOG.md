# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2026-03-19

### Added

- **Lite entry point** (`avo-inspector/lite`): A production-optimized build that physically excludes encryption, event spec validation, `@noble/curves`, and `safe-regex2`. Reduces gzipped bundle size from ~37 KB to ~7.5 KB (79% smaller). Works universally with any bundler or minifier — no flags or configuration needed.
  - Import: `import { AvoInspector, AvoInspectorEnv } from "avo-inspector/lite"`
  - Same async API as the full version (`trackSchemaFromEvent`, `trackSchema`, `extractSchema`)
  - `publicEncryptionKey` constructor option removed from lite types (TypeScript will error if passed)
  - Ideal for GTM, script tags, and size-sensitive production deployments
- **Drift detection script** (`yarn verify:lite-sync`): Detects when lite copies diverge from originals
- **Automated size check** (`yarn check:lite-size`): Verifies lite bundle stays under size limit
- **Example apps** in `examples/lite-size-demos/` demonstrating lite bundle size with terser, webpack, and rollup

### Fixed

- **AvoBatcher**: Skip flush when event queue is empty (prevented unnecessary empty HTTP requests on startup)
- **AvoDeduplicator**: Use unique IDs per event registration instead of event name as key, preventing same-name events from overwriting each other within the 300ms deduplication window
- **AvoSchemaParser**: Use `Object.prototype.hasOwnProperty.call()` instead of `object.hasOwnProperty()` for safe property enumeration on `Object.create(null)` objects

### Changed

- `prepublishOnly` now runs `verify:lite-sync` and `check:lite-size` before publishing
- Added `terser` as devDependency for deterministic size checks
- Package `exports` map now includes `"./lite"` subpath

## [3.0.1] - 2025-12-11

### Fixed

- Fixed cache invalidation logic for branch changes in event spec fetching

## [3.0.0] - 2025-12-11

### Changed

- **Encryption Migration**: Migrated encryption implementation from `eciesjs` (secp256k1) to `@noble/curves` + Web Crypto API (prime256v1 / NIST P-256) for browser compatibility
  - Uses `@noble/curves` library for ECDH operations (lightweight, modern, audited - ~20KB)
  - Uses Web Crypto API for AES-256-GCM encryption/decryption
  - Updated curve to prime256v1 (NIST P-256), standard for Web Crypto API
  - Updated CLI tool to use Node.js crypto (Node-only, so crypto module is fine)
  - Maintains same encryption format specification: `[Version(1b)] + [EphemeralPubKey(65b)] + [IV(16b)] + [AuthTag(16b)] + [Ciphertext]`
  - Maintains same key format (Hex strings) for compatibility with other languages

### Breaking Changes

- **[Breaking]** `extractSchema()` is now an async function and returns `Promise<EventProperty[]>`
  - All callers must now use `await` when calling `extractSchema()`
  - Example migration:
    ```javascript
    // Before (v2.x)
    const schema = inspector.extractSchema(eventProperties);
    
    // After (v3.0)
    const schema = await inspector.extractSchema(eventProperties);
    ```
- **[Breaking]** `shouldRegisterSchemaFromManually()` in `AvoDeduplicator` is now async. It should not be used in the client code though.

### Removed

- Removed `eciesjs` dependency (replaced with `@noble/curves`)
- Removed `elliptic` dependency (replaced with `@noble/curves`)

### Added

- Added `@noble/curves` dependency for browser-compatible ECDH operations (lightweight, modern, audited)

## [2.2.1-alpha] - 2025-11-24

### Added

- **ECC Property Value Encryption**: Optional `publicEncryptionKey` parameter on SDK initialization enables zero-knowledge encryption of property values in dev/staging environments using ECIES (Elliptic Curve Integrated Encryption Scheme). Avo never has access to the private key, ensuring complete data privacy.
  - Uses prime256v1 (NIST P-256) curve with AES-256-GCM for hybrid encryption (standard for Web Crypto API)
  - Only encrypts in dev/staging environments (production sends schema only)
  - Adds optional `encryptedPropertyValue` field to event schema
  - CLI tool for key generation: `npx avo-inspector generate-keys`
  - Note: Key generation and decryption are not exported from SDK (use CLI tool for keys, decryption happens in Avo's dashboard)

- **EventSpec Fetching**: Automatically fetches and caches event specifications from Avo API in dev/staging environments
  - Non-blocking async API calls
  - In-memory caching for performance
  - NOT called in production (prod remains simple and fast)
  - Foundation for Phase 2: event validation

### Changed

- Production environment now optimized: no property values, no encryption, no EventSpec API calls
- Dev/Staging environments now support rich debugging with encrypted values and event specs

## 2.2.0

- Add anonymous ID support to track events without user identification

## 2.1.0

- Add `set networkTimeout` setter, in ms
- Improve timeout errors handling

## 2.0.0

- Contains no changes for most users
- [Breaking] Upgrades Reason bindings to Rescript. This is a breaking change for users who are using bs-platform as that's no longer supported. The bindings now support Rescript 9.1, 10, 11 and later. The interface has changed slightly with lowercase `env` variants and dropping the unit at the end of the constructor.

## 1.4.2

Security update

## 1.4.1

Security update

## 1.3.0

Multiple Avo Inspector instances support, with the optional `suffix` constructor parameter
