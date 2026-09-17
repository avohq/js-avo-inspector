# AvoNetworkCallsHandler

## Short description

Builds Inspector tracking request bodies (session-started and event-schema payloads) and POSTs them to the Avo Inspector ingestion endpoint. Owns transport selection (v1 for every caller; v2 only for the web GTM tag template's client `"gtm-web"`), the batching guard, sampling, stream-id reconciliation, response-driven sampling-rate updates, client-side gzip compression of large bodies, the v2 identifying request headers (`api-key`, `env`, `X-Avo-Client`), and the per-call gateway coordinates (`TrackOptions`) that decorate a v2 event-schema body.

**Internal, not public API:** `client`, `TrackOptions` and the v2 transport exist only for the web GTM tag template. Neither entry point (`src/index.ts`, `src/lite/index.ts`) exports `TrackOptions`, the public constructors have no `client` option, and the public track methods take two arguments. The script-tag bootstrap (`src/browser.js`) is the only production caller: it passes `window.inspector.__CLIENT__` as the untyped `_client` constructor option and routes a third `trackSchemaFromEvent`/`trackSchema` argument to the inspector's private `_trackSchemaFromEventWithOptions`/`_trackSchemaWithOptions`.

## Tech stack

- TypeScript, browser runtime.
- `XMLHttpRequest` for the POST.
- Browser-native `CompressionStream` + `TextEncoder` for gzip (no third-party dependency).
- Collaborators: `AvoGuid` (message ids), `AvoInspector` (logging flag, network timeout), `AvoStreamId` (stream id), `EventSpecMetadata` type.

## Data

`BaseBody` — common envelope: `apiKey, appName, appVersion: string, libVersion, env, libPlatform:"web", messageId, trackingId, createdAt, sessionId, streamId, samplingRate`, optional `eventSpecMetadata`, optional `publicEncryptionKey`.

`SessionStartedBody extends BaseBody` — `type:"sessionStarted"`; `appVersion` is always the configured string.

`EventSchemaBody extends Omit<BaseBody, "appVersion">` — `type:"event"`, `appVersion: string|null` (the **only** nullable `appVersion`, and only on v2), `eventId: string|null`, optional `eventName`, `eventProperties: EventProperty[]`, `avoFunction: boolean`, `eventHash: string|null`, optional `validatedBranchId`, and the optional v2-only gateway fields `outputReference?: string` / `originHint?: string` — top-level siblings of `eventProperties`, absent (never `null` or `""`) when unset.

```ts
export interface TrackOptions { outputReference?: string; originHint?: string; appVersion?: string }
```

Exported from this module for the inspector and batcher, **not** re-exported from either entry point; declared locally here and in the lite copy (not imported).

`EventProperty` / `SchemaChild` — recursive property-schema shape with optional `failedEventIds` / `passedEventIds` validation results.

`gzipMinBodyLength = 1024` — bodies shorter than this (JS string length) are sent uncompressed.

`webGtmTemplateClient = "gtm-web"` — the only client that selects v2 and the only `X-Avo-Client` value ever sent.

`normalizeHint(value: unknown): string | undefined` — non-strings → `undefined`; strings → `trim()`, `""` → `undefined`. No length or cardinality check.

`normalizeClient(client: unknown): string | undefined` — `"gtm-web"` iff `normalizeHint(client) === "gtm-web"`, else `undefined`. Absent, blank, non-string, `"web"`, `"gtm-server"`, `"GTM-WEB"` all → `undefined`. Never logs; only the constant can become a header.

`isHeaderValue(value: unknown): value is string` — a string with no NUL, CR or LF and no code point above U+00FF, i.e. a value browsers accept in `setRequestHeader` as-is.

`maxConsecutivePermanentFailures = 3`; instance fields `permanentFailures` (own-event permanent failures in a row) and `sendingDisabled` (set at most once) — v2 only.

`client: string | undefined` (instance, set once in the constructor via `normalizeClient`) — the **transport switch**: `undefined` → v1, `"gtm-web"` → v2.

`trackingEndpoint` (instance, set once) — `https://api.avo.app/inspector/v1/track` when `client` is `undefined`, else `https://api.avo.app/inspector/v2/track`.

`apiKey` — arrives already trimmed by `AvoInspector`, so on v2 header and body copy are the same string. Not otherwise validated; the send-path `try`/`catch` is the backstop for values the platform rejects as a header (embedded NUL/CR/LF, code points above U+00FF).

## Functional requirements

- `constructor(apiKey, envName, appName, appVersion, libVersion, publicEncryptionKey?, client?)` — on v2, if `apiKey` or `envName` is not an `isHeaderValue`, stops sending immediately.
- `isSendingDisabled(): boolean` — `true` once v2 has stopped sending for this page; always `false` on v1. The batcher stops queueing when it is `true`.
- `disableSending(reason)` (private) — sets `sendingDisabled` and logs once: `console.error("[Avo Inspector] Stopped sending events on this page: <reason>.")`. Reasons: `the api key cannot be sent as a request header` (constructor) and `the Avo Inspector API refused its events 3 times in a row` (runtime). The key value is never logged.
- `callInspectorWithBatchBody(events, onCompleted: (error, retryEvents?) => any)` — rejects re-entrant sends while one is in flight (Error callback, no send); filters null events; reconciles stream ids; returns silently on an empty list; may drop the batch by sampling; sets `sending`, sends, and clears `sending` before forwarding to `onCompleted` — with `retryEvents` only when the send supplied them (v2), otherwise with the error alone.
- `callInspectorImmediately(eventBody, onCompleted)` — single-event send bypassing batching and sampling; reconciles an `"unknown"` stream id.
- `bodyForSessionStartedCall()` / `bodyForEventSchemaCall(eventName, eventProperties, eventId, eventHash, eventSpecMetadata?, validatedBranchId?, options?)` — construct the typed bodies from instance config; the event body then applies the gateway rules below.
- `fixStreamIds(events)` — replaces `"unknown"` stream ids with the first known id in the batch, else `AvoStreamId.streamId`.

### Gateway coordinates (`options`, internal)

- **v1 (`client` undefined): `options` is ignored entirely** — no hint fields, no `appVersion` override. The body equals the one built without `options`.
- **v2:** normalized `outputReference` and `originHint` are assigned only when defined (after `validatedBranchId`, in that order); never read from or written into `eventProperties`.
- v2 `appVersion` resolution:

  | normalized `originHint` | normalized `appVersion` | body `appVersion` |
  |---|---|---|
  | present | present | the option |
  | present | absent | literal `null` (stored by v2 as `"unversioned"`) |
  | absent | present | the option |
  | absent | absent | configured version |

- No `options` or `{}` → the pre-existing key set and values on either transport.
- Codegen bodies (`eventId` non-null) are built without `options`; `avoFunction`/`eventId`/`eventHash` are set as before on both transports.

### Send path (`callInspectorApi` → `sendEvents` → `sendTrackingRequest`)

0. **v1:** `sendEvents(events, this.apiKey, this.envName, …)` and forward the error alone — one request, as before.
   **v2 — one request per queued api key and env:** events are grouped by their own `apiKey`/`env` body fields, in order of first appearance, and the groups are sent **sequentially** (the next request opens when the previous completes). Each group's headers come from its bodies, so events persisted by an earlier page with another configuration (a published container's prod queue flushed by a GTM Preview load, or the reverse) are attributed as queued. A group is *own* when its api key and env equal this instance's. Per group:
   - `sendingDisabled` → not sent; kept for retry.
   - api key or env not an `isHeaderValue` → not sent; permanent failure.
   - otherwise sent via `sendEvents`.
   - success → own groups reset `permanentFailures`.
   - transient failure → kept for retry.
   - permanent failure → own groups are kept for retry and increment `permanentFailures`, stopping sending when it reaches `maxConsecutivePermanentFailures`; another configuration's groups are **dropped** (their key and env cannot change on retry).
   
   After the last group: `onCompleted(null)` when every group succeeded, else `onCompleted(firstError, retryEvents)`.
