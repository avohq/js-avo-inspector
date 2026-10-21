# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **A validated send that times out no longer comes back as a second, unvalidated event** (AVO-3946). In dev and staging, an event with an event spec is sent on its own with validation. When that request failed or timed out, the SDK queued a new copy of the event, with a new `messageId`, a later `createdAt` and no `validatedBranchId`, which the debugger showed as a second "Validation didn't run" row. It now retries the same body, so the `messageId`, `createdAt`, `validatedBranchId` and spec metadata are unchanged.
- **A validated send waits at least 10 seconds for the response** (was the 2-second `networkTimeout`), or `networkTimeout` if that is longer. A slow request that did reach the server and answers within that timeout is no longer sent a second time. Batched sends and the event-spec fetch keep `networkTimeout`. Production sends are always batched, so they are unchanged.
- **Events queued while a batch is in flight are checked again when it succeeds** (AVO-3946). An event tracked while a batch was being sent stayed queued, with nothing scheduled to send it, until the next tracked event or page load. The queue is now checked again when a batch succeeds, and sent if it meets the usual batch-size or flush-time rule. With batch size 1, four rapid events now send four events on the same page. After a failed batch, the queue still waits for the next tracked event, as before.

The queue fix also applies to `avo-inspector/lite`.

## [3.2.2] - 2026-10-20

### Added

- **Internal: the web GTM tag template's event-spec fetch is scoped to the event's gateway checkpoint** (AVO-4073, not public API). With the `"gtm-web"` client, an event tracked with gateway options fetches `GET https://api.avo.app/trackingPlan/eventSpec` with its normalized `originHint` and/or `outputReference` appended as query params (each only when non-blank), so dev/staging value validation runs against the spec of the gateway input or output it is observed at. Both coordinates are part of the spec cache key and the in-flight request key, so specs for different checkpoints of one event never share an entry. The in-flight request key also includes the API key, matching the cache key. A 404 (e.g. a gateway key and no `originHint`) is cached as "no spec" and the event is sent unvalidated, as before.

  Every other install — npm full and lite, a regular script tag, Avo Codegen events, and gateway options without the client — fetches exactly the same URL and uses exactly the same cache key as 3.2.1.

## [3.2.1] - 2026-09-16

The public API is unchanged from 3.2.0: the same exports, constructor options and track-method signatures in both `avo-inspector` and `avo-inspector/lite`. Every npm (full and lite) and regular script-tag install sends exactly 3.2.0's request — `POST https://api.avo.app/inspector/v1/track`, a single `Content-Type: text/plain` header (plus `Content-Encoding: gzip` for a compressed batch), and the same body apart from `libVersion`.

### Added

- **Internal support for the Avo web GTM tag template** (not public API). In the script-tag build, when `window.inspector.__CLIENT__` is `"gtm-web"` (after trimming; any other value is ignored), the SDK:
  - sends to `POST https://api.avo.app/inspector/v2/track` with `Content-Type: application/json` and the `api-key`, `env` and `X-Avo-Client: gtm-web` headers (the api key and env stay in the body too);
  - accepts per-event gateway fields — `outputReference`, `originHint`, `appVersion` — as a third argument to `window.inspector.trackSchemaFromEvent` / `trackSchema`, including calls queued on the loader stub before the bundle loads. With `originHint` set and no `appVersion`, the event's `appVersion` is sent as `null`, which v2 records as `"unversioned"`. Avo Codegen events never carry these fields.

  - sends each queued event under the api key and env it was queued with — one request per pair — so events persisted by a GTM Preview page and flushed by a published one (or the reverse) keep their env;
  - stops sending for the page, with one `console.error`, after the API refuses the page's own events three times in a row (a 4xx other than 408/429, or a request the browser refuses to build). Events stay queued and saved, so a later page load can still deliver them. Network errors, timeouts and 5xx keep retrying and never stop sending. Events queued under another api key and env are dropped after three permanent failures of that group, since nothing can change the key they carry;
  - sends and queues nothing at all when the api key cannot be a request header, since every event would carry it.

  Without that client, a third argument is ignored entirely, `appVersion` included, and nothing above applies: v1 sends and retries exactly as 3.2.0.

### Fixed

- **The API key is trimmed once at construction.** A key pasted with surrounding whitespace or a trailing newline previously failed the v1 key lookup, which does not trim; it now works.
- **Request setup can no longer wedge the batcher**: everything from creating the `XMLHttpRequest` through `send()` reports failures through the completion callback, so a refused `send()` or header fails one batch instead of cancelling every later one for the rest of the page.

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
