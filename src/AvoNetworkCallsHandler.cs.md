# AvoNetworkCallsHandler

## Short description

Builds Inspector tracking request bodies (session-started and event-schema payloads) and POSTs them to the Avo Inspector ingestion endpoint. Owns batching guard, sampling, stream-id reconciliation, response-driven sampling-rate updates, client-side gzip compression of large request bodies, and — as of this change — the per-call gateway coordinates (`TrackOptions`) that decorate an event-schema body.

## Tech stack

- TypeScript, browser runtime.
- `XMLHttpRequest` for the POST.
- Browser-native `CompressionStream` + `TextEncoder` for gzip (no third-party dependency).
- Collaborators: `AvoGuid` (message ids), `AvoInspector` (logging flag, network timeout), `AvoStreamId` (stream id), `EventSpecMetadata` type.

## Data

`BaseBody` — common envelope: `apiKey, appName, appVersion: string, libVersion, env, libPlatform:"web", messageId, trackingId, createdAt, sessionId, streamId, samplingRate`, optional `eventSpecMetadata`, optional `publicEncryptionKey`.

`SessionStartedBody extends BaseBody` — `type:"sessionStarted"`. Its `appVersion` is always the configured string version; the nullable rule below does not reach it.

`EventSchemaBody extends Omit<BaseBody, "appVersion">` — `type:"event"`, `appVersion: string|null` (the **only** body where `appVersion` is nullable), `eventId: string|null`, optional `eventName`, `eventProperties: EventProperty[]`, `avoFunction: boolean`, `eventHash: string|null`, optional `validatedBranchId`, and the two optional gateway fields `outputReference?: string` / `originHint?: string` — top-level siblings of `eventProperties`, absent (not `null`, not `""`) when unset.

`TrackOptions` — the per-call gateway coordinates a caller passes in: optional `outputReference`, `originHint`, `appVersion`, all `string`. Declared *locally in both this file and the lite copy* rather than imported, to keep the `verify:lite-sync` diff flat. Re-exported as a public type from `src/index.ts` and `src/lite/index.ts`.

`EventProperty` / `SchemaChild` — recursive property-schema shape with optional `failedEventIds` / `passedEventIds` validation results.

`gzipMinBodyLength = 1024` — bodies shorter than this (in JS string length) are sent uncompressed.

`warnedAboutNullAppVersion` — module-level boolean latch, so a page/process emits at most one null-`appVersion` warning *from this module* (see below). The lite handler carries its own copy of the latch, so the guarantee is one warning per build, not one per page.

## Functional requirements

- `callInspectorWithBatchBody(events, onCompleted)` — rejects re-entrant sends while one is in flight (calls back with an Error, does not send); filters out null events; reconciles stream ids; returns silently on empty list; may drop the batch by sampling; sets the `sending` guard, sends, and clears the guard in the completion callback.
- `callInspectorImmediately(eventBody, onCompleted)` — single-event send that bypasses batching and sampling (validated events are always sent); reconciles an `"unknown"` stream id.
- `bodyForSessionStartedCall()` / `bodyForEventSchemaCall(eventName, eventProperties, eventId, eventHash, eventSpecMetadata?, validatedBranchId?, options?)` — construct the typed bodies from instance config, then apply the gateway rules below.
- `fixStreamIds(events)` — replaces any `"unknown"` streamId with the first known stream id in the batch, else `AvoStreamId.streamId`.

### Gateway coordinates (`options: TrackOptions`)

- `normalizeHint(value)` — the single normalizer for all three option values: non-strings (numbers, booleans, `null`, `undefined`, objects, arrays) → `undefined`; strings → `trim()`, and `""` after trimming → `undefined`. No length limit and no cardinality check — the low-cardinality/never-a-user-id rule for `originHint` is documentation-only.
- Normalized `outputReference` is assigned to the body only when defined; otherwise the key is **absent**. Same for `originHint`. Neither is ever emitted as `null` or `""`, and neither is read from or written into `eventProperties` — a customer property literally named `outputReference`/`originHint`/`appVersion` is untouched and does not feed these fields.
- `appVersion` resolution (the only nullable-`appVersion` path):

  | normalized `originHint` | normalized `appVersion` | body `appVersion` |
  |---|---|---|
  | present | present | the option value |
  | present | absent | literal `null` — the configured version is deliberately *not* applied, because an origin hint marks the event as coming from another source |
  | absent | present | the option value |
  | absent | absent | the configured version (untouched pre-3.3.0 behavior) |

