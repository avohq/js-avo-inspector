# AvoNetworkCallsHandler

## Short description

Builds Inspector tracking request bodies (session-started and event-schema payloads) and POSTs them to the Avo Inspector ingestion endpoint. Owns transport selection (v1 by default, v2 when a client is configured), batching guard, sampling, stream-id reconciliation, response-driven sampling-rate updates, client-side gzip compression of large request bodies, the v2 identifying request headers (`api-key`, `env`, `X-Avo-Client`), and the per-call gateway coordinates (`TrackOptions`) that decorate an event-schema body.

## Tech stack

- TypeScript, browser runtime.
- `XMLHttpRequest` for the POST.
- Browser-native `CompressionStream` + `TextEncoder` for gzip (no third-party dependency).
- Collaborators: `AvoGuid` (message ids), `AvoInspector` (logging flag, network timeout), `AvoStreamId` (stream id), `EventSpecMetadata` type.

## Data

`BaseBody` — common envelope: `apiKey, appName, appVersion: string, libVersion, env, libPlatform:"web", messageId, trackingId, createdAt, sessionId, streamId, samplingRate`, optional `eventSpecMetadata`, optional `publicEncryptionKey`.

`SessionStartedBody extends BaseBody` — `type:"sessionStarted"`. Its `appVersion` is always the configured string version; the nullable rule below does not reach it.

`EventSchemaBody extends Omit<BaseBody, "appVersion">` — `type:"event"`, `appVersion: string|null` (the **only** body where `appVersion` is nullable, and only on v2), `eventId: string|null`, optional `eventName`, `eventProperties: EventProperty[]`, `avoFunction: boolean`, `eventHash: string|null`, optional `validatedBranchId`, and the two optional gateway fields `outputReference?: string` / `originHint?: string` — top-level siblings of `eventProperties`, absent (not `null`, not `""`) when unset.

`TrackOptions` — the per-call gateway coordinates a caller passes in: optional `outputReference`, `originHint`, `appVersion`, all `string`. Declared *locally in both this file and the lite copy* rather than imported, to keep the `verify:lite-sync` diff flat. Re-exported as a public type from `src/index.ts` and `src/lite/index.ts`.

`EventProperty` / `SchemaChild` — recursive property-schema shape with optional `failedEventIds` / `passedEventIds` validation results.

`gzipMinBodyLength = 1024` — bodies shorter than this (in JS string length) are sent uncompressed.

`client: string | undefined` — instance field, set once in the constructor through `normalizeClient`. It is the **transport switch**: `undefined` means v1, a string means v2 and is the `X-Avo-Client` header value. Direct integrators pass it as the `client` constructor option; the script-tag build reads `window.inspector.__CLIENT__`, which the web GTM tag template sets to `"gtm-web"`.

`trackingEndpoint` — instance field, set once in the constructor from `client`: `https://api.avo.app/inspector/v1/track` when `client` is `undefined`, else `https://api.avo.app/inspector/v2/track`. It replaced the former static so the lite copy's reference to it is textually identical.

`apiKey` — arrives already trimmed on both transports: `AvoInspector` trims it once in its constructor, so on v2 the header and the body copy carry the same string and a key pasted with a trailing newline cannot make `setRequestHeader` throw. On v1 the body copy is the only one; the trim changes it from 3.2.0 only for such a padded key, which the v1 backend does not trim and so failed to look up. It has no known shape beyond that, so unlike `client` it is not pattern-validated; the send-path `try`/`catch` is its backstop.

`normalizeClient(client: unknown)` — runs the argument through `normalizeHint`, so a non-string, `""` or whitespace-only value returns **`undefined` (v1)**. A non-blank value selects v2: it returns the trimmed token when it matches `clientTokenPattern` (`/^[A-Za-z0-9._-]{1,64}$/`), otherwise `"web"` — still v2 — logging one `console.warn` (`"[Avo Inspector] Unusable client value. Sending X-Avo-Client: web instead."`) when `AvoInspector.shouldLog`. Unlike the hints, the v2 value becomes a *header*: an unusable one makes `setRequestHeader` throw during synchronous setup, which would latch the `sending` guard (see below). Trimming means a token carrying a trailing newline from a config file keeps its attribution instead of silently degrading to `"web"`.

`warnedAboutOmittedHints` — module-level one-shot latch for the single v1 warning below. Per module, so each build (full, lite) warns at most once per page/process; an app loading both builds can see one from each. There is no null-appVersion latch or warning: v1 can no longer be sent a null `appVersion`, and v2 accepts one.

