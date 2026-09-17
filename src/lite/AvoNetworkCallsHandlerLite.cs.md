# AvoNetworkCallsHandlerLite

## Short description

Lite-bundle copy of `AvoNetworkCallsHandler` (class `AvoNetworkCallsHandlerLite`, alias-exported as `AvoNetworkCallsHandler`), kept textually in sync with the full handler. Selects the transport once at construction (v1 for every caller; v2 only for the client `"gtm-web"`), builds Inspector tracking request bodies and POSTs them with client-side gzip for large bodies, under the lite gzipped-bundle budget (≤ 7 KB; currently 5.8 KB).

**Internal, not public API:** `client`, `TrackOptions` and v2 exist only for the web GTM tag template. `src/lite/index.ts` does not export `TrackOptions`, `AvoInspectorLite`'s typed options have no client, and its public track methods take two arguments. No production caller reaches v2 through the lite build (the script-tag bootstrap uses the full build); the untyped `_client` option and private `*WithOptions` methods mirror the full build.

## Tech stack

- TypeScript, browser runtime.
- `XMLHttpRequest` for the POST.
- Browser-native `CompressionStream` + `TextEncoder` for gzip.
- Collaborators: `AvoInspectorLite` (logging flag, network timeout), `EventSpecMetadata` type.

## Data

Same shapes as the full handler, with the lite differences below:

- `BaseBody` has no `publicEncryptionKey`; `streamId` is always `""`.
- `EventSchemaBody extends Omit<BaseBody, "appVersion">` — `appVersion: string|null` (null only on v2), optional top-level `outputReference` / `originHint`.
- `TrackOptions { outputReference?, originHint?, appVersion? }` — declared locally (not imported from the full handler), not re-exported.
- `normalizeHint`, `webGtmTemplateClient = "gtm-web"`, `normalizeClient` — identical to the full handler: `client` is `"gtm-web"` only when the argument trims to exactly that string, otherwise `undefined`.
- `client: string | undefined` and `trackingEndpoint` (v1 `https://api.avo.app/inspector/v1/track` / v2 `https://api.avo.app/inspector/v2/track`) — instance fields set once in the constructor.
- `apiKey` — arrives trimmed from `AvoInspectorLite`.

## Functional requirements

- `constructor(apiKey, envName, appName, appVersion, libVersion, client?)`.
- `callInspectorWithBatchBody`, `callInspectorImmediately`, `bodyForSessionStartedCall`, `bodyForEventSchemaCall(eventName, eventProperties, eventId, eventHash, eventSpecMetadata?, validatedBranchId?, options?)` — same guard, null filtering, empty-list short-circuit and sampling drop as the full handler. `fixStreamIds` is a no-op; `callInspectorImmediately` does not touch the stream id.

### Gateway coordinates (identical to the full handler)

- **v1: `options` ignored entirely.**
- **v2:** normalized `outputReference` / `originHint` set only when defined, never from or into `eventProperties`; `appVersion` = option when given; else `null` when `originHint` is present; else the configured version.
- No `options` or `{}` → pre-existing body on either transport. Codegen bodies never carry hints.

### Send path (`callInspectorApi` → `sendTrackingRequest`)

1. `body = JSON.stringify(events)`.
2. **Uncompressed fast path (synchronous):** no `CompressionStream` OR `body.length < 1024` → string, `isGzipped=false`.
3. **Compressed path (async):** `gzip(body)`; success → `Uint8Array`, `isGzipped=true`; `null` → uncompressed string.
4. `sendTrackingRequest` POSTs to `this.trackingEndpoint`. v1: `Content-Type: text/plain` only. v2: `Content-Type: application/json`, `api-key`, `env`, `X-Avo-Client: gtm-web`. Both: `Content-Encoding: gzip` only when gzipped; `timeout = AvoInspector.networkTimeout`. IMPORTANT: construction through `send` is inside a `try`/`catch` that reports `Failed to send request: …` via `onCompleted` and returns, so a rejected header cannot latch `sending`.
5. `onload`: non-200 → Error; 200 → parse (failure → Error), adopt numeric `samplingRate`, `onCompleted(null)`. `onerror` / `ontimeout` → Errors.

`gzip(body)` — UTF-8 → `"gzip"` `CompressionStream` → concatenated `Uint8Array`; `null` on any throw.

## Non-functional requirements

- **Textual-sync invariant:** gzip helper, threshold, transport selection, gateway rules, headers and the setup `try`/`catch` are byte-for-byte the full handler's; `verify:lite-sync` drift is 49 of 55; `check:lite-size` enforces ≤ 7 KB gzipped.
- **v1 compatibility invariant:** without `"gtm-web"`, URL, headers and body bytes are the pre-v2 lite request (`libVersion` aside), whatever `options` were passed; pinned in `src/__tests__/V1WireBaseline_test.ts`. Lite typings unchanged; pinned in `src/__tests__/PublicSurface_test.ts`.
- **Fallbacks:** no `CompressionStream` → synchronous uncompressed send; compression failure → uncompressed; sub-1 KB → uncompressed.
- **Wire-shape invariant:** a gzipped body gunzips to the exact `JSON.stringify(events)`.
- **CORS:** v1 preflighted only when gzipped; every v2 POST is preflighted and needs `Content-Type`, `api-key`, `env`, `X-Avo-Client`, `Content-Encoding` allowed.