- Omitting `options`, or passing `{}`, yields exactly the pre-3.3.0 key set and values — only `libVersion` differs across versions.
- IMPORTANT (backend gap, as of 3.3.0): `/inspector/v1/track`'s fast parser discards `outputReference`/`originHint` and **drops events whose `appVersion` is `null`**, while still answering `200`. The handler therefore emits **one** `console.warn` per page/process — fixed text, no option values — the first time it resolves `appVersion` to `null`, gated on `AvoInspector.shouldLog`. "Per page/process" is scoped to this module: the lite handler latches separately, so an app loading both builds can see one warning from each. `shouldLog` is checked *before* the latch is set, so a call made with logging off does not consume the single warning owed to a later logging-on call. The wire shape is final; the warning and this note are the only things to remove once the parser is fixed.

### Send path (`callInspectorApi` → `sendTrackingRequest`)

1. `callInspectorApi` serializes events once: `body = JSON.stringify(events)`.
2. **Uncompressed fast path (synchronous):** if `CompressionStream` is `undefined` OR `body.length < gzipMinBodyLength`, call `sendTrackingRequest(body, isGzipped=false, …)` and return immediately — preserving legacy timing.
3. **Compressed path (async):** otherwise `gzip(body)` then, in the promise callback, send the compressed `Uint8Array` with `isGzipped=true` if compression succeeded, or fall back to the uncompressed string with `isGzipped=false` if `gzip` returned null.
4. `sendTrackingRequest(body, isGzipped, onCompleted)` opens an async POST to `trackingEndpoint`, sets `Content-Type: text/plain`, adds `Content-Encoding: gzip` **only when `isGzipped`**, applies `AvoInspector.networkTimeout`, and sends the string-or-bytes body.
5. On `onload`: non-200 → Error callback; 200 → parse JSON response (parse failure → Error callback), adopt `response.samplingRate` when it is a valid number, then `onCompleted(null)`. `onerror` / `ontimeout` produce the corresponding Error callbacks.

`gzip(body)` — encodes the string to UTF-8 bytes, pipes through a `"gzip"` `CompressionStream`, concatenates the output chunks into one `Uint8Array`, and returns it. Returns `null` if anything throws.

- IMPORTANT: `trackingEndpoint` is `https://api.avo.app/inspector/v1/track`.

## Non-functional requirements

- **Network-volume reduction:** large bodies are gzipped client-side (~6–10× smaller) to cut metered ingestion volume.
- **Backward-compatible fallbacks, behavior-preserving:** browsers without `CompressionStream` send uncompressed *synchronously* with no `Content-Encoding` header (so they never trigger a CORS preflight); runtime compression failure falls back to the uncompressed string; sub-1 KB bodies skip gzip. In every fallback the wire shape is byte-identical to pre-change behavior.
- **Wire-shape invariant:** a gzipped body must gunzip back to the exact original `JSON.stringify(events)` string.
- **Preflight note:** sending `Content-Encoding: gzip` is not CORS-safelisted, so compressed POSTs are preflighted; the ingestion server must answer `OPTIONS` and decompress the body.
- Re-entrancy guard (`sending`) prevents overlapping batch sends; `samplingRate` is mutated from server responses.
- **Lite-sync invariant:** every `TrackOptions` / `normalizeHint` / warning-latch line is byte-identical to `src/lite/AvoNetworkCallsHandlerLite.ts`, so `verify:lite-sync` drift stays at its baseline.
- **Log hygiene:** the one-shot warning never interpolates option values (an `originHint` is low-cardinality by contract but is still customer data).