1. `sendEvents` serializes the group: `body = JSON.stringify(events)`.
2. **Uncompressed fast path (synchronous):** `CompressionStream` undefined OR `body.length < gzipMinBodyLength` → `sendTrackingRequest(body, false, …)`.
3. **Compressed path (async):** `gzip(body)`; success → send the `Uint8Array` with `isGzipped=true`; `null` → send the string uncompressed.
4. `sendTrackingRequest(body, isGzipped, apiKey, env, onCompleted: (error, permanent?) => any)` — async POST to `this.trackingEndpoint`, headers in order:
   - **v1:** `Content-Type: text/plain` only.
   - **v2:** `Content-Type: application/json`, `api-key: <group apiKey>`, `env: <group env>`, `X-Avo-Client: gtm-web`.
   - Both: `Content-Encoding: gzip` only when `isGzipped`; `timeout = AvoInspector.networkTimeout`.
   
   IMPORTANT: construction, `open`, every `setRequestHeader`, `timeout` and `send` run inside one `try`/`catch`; a throw calls `onCompleted(new Error("Failed to send request: …"), true)` (permanent) and returns. No synchronous XHR setup step escapes the method on either path. A throw from `onCompleted` itself still propagates (on the gzipped path as an unhandled rejection); `sending` is already cleared by then. `onload`/`onerror`/`ontimeout` are assigned after the `try`.
