# AvoInspectorLite

## Short description

Public entry class of the lite Inspector SDK (`avo-inspector/lite`, exported as `AvoInspector`). A size-constrained subset of `AvoInspector`: extracts event schemas and batches them for sending, without deduplication, event-spec validation, encryption or stream ids. Mirrors the full build's internal client and gateway-options plumbing.

## Tech stack

- TypeScript, browser runtime.
- Collaborators: `AvoSchemaParserLite`, `AvoBatcherLite`, `AvoNetworkCallsHandlerLite` (+ `TrackOptions` type), `AvoStorage`, `AvoInspectorEnv`.

## Data

```ts
constructor(options: { apiKey: string; env: AvoInspectorEnvValueType; version: string;
  appName?: string; suffix?: string })
```

- Public fields: `environment`, `avoBatcher`, `apiKey` (trimmed), `version`.
- Statics: `avoStorage`; `batchSize` (setter clamps to ≥ 1), `batchFlushSeconds`, `shouldLog`, `networkTimeout`.
- **Internal, untyped option `_client`** — passed to `AvoNetworkCallsHandlerLite`, which selects v2 only for `"gtm-web"`. No production caller sets it on the lite build.
- Alias export `AvoInspector` so sibling lite modules import it under the full-build name.

## Functional requirements

- **Constructor:** `env` empty/unsupported → `Dev` with `console.warn`; empty `apiKey` or `version` → throws; `apiKey` stored **trimmed**; `Dev` → `batchSize = 1`, logging on; otherwise 30 / 30 s, logging off; creates `AvoStorage`, `AvoNetworkCallsHandlerLite(apiKey, env, appName ?? "", version, libVersion, options._client)` and `AvoBatcher`.
- `trackSchemaFromEvent(eventName, eventProperties): Promise<EventProperty[]>` — **not `async`**; returns `this._trackSchemaFromEventWithOptions(eventName, eventProperties, undefined)`.
- `private async _trackSchemaFromEventWithOptions(eventName, eventProperties, options)` — logs when enabled, extracts the schema, `trackSchemaInternal(…, null, null, options)`, returns the schema; `[]` on caught error.
- `_avoFunctionTrackSchemaFromEvent(eventName, eventProperties, eventId, eventHash)` (private, Codegen) — unchanged; never passes `options`.
- `trackSchema(eventName, eventSchema): Promise<void>` — **not `async`**; returns `this._trackSchemaWithOptions(eventName, eventSchema, undefined)`.
- `private async _trackSchemaWithOptions(eventName, eventSchema, options)` — logs when enabled and batches with `options`; errors caught.
- `trackSchemaInternal(eventName, eventSchema, eventId, eventHash, options?)` — `avoBatcher.handleTrackSchema(eventName, eventSchema, eventId, eventHash, undefined, options)` in a `try`/`catch`.
- `extractSchema(eventProperties)` — `AvoSchemaParserLite.extractSchema(props)`; `[]` on error.
- `enableLogging`, `setBatchSize` (through the clamping setter), `setBatchFlushSeconds`.

## Non-functional requirements

- Must stay within the lite gzipped-bundle budget (≤ 7 KB; 5.8 KB), enforced by `check:lite-size`.
- Runtime errors inside the `*WithOptions` bodies are logged and resolve. IMPORTANT: the public wrappers read `this._…WithOptions` outside that `try`, so a call without a valid receiver throws a synchronous `TypeError`.
- The `*WithOptions` methods and `_client` are absent from the emitted lite `.d.ts`; options affect the wire only with the `"gtm-web"` client.
- Every event is batched; there is no immediate send path.
