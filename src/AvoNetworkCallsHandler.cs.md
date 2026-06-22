# AvoNetworkCallsHandler

## Short description

Builds Inspector tracking request bodies (session-started and event-schema payloads) and POSTs them to the Avo Inspector ingestion endpoint. Owns batching guard, sampling, stream-id reconciliation, response-driven sampling-rate updates, and — as of this change — client-side gzip compression of large request bodies.

## Tech stack

- TypeScript, browser runtime.
- `XMLHttpRequest` for the POST.
- Browser-native `CompressionStream` + `TextEncoder` for gzip (no third-party dependency).
- Collaborators: `AvoGuid` (message ids), `AvoInspector` (logging flag, network timeout), `AvoStreamId` (stream id), `EventSpecMetadata` type.

## Data

`BaseBody` — common envelope: `apiKey, appName, appVersion, libVersion, env, libPlatform:"web", messageId, trackingId, createdAt, sessionId, streamId, samplingRate`, optional `eventSpecMetadata`, optional `publicEncryptionKey`.

`SessionStartedBody extends BaseBody` — `type:"sessionStarted"`.

`EventSchemaBody extends BaseBody` — `type:"event"`, `eventId: string|null`, optional `eventName`, `eventProperties: EventProperty[]`, `avoFunction: boolean`, `eventHash: string|null`, optional `validatedBranchId`.

`EventProperty` / `SchemaChild` — recursive property-schema shape with optional `failedEventIds` / `passedEventIds` validation results.

`gzipMinBodyLength = 1024` — bodies shorter than this (in JS string length) are sent uncompressed.

## Functional requirements

- `callInspectorWithBatchBody(events, onCompleted)` — rejects re-entrant sends while one is in flight (calls back with an Error, does not send); filters out null events; reconciles stream ids; returns silently on empty list; may drop the batch by sampling; sets the `sending` guard, sends, and clears the guard in the completion callback.
- `callInspectorImmediately(eventBody, onCompleted)` — single-event send that bypasses batching and sampling (validated events are always sent); reconciles an `"unknown"` stream id.
- `bodyForSessionStartedCall()` / `bodyForEventSchemaCall(...)` — construct the typed bodies from instance config.
- `fixStreamIds(events)` — replaces any `"unknown"` streamId with the first known stream id in the batch, else `AvoStreamId.streamId`.

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