5. `onload`: non-200 → Error, **permanent** for a 4xx other than 408 and 429; 200 → parse JSON (failure → Error), adopt a numeric non-NaN `response.samplingRate`, `onCompleted(null)`. `onerror` / `ontimeout` → corresponding transient Errors.

`gzip(body)` — UTF-8 encode → `"gzip"` `CompressionStream` → one concatenated `Uint8Array`; `null` on any throw.

## Non-functional requirements

- **v1 compatibility invariant:** without the `"gtm-web"` client, URL, header list and body bytes are the pre-v2 request (`libVersion` aside), whatever `options` were passed; pinned in `src/__tests__/V1WireBaseline_test.ts`. Emitted typings for both entry points are unchanged; pinned in `src/__tests__/PublicSurface_test.ts`.
- **Re-entrancy guard must always clear:** `sending` is cleared only in the completion callback, so any exception escaping synchronous request setup would latch it and cancel every later batch for the page's lifetime. The setup `try`/`catch` closes that path; a failed send re-queues via the batcher's error branch.
- **CORS:** v1 `text/plain` stays CORS-safelisted, so only gzipped v1 sends are preflighted. On v2, `api-key`, `env`, `X-Avo-Client` are not safelisted, so every v2 POST is preflighted; the server must allow `Content-Type`, `api-key`, `env`, `X-Avo-Client` and `Content-Encoding`.
- **Body shape:** `apiKey` and `env` stay in every body; v2 reads the headers, which are built from the bodies' own values.
- **Stopping (v2 only):** a stopped handler opens no request for the rest of the page and hands every event back for retry, so events already queued stay stored for a later page load. v1 never stops: it retries every failure, as before. A partial v2 failure hands back only the retryable groups, so successful groups are not sent twice.
- **Wire-shape invariant:** a gzipped body gunzips to the exact `JSON.stringify(events)` string. Fallbacks (no `CompressionStream`, compression failure, sub-1 KB) send the identical uncompressed body.
- **Lite-sync invariant:** the transport, gateway and send-path code is textually identical to `src/lite/AvoNetworkCallsHandlerLite.ts`; `verify:lite-sync` drift is 49 of a 55-line threshold.
- **Logging:** nothing added here logs, on either transport. `samplingRate` is mutated from server responses on both transports.
