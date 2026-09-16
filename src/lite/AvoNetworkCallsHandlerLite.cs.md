# AvoNetworkCallsHandlerLite

## Short description

Lite-bundle copy of `AvoNetworkCallsHandler` (class `AvoNetworkCallsHandlerLite`), kept textually in sync with the full handler. Selects the transport once at construction (v1 by default, v2 when a client is configured), builds Inspector tracking request bodies and POSTs them to the Avo Inspector ingestion endpoint, with client-side gzip compression of large bodies. Maintained under a strict gzipped-bundle size budget (≤ 7 KB; currently ~6.0 KB).

## Tech stack

- TypeScript, browser runtime.
- `XMLHttpRequest` for the POST.
- Browser-native `CompressionStream` + `TextEncoder` for gzip (no third-party dependency).
- Collaborators mirror the full handler (`AvoGuid`, `AvoInspector`, `AvoStreamId`, `EventSpecMetadata`).

## Data

Same body/type shapes as the full handler: `BaseBody` (no `publicEncryptionKey` here), `SessionStartedBody`, `EventSchemaBody extends Omit<BaseBody, "appVersion">` with `appVersion: string|null` (null only on v2) plus optional `outputReference` / `originHint`, `TrackOptions`, `EventProperty` / `SchemaChild`. `TrackOptions` is declared locally here as well as in the full handler (not imported) so the sync diff stays flat, and is re-exported from `src/lite/index.ts`. `gzipMinBodyLength = 1024` — sub-1 KB bodies are sent uncompressed. `apiKey` — arrives already trimmed from `AvoInspectorLite`'s constructor, so header and body carry the same string. No known shape, so no pattern validation; the send-path `try`/`catch` is its backstop. `client: string | undefined` — the transport switch, set from the constructor argument through `normalizeClient`: a non-string, `""` or whitespace-only value → `undefined` (**v1**); a non-blank value → **v2**, as the trimmed token when it matches `clientTokenPattern` (`/^[A-Za-z0-9._-]{1,64}$/`) or `"web"` otherwise (with one `console.warn` when logging). On v2 this value becomes a header, so an unusable one would make `setRequestHeader` throw and latch the `sending` guard. `trackingEndpoint` — instance field set alongside it: `https://api.avo.app/inspector/v1/track` for v1, `https://api.avo.app/inspector/v2/track` for v2. `warnedAboutOmittedHints` — module-level one-shot latch for the single v1 warning, independent of the full build's. No null-appVersion latch or warning exists.

## Functional requirements

Mirrors `AvoNetworkCallsHandler`. Public surface: `callInspectorWithBatchBody`, `callInspectorImmediately`, `bodyForSessionStartedCall`, `bodyForEventSchemaCall`, with the same re-entrancy guard, null filtering, stream-id reconciliation, empty-list short-circuit, and sampling drop.

### Gateway coordinates (`options: TrackOptions`)

Identical to the full handler, byte for byte:

- `normalizeHint` trims strings and maps `""`, whitespace-only strings and every non-string to `undefined`.
- `outputReference` / `originHint` are set on the body only when defined **and on v2** — otherwise the key is absent, never `null` or `""` — and are top-level siblings of `eventProperties`, never sourced from or written into event data.
- `appVersion`, by transport. v2: `originHint` present → the option value, or literal `null` when no usable `appVersion` was given (the configured version is deliberately not applied); `originHint` absent → the option value when given, else the configured version. v1: the option value when given, else the configured version, whether or not `originHint` was passed — v1 silently drops a null `appVersion`, so a v1 body never carries one.
- No `options` (or `{}`) → exactly the pre-3.3.0 key set and values on either transport, only `libVersion` differs.
- v2 reads `outputReference` and `originHint` and stores a `null` `appVersion` as `"unversioned"`; no warning.
- v1 only, once per build and only when `AvoInspectorLite.shouldLog` (checked before the latch): a defined `outputReference` or `originHint` warns that the hints need a client and were left out. The message carries no option values. There is no null-appVersion warning on either transport.
- Codegen bodies never carry the hints; `avoFunction`/`eventId`/`eventHash` are as in 3.2.0.

### Send path (`callInspectorApi` → `sendTrackingRequest`)

1. Serialize once: `body = JSON.stringify(events)`.
2. **Uncompressed fast path (synchronous):** if `CompressionStream` is `undefined` OR `body.length < gzipMinBodyLength`, send `body` with `isGzipped=false` and return immediately.
3. **Compressed path (async):** otherwise `gzip(body)`; on success send the `Uint8Array` with `isGzipped=true`, on null fall back to the uncompressed string with `isGzipped=false`.
4. `sendTrackingRequest` POSTs to `this.trackingEndpoint`. v1 sets only `Content-Type: text/plain` (3.2.0's request, byte for byte); v2 sets `Content-Type: application/json`, `api-key`, `env` and `X-Avo-Client`. Both add `Content-Encoding: gzip` only when gzipped and apply `AvoInspector.networkTimeout`. `apiKey`/`env` stay in the body on both, where v2 ignores them. Everything from the `XMLHttpRequest` construction through `send` is wrapped in a `try`/`catch` reporting through `onCompleted`, so no synchronous XHR setup step throws out of it on either the direct or the gzipped path and a rejected header cannot latch the `sending` guard. A throw from `onCompleted` itself still propagates, which is harmless because `callInspectorWithBatchBody` clears the guard before forwarding to its caller.
5. `onload`: non-200 → Error; 200 → parse response (parse failure → Error), adopt valid numeric `response.samplingRate`, then `onCompleted(null)`. `onerror` / `ontimeout` → corresponding Errors.

`gzip(body)` — UTF-8 encode → `"gzip"` `CompressionStream` → concatenated `Uint8Array`; returns `null` on any throw.

## Non-functional requirements

- **Textual-sync invariant:** the gzip helper, threshold, transport selection, send path (headers and the setup `try`/`catch` included), `TrackOptions`, `normalizeHint`, `normalizeClient` and the warning latch are byte-for-byte the same logic as `AvoNetworkCallsHandler`; `verify:lite-sync` enforces the allowed drift baseline (49 of 55) and `check:lite-size` enforces the bundle budget.
- **v1 compatibility invariant:** with no client, URL, header list and body bytes equal 3.2.0's lite request (`libVersion` aside), pinned in `src/__tests__/V1WireBaseline_test.ts`.
- **Backward-compatible fallbacks:** no `CompressionStream` → synchronous uncompressed send, no `Content-Encoding`; runtime failure → uncompressed fallback; sub-1 KB → uncompressed.
- **Wire-shape invariant:** a gzipped body must gunzip back to the exact original `JSON.stringify(events)` string.
- **Preflight note:** v1 (`text/plain`) is preflighted only for gzipped batches, as in 3.2.0. On v2, `api-key`, `env` and `X-Avo-Client` are not CORS-safelisted, so every browser POST is preflighted. `text/plain` bought its way out of the preflight and no longer can there, and v2 throws on a `text/plain` body, so v2's content type is `application/json`. The server's `Access-Control-Allow-Headers` needs `Content-Type`, `api-key`, `env` and `X-Avo-Client`, plus `Content-Encoding` for gzipped batches.
