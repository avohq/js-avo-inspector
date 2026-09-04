# AvoNetworkCallsHandlerLite

## Short description

Lite-bundle copy of `AvoNetworkCallsHandler` (class `AvoNetworkCallsHandlerLite`), kept textually in sync with the full handler. Builds Inspector tracking request bodies and POSTs them to the Avo Inspector ingestion endpoint, with client-side gzip compression of large bodies. Maintained under a strict gzipped-bundle size budget (≤ 7 KB; currently ~5.7 KB).

## Tech stack

- TypeScript, browser runtime.
- `XMLHttpRequest` for the POST.
- Browser-native `CompressionStream` + `TextEncoder` for gzip (no third-party dependency).
- Collaborators mirror the full handler (`AvoGuid`, `AvoInspector`, `AvoStreamId`, `EventSpecMetadata`).

## Data

Same body/type shapes as the full handler: `BaseBody` (no `publicEncryptionKey` here), `SessionStartedBody`, `EventSchemaBody extends Omit<BaseBody, "appVersion">` with `appVersion: string|null` plus optional `outputReference` / `originHint`, `TrackOptions`, `EventProperty` / `SchemaChild`. `TrackOptions` is declared locally here as well as in the full handler (not imported) so the sync diff stays flat, and is re-exported from `src/lite/index.ts`. `gzipMinBodyLength = 1024` — sub-1 KB bodies are sent uncompressed. `client` — instance field holding the `X-Avo-Client` header value, set from the constructor argument through `normalizeClient`, which trims it and returns `"web"` for a non-string, an empty result, or anything failing `clientTokenPattern` (`/^[A-Za-z0-9._-]{1,64}$/`). This value becomes a header, so an unusable one would make `setRequestHeader` throw and latch the `sending` guard.

## Functional requirements

Mirrors `AvoNetworkCallsHandler`. Public surface: `callInspectorWithBatchBody`, `callInspectorImmediately`, `bodyForSessionStartedCall`, `bodyForEventSchemaCall`, with the same re-entrancy guard, null filtering, stream-id reconciliation, empty-list short-circuit, and sampling drop.

### Gateway coordinates (`options: TrackOptions`)

Identical to the full handler, byte for byte:

- `normalizeHint` trims strings and maps `""`, whitespace-only strings and every non-string to `undefined`.
- `outputReference` / `originHint` are set on the body only when defined — otherwise the key is absent, never `null` or `""` — and are top-level siblings of `eventProperties`, never sourced from or written into event data.
- `appVersion`: `originHint` present → the option value, or literal `null` when no usable `appVersion` was given (the configured version is deliberately not applied); `originHint` absent → the option value when given, else the configured version.
- No `options` (or `{}`) → exactly the pre-3.3.0 key set and values, only `libVersion` differs.
- The endpoint decodes all three: `/inspector/v2/track` reads `outputReference` and `originHint` and stores a `null` `appVersion` as `"unversioned"`. No pairing rule and no warning.

### Send path (`callInspectorApi` → `sendTrackingRequest`)

1. Serialize once: `body = JSON.stringify(events)`.
2. **Uncompressed fast path (synchronous):** if `CompressionStream` is `undefined` OR `body.length < gzipMinBodyLength`, send `body` with `isGzipped=false` and return immediately.
3. **Compressed path (async):** otherwise `gzip(body)`; on success send the `Uint8Array` with `isGzipped=true`, on null fall back to the uncompressed string with `isGzipped=false`.
4. `sendTrackingRequest` sets `Content-Type: application/json`, `api-key`, `env` and `X-Avo-Client`, adds `Content-Encoding: gzip` only when gzipped, applies `AvoInspector.networkTimeout`, POSTs to `trackingEndpoint` (`https://api.avo.app/inspector/v2/track`). `apiKey`/`env` stay in the body too, where v2 ignores them. Everything from the `XMLHttpRequest` construction through `send` is wrapped in a `try`/`catch` reporting through `onCompleted`, so a rejected header cannot latch the `sending` guard and the async gzip path has no uncaught route out.
5. `onload`: non-200 → Error; 200 → parse response (parse failure → Error), adopt valid numeric `response.samplingRate`, then `onCompleted(null)`. `onerror` / `ontimeout` → corresponding Errors.

`gzip(body)` — UTF-8 encode → `"gzip"` `CompressionStream` → concatenated `Uint8Array`; returns `null` on any throw.

## Non-functional requirements

- **Textual-sync invariant:** the gzip helper, threshold, send path (headers and the setup `try`/`catch` included), `TrackOptions`, `normalizeHint` and `normalizeClient` are byte-for-byte the same logic as `AvoNetworkCallsHandler`; `verify:lite-sync` enforces the allowed drift baseline and `check:lite-size` enforces the bundle budget.
- **Backward-compatible fallbacks:** no `CompressionStream` → synchronous uncompressed send, no `Content-Encoding`; runtime failure → uncompressed fallback; sub-1 KB → uncompressed.
- **Wire-shape invariant:** a gzipped body must gunzip back to the exact original `JSON.stringify(events)` string.
- **Preflight note:** `api-key`, `env` and `X-Avo-Client` are not CORS-safelisted, so every browser POST is preflighted now, not only the gzipped ones. `text/plain` bought its way out of the preflight and no longer can, and v2 throws on a `text/plain` body, so the content type is `application/json`. The server's `Access-Control-Allow-Headers` needs `Content-Type`, `api-key`, `env` and `X-Avo-Client`, plus `Content-Encoding` for gzipped batches, which adds a fifth non-safelisted header to their preflight. Browser senders stay blocked until it allows them on `OPTIONS`.