## Functional requirements

- `callInspectorWithBatchBody(events, onCompleted)` — rejects re-entrant sends while one is in flight (calls back with an Error, does not send); filters out null events; reconciles stream ids; returns silently on empty list; may drop the batch by sampling; sets the `sending` guard, sends, and clears the guard in the completion callback.
- `callInspectorImmediately(eventBody, onCompleted)` — single-event send that bypasses batching and sampling (validated events are always sent); reconciles an `"unknown"` stream id.
- `bodyForSessionStartedCall()` / `bodyForEventSchemaCall(eventName, eventProperties, eventId, eventHash, eventSpecMetadata?, validatedBranchId?, options?)` — construct the typed bodies from instance config, then apply the gateway rules below.
- `fixStreamIds(events)` — replaces any `"unknown"` streamId with the first known stream id in the batch, else `AvoStreamId.streamId`.

### Gateway coordinates (`options: TrackOptions`)

- `normalizeHint(value)` — the single normalizer for all three option values: non-strings (numbers, booleans, `null`, `undefined`, objects, arrays) → `undefined`; strings → `trim()`, and `""` after trimming → `undefined`. No length limit and no cardinality check — the low-cardinality/never-a-user-id rule for `originHint` is documentation-only.
- Normalized `outputReference` is assigned to the body only when defined **and `client` is set (v2)**; otherwise the key is **absent**. Same for `originHint`. Neither is ever emitted as `null` or `""`, and neither is read from or written into `eventProperties` — a customer property literally named `outputReference`/`originHint`/`appVersion` is untouched and does not feed these fields. Assignment order on v2 is `outputReference` then `originHint`, after `validatedBranchId`.
- `appVersion` resolution (the only nullable-`appVersion` path) — **by transport**. The origin-scoped null applies only on v2 (`if (originHint !== undefined && isV2)`); on v1 the `originHint` is left out and does not affect the version, because v1's fast parser requires a non-null `appVersion` and silently drops the event (answering 200):

  | normalized `originHint` | normalized `appVersion` | v2 body `appVersion` | v1 body `appVersion` |
  |---|---|---|---|
  | present | present | the option value | the option value |
  | present | absent | literal `null` — the configured version is deliberately *not* applied, because an origin hint marks the event as coming from another source; v2 stores it as `"unversioned"` | the configured version |
  | absent | present | the option value | the option value |
  | absent | absent | the configured version (untouched pre-3.3.0 behavior) | the configured version |

  So a v1 body's `appVersion` is never `null`.

- Omitting `options`, or passing `{}`, yields exactly the pre-3.3.0 key set and values on either transport — only `libVersion` differs across versions.
- **v2** decodes all three: `/inspector/v2/track` runs the public parser, which reads `outputReference` and `originHint` and stores a `null` `appVersion` as `"unversioned"`. No warning.
- **v1 warning** — the only TrackOptions warning (only when `client` is `undefined`, gated on `AvoInspector.shouldLog` *before* the latch is set, so a logging-off call does not consume it; the message carries no option values): normalized `outputReference` or `originHint` present (i.e. something was left out) → once: `"[Avo Inspector] outputReference and originHint are sent only when a client is configured, so they were left out of this event."` Passing only `appVersion`, or hints that normalize away, does not warn. There is no null-appVersion warning on either transport.
- Codegen bodies (`eventId` non-null) are built with no `options`, so they never carry the hints on either transport; `avoFunction`/`eventId`/`eventHash` are set exactly as in 3.2.0 (v1 reads them; v2 ignores them).

### Send path (`callInspectorApi` → `sendTrackingRequest`)

