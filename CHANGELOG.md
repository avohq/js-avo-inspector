# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.3.0] - 2026-09-02

### Added

- **`options` parameter for gateway hints on `trackSchemaFromEvent` and `trackSchema`**: Both track methods now accept an optional third argument, `options: TrackOptions`, on the full build (`AvoInspector`) and the lite build (`AvoInspectorLite`).
  - `TrackOptions` is `{ outputReference?: string; originHint?: string; appVersion?: string }`, exported as a type from the package root (`avo-inspector`) and from the lite entry (`avo-inspector/lite`).
  - `outputReference` identifies which gateway output (destination checkpoint) an observation was bound for; omit it for a gateway-level observation.
  - `originHint` identifies the event's upstream source (e.g. `"web"`, `"ios"`) and should be a low-cardinality value, never a user identifier.
  - `appVersion` sets the app version of the source that produced the event. When `originHint` is set, the event came from a different source than the app this SDK instance was configured for, so `appVersion` replaces the SDK's configured version on that event's body — sent as `null` when `originHint` is set but `appVersion` is omitted, rather than falling back to the SDK's root version. When `originHint` is not set, `appVersion` overrides the SDK's configured version only when provided; omitting both leaves the root version unchanged.
  - All three fields are sent as top-level siblings of `eventProperties` on the track request body, never nested inside the schema.
  - **Normalization**: string values are trimmed; empty strings, whitespace-only strings, and non-string values (numbers, booleans, `null`, objects, arrays) are omitted entirely. Omitted `outputReference`/`originHint` are never sent as `null` or `""`. `appVersion` is the one field in `TrackOptions` that can legitimately be sent as a literal `null` on the wire (with `originHint` set and `appVersion` omitted) — see rule above.
  - **Backward compatible**: calling either method without the `options` argument (or with an empty `{}`) adds no new keys to the request body. The body is byte-for-byte what 3.2.0 sent apart from the `libVersion` value, which carries the release number and therefore changes in every release.
  - Events tracked through Avo Codegen (Avo Functions) never carry `outputReference`/`originHint`/`appVersion`, since Codegen-generated calls have no per-call gateway configuration to pass.
  - The endpoint reads all three fields, including a literal `appVersion: null` (recorded as `"unversioned"`), so no field has to be paired with another. See the endpoint change below.
- **`client` constructor option**: sets the `X-Avo-Client` request header, which tells Avo which kind of client produced the traffic. Defaults to `"web"`; leave it alone unless this SDK is embedded in another Avo integration that needs its own attribution. The script-tag build reads the same value from `window.inspector.__CLIENT__`, alongside the existing `__API_KEY__`/`__ENV__`/`__VERSION__`/`__APP_NAME__` — which is how the Avo web GTM tag template declares itself as `"gtm-web"`. The value is trimmed and validated against `/^[A-Za-z0-9._-]{1,64}$/`, falling back to `"web"` otherwise — a value the browser refuses as a header would abort request setup and stop the SDK sending entirely.

### Changed

- **Track requests now go to the unified endpoint `POST https://api.avo.app/inspector/v2/track`** (was `POST /inspector/v1/track`), which is the endpoint that decodes the gateway coordinates above. Every Avo Inspector sender is moving to it so traffic can be attributed at the edge without decoding a body.
  - The API key and environment now travel as the `api-key` and `env` request headers, joined by `X-Avo-Client`. They are still sent in the request body too: v2 ignores the body copies, and keeping them keeps one body shape across endpoint versions.
  - `Content-Type` changed from `text/plain` to `application/json`. `text/plain` existed only to stay inside the CORS safelist and avoid a preflight; the three new headers are not safelisted, so **every** request is preflighted now regardless — and v2's body reader parses a `text/plain` body a second time and throws.
  - **Server-side sampling is gone on v2**: the response always carries `samplingRate: 1.0`, so stored counts are exact rather than extrapolated. The SDK's own sampling logic is unchanged and still applies whatever rate the response carries.

### Known limitations

- **Browser traffic is blocked until the ingestion endpoint's CORS preflight allows the new headers.** `api-key`, `env` and `X-Avo-Client` are not CORS-safelisted, and the endpoint's `Access-Control-Allow-Headers` response does not list them yet, so browsers refuse the request before it is sent. They must be added to that list rather than replacing it — `Content-Encoding` is already allowed and a gzipped batch still preflights with it. There is deliberately no fallback to the old endpoint and no feature flag — the ingestion change ships separately and unblocks this version without a further SDK release.

## [3.2.0] - 2026-06-22

### Added

- **Gzip compression of track payloads**: Track request bodies of at least 1 KB are now compressed with the browser-native `CompressionStream` API and sent with the `Content-Encoding: gzip` header, cutting ingestion network volume by roughly 10x.
  - Smaller bodies (< 1 KB) are sent uncompressed, since gzip overhead would outweigh the gain.
  - When `CompressionStream` is unavailable (pre-2023 browsers) or compression fails, the body is sent uncompressed exactly as before — synchronously in the unavailable case — so legacy behavior is preserved and no CORS preflight is triggered for old browsers.
  - Applied to both the full build (`AvoNetworkCallsHandler`) and the lite build (`AvoNetworkCallsHandlerLite`).

## [3.1.0] - 2026-03-19

### Added

- **Lite entry point** (`avo-inspector/lite`): A production-optimized build that physically excludes dev/staging-only code. Reduces gzipped bundle size from ~37 KB to ~5.2 KB (86% smaller). Works universally with any bundler or minifier — no flags or configuration needed.
  - Import: `import { AvoInspector, AvoInspectorEnv } from "avo-inspector/lite"`
  - Same tracking API as the full version (`trackSchemaFromEvent`, `trackSchema`, `extractSchema`)
  - `publicEncryptionKey` constructor option removed from lite types (TypeScript will error if passed)
  - Excluded from lite: encryption (`@noble/curves`), event spec validation (`safe-regex2`), stream ID generation, event deduplication
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
