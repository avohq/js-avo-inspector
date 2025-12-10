# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.0.0-alpha.1] - 2025-12-09

### Changed

- **Encryption Migration**: Migrated encryption implementation from `eciesjs` (secp256k1) to `elliptic` library + Web Crypto API (prime256v1 / NIST P-256) for browser compatibility
  - Uses `elliptic` library for ECDH operations (browser-compatible)
  - Uses Web Crypto API for AES-256-GCM encryption/decryption
  - Updated curve to prime256v1 (NIST P-256), standard for Web Crypto API
  - Updated CLI tool to use Node.js crypto (Node-only, so crypto module is fine)
  - Maintains same encryption format specification: `[Version(1b)] + [EphemeralPubKey(65b)] + [IV(16b)] + [AuthTag(16b)] + [Ciphertext]`

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
- **[Breaking]** `shouldRegisterSchemaFromManually()` in `AvoDeduplicator` is now async

### Removed

- Removed `eciesjs` dependency (replaced with `elliptic`)

### Added

- Added `elliptic` dependency for browser-compatible ECDH operations
- Added `@types/elliptic` dev dependency

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