1. `callInspectorApi` serializes events once: `body = JSON.stringify(events)`.
2. **Uncompressed fast path (synchronous):** if `CompressionStream` is `undefined` OR `body.length < gzipMinBodyLength`, call `sendTrackingRequest(body, isGzipped=false, …)` and return immediately — preserving legacy timing.
3. **Compressed path (async):** otherwise `gzip(body)` then, in the promise callback, send the compressed `Uint8Array` with `isGzipped=true` if compression succeeded, or fall back to the uncompressed string with `isGzipped=false` if `gzip` returned null.
4. `sendTrackingRequest(body, isGzipped, onCompleted)` opens an async POST to `this.trackingEndpoint` and sets headers by transport, in this order:
   - **v1** (`client` undefined): only `Content-Type: text/plain` — byte for byte the 3.2.0 request.
   - **v2**: `Content-Type: application/json`, `api-key: <apiKey>`, `env: <envName>`, `X-Avo-Client: <client>`.

   Then `Content-Encoding: gzip` **only when `isGzipped`** (both transports), applies `AvoInspector.networkTimeout`, and sends the string-or-bytes body. v2 takes the api key and env from the headers and ignores the body copies; the body keeps carrying both regardless, so one body shape serves both transports. **Everything from the `XMLHttpRequest` construction through `send` is wrapped in a `try`/`catch` that reports the failure through `onCompleted` and returns**. The guarantee is precise: **no synchronous XHR setup step throws out of `sendTrackingRequest`, on either the direct or the gzipped path.** It is not that the method never throws — `onCompleted` is the caller's callback, typed `=> any`, and a throw from it propagates. That is harmless: `callInspectorWithBatchBody` clears `sending` *before* forwarding to its caller's callback, so a throwing callback cannot latch the guard; on the gzipped path it surfaces as an unhandled rejection. The `onload`/`onerror`/`ontimeout` assignments stay outside it: they run in a later task, which no `try`/`catch` here could cover. — see the `sending` guard requirement below.
5. On `onload`: non-200 → Error callback; 200 → parse JSON response (parse failure → Error callback), adopt `response.samplingRate` when it is a valid number, then `onCompleted(null)`. `onerror` / `ontimeout` produce the corresponding Error callbacks.

`gzip(body)` — encodes the string to UTF-8 bytes, pipes through a `"gzip"` `CompressionStream`, concatenates the output chunks into one `Uint8Array`, and returns it. Returns `null` if anything throws.

- IMPORTANT: `trackingEndpoint` is `https://api.avo.app/inspector/v1/track` unless a non-blank `client` was passed to the constructor, in which case it is `https://api.avo.app/inspector/v2/track`. The choice never changes for the life of the instance.

## Non-functional requirements

- **Network-volume reduction:** large bodies are gzipped client-side (~6–10× smaller) to cut metered ingestion volume.
- **Backward-compatible fallbacks, behavior-preserving:** browsers without `CompressionStream` send uncompressed *synchronously* with no `Content-Encoding` header; runtime compression failure falls back to the uncompressed string; sub-1 KB bodies skip gzip. In every fallback the body bytes are identical to pre-change behavior.
- **Wire-shape invariant:** a gzipped body must gunzip back to the exact original `JSON.stringify(events)` string.
- **v1 compatibility invariant:** with no client, URL, header list and body bytes equal 3.2.0's (`libVersion` aside). Pinned against the 3.2.0 source in `src/__tests__/V1WireBaseline_test.ts`.
- **Preflight note:** v1 stays inside the CORS safelist (`text/plain`), so only its gzipped sends are preflighted, as in 3.2.0. On v2, `api-key`, `env` and `X-Avo-Client` are not CORS-safelisted, so *every* browser POST is preflighted. That is why v2 uses `application/json`: `text/plain` was chosen only to stay inside the CORS safelist and skip the preflight, a saving the new headers cancel out, and v2's body reader parses a `text/plain` body a second time and throws. The ingestion server must answer `OPTIONS` with `Content-Type`, `api-key`, `env` and `X-Avo-Client` in `Access-Control-Allow-Headers`, **plus `Content-Encoding`, which a gzipped send adds to the preflight** — allowing only the four would block every v2 batch large enough to compress.
- **Re-entrancy guard (`sending`) must always be cleared.** It prevents overlapping batch sends and is set before `callInspectorApi` and cleared only inside the completion callback, so any exception escaping the synchronous request setup would latch it `true` and make every later batch fail with "another batch sending is in progress" for the lifetime of the page. Both the `try`/`catch` in `sendTrackingRequest` and `normalizeClient` exist to close that path — the first generically, the second by keeping the most likely bad value from reaching a header at all. `samplingRate` is mutated from server responses.
- **Lite-sync invariant:** every `TrackOptions` / `normalizeHint` / `normalizeClient` / warning latch / `client` / `trackingEndpoint` / request-header line is byte-identical to `src/lite/AvoNetworkCallsHandlerLite.ts`, so `verify:lite-sync` drift stays at or under its baseline (49 of 55).
- **Sampling:** v1 samples server-side as before. v2 pins `samplingRate` to `1.0` server-side. The handler's client-side sampling logic is unchanged on both and still adopts whatever rate the response carries.
