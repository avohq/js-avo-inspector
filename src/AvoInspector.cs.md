# AvoInspector

## Short description

Public entry class of the full Inspector SDK (`src/index.ts`). Validates configuration, extracts event schemas from runtime properties, deduplicates manual tracking against Avo Codegen tracking, fetches and applies event-spec validation in dev/staging, and hands bodies to the batcher or sends validated events immediately. Internally threads the web GTM tag template's client and per-call gateway options to the network layer.

## Tech stack

- TypeScript, browser runtime (also bundled for the script tag via `src/browser.js`).
- Collaborators: `AvoSchemaParser`, `AvoBatcher`, `AvoNetworkCallsHandler` (+ `TrackOptions` type), `AvoStorage`, `AvoDeduplicator`, `EventSpecCache`, `AvoEventSpecFetcher`, `AvoStreamId`, `validateEvent`.

## Data

```ts
constructor(options: { apiKey: string; env: AvoInspectorEnvValueType; version: string;
  appName?: string; suffix?: string; publicEncryptionKey?: string })
```

- Public fields: `environment`, `avoBatcher`, `avoDeduplicator`, `apiKey` (trimmed), `version`.
- Statics: `avoStorage`; `batchSize` (setter clamps to ≥ 1), `batchFlushSeconds`, `shouldLog`, `networkTimeout` (default 2000 ms).
- Private static `_shouldLogSetByUser` (initially `false`) — set to `true` by every write through the `shouldLog` setter, including `enableLogging`; never reset.
- `libVersion` — read from `package.json`.
- **Internal, untyped option `_client`** — read as `(options as … & { _client?: string })._client` and passed to the handler, which selects v2 only for `"gtm-web"`. Not part of the declared options type.
- Private: `avoNetworkCallsHandler`, `publicEncryptionKey`, `streamId`, `eventSpecCache`, `eventSpecFetcher`, `currentBranchId`.

## Users and permissions

Called by application code (npm) or by the script-tag bootstrap; only the bootstrap passes `_client` and calls the `*WithOptions` methods. The api key is sent to Avo; no local auth.

## Functional requirements

- **Constructor:**
  1. `env` empty or unsupported → `Dev` with a `console.warn`.
  2. `apiKey` empty → throws; otherwise stored **trimmed** (`options.apiKey.trim()`), so the handler's header and body copies match.
  3. `version` empty → throws.
  4. `Dev` → `batchSize = 1`; otherwise `batchSize = 30`, `batchFlushSeconds = 30`.
  5. **Logging default:** only when `_shouldLogSetByUser` is `false`, `shouldLog = (env === Dev)`; an explicit preference (from `enableLogging` or `AvoInspector.shouldLog = …`, on any earlier instance or before construction) is kept as is.
  6. Creates `AvoStorage(() => AvoInspector.shouldLog, suffix ?? "")`, `AvoNetworkCallsHandler(apiKey, env, appName ?? "", version, libVersion, publicEncryptionKey, options._client)`, `AvoBatcher`, `AvoDeduplicator`; reads `AvoStreamId.streamId`; when a stream id exists, creates the spec cache and fetcher with the same `() => AvoInspector.shouldLog` getter. Storage, cache and fetcher all read the one static flag live rather than caching a copy.
- `async trackSchemaFromEvent(eventName, eventProperties): Promise<EventProperty[]>` — awaits `this._trackSchemaFromEventWithOptions(eventName, eventProperties, undefined)` inside a `try`/`catch`; a throw (e.g. no receiver) logs `Avo Inspector: something went wrong…` and resolves `[]`.
- `private async _trackSchemaFromEventWithOptions(eventName, eventProperties, options: TrackOptions | undefined)` — if the deduplicator registers the manual event: extract the schema, `fetchAndValidateEvent`; with a validation result, merge results and `sendEventWithValidation(…, options)`; otherwise `trackSchemaInternal(…, null, null, options)`. Returns the schema, or `[]` when deduplicated or on any caught error (logged).
- `_avoFunctionTrackSchemaFromEvent(eventName, eventProperties, eventId, eventHash)` (private, Codegen) — unchanged flow; never passes `options`.
- `async trackSchema(eventName, eventSchema): Promise<void>` — awaits `this._trackSchemaWithOptions(eventName, eventSchema, undefined)` inside a `try`/`catch`; a throw logs and resolves.
- `private async _trackSchemaWithOptions(eventName, eventSchema, options)` — if `shouldRegisterSchemaFromManually`, prefetch the spec and `trackSchemaInternal(…, null, null, options)`; errors caught and logged.
- `trackSchemaInternal(eventName, eventSchema, eventId, eventHash, options?)` — `avoBatcher.handleTrackSchema(eventName, eventSchema, eventId, eventHash, undefined, options)` inside a `try`/`catch`.
- `extractSchema(eventProperties, shouldLogIfEnabled = true)` — warns when Codegen just reported the same params; delegates to `AvoSchemaParser.extractSchema(props, publicEncryptionKey, environment)`; `[]` on error.
- `enableLogging(enable)` — writes `shouldLog` through the static setter (marking the preference explicit). The storage, cache and fetcher read that static flag live, so the change takes effect on every already-constructed component (and every instance) with no propagation.
- `setBatchSize(n)`, `setBatchFlushSeconds(n)` — set the statics.
- **Event specs (dev/staging only):** `fetchEventSpecIfNeeded` / `fetchAndValidateEvent` check the cache (cached empty = no spec), else fetch; a response triggers `handleBranchChangeAndCache` and, for `fetchAndValidateEvent`, `validateEvent`; a null response is cached as empty. Prod never fetches.
- `sendEventWithValidation(eventName, schema, eventId, eventHash, validationResult, options?)` — builds a body with `eventSpecMetadata`, `validatedBranchId` and `options`; `callInspectorImmediately`; on error re-queues via `avoBatcher.handleTrackSchema(…, undefined, options)` — spec metadata dropped, gateway options kept.

## Non-functional requirements

- IMPORTANT: public track methods never throw or reject: errors inside the `*WithOptions` bodies and a call without a receiver (e.g. a destructured method) are logged and resolve (`[]` / `undefined`), as in 3.2.0.
- The `*WithOptions` methods are TypeScript-`private` with a line comment, so they and `_client` are absent from the emitted `.d.ts`; at runtime they are reachable from plain JavaScript.
- Options only affect the wire when the handler's client is `"gtm-web"`; otherwise the request is the pre-v2 one.
- In dev/staging `trackSchemaFromEvent` awaits the spec fetch (bounded by `networkTimeout`) before sending.
- `batchSize`, `batchFlushSeconds` are static: the last constructed instance's environment wins for all instances.
- **`shouldLog` is static and sticky:** the environment default applies only until a preference is set explicitly; after that every later instance in the runtime keeps it, with no reset path.
- A direct `AvoInspector.shouldLog = …` write after construction changes the one static flag that every reader consults live — this class, the batcher, the network handler, `EventValidator`, and each instance's storage, cache and fetcher — so it takes effect immediately and for every inspector instance on the page, exactly like `enableLogging`.
