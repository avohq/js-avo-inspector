# AvoBatcherLite

## Short description

Lite-bundle copy of `AvoBatcher` (class still named `AvoBatcher`), kept textually in sync with it: an in-memory, storage-backed event queue for the lite build. Collects session-started and event-schema bodies, persists the queue, and flushes it to `AvoNetworkCallsHandler.callInspectorWithBatchBody` by size or elapsed time, re-queueing a batch whose send fails.

## Tech stack

- TypeScript, browser runtime.
- Collaborators: `AvoNetworkCallsHandlerLite` (body construction, batch send, `TrackOptions` type), `AvoInspectorLite` (static `batchSize`, `batchFlushSeconds`, `shouldLog`, `avoStorage`), `EventSpecMetadata` type.

## Data

```ts
export interface AvoBatcherType {
  handleSessionStarted: () => void;
  handleTrackSchema: (eventName: string, schema: EventProperty[], eventId: string | null,
    eventHash: string | null, eventSpecMetadata?: EventSpecMetadata, options?: TrackOptions) => void;
}
```

`AvoBatcher` also exposes `handleEventBody(eventBody: EventSchemaBody): void`, which is not on `AvoBatcherType`.

- `events: Array<SessionStartedBody | EventSchemaBody>` — the pending queue.
- `batchFlushAttemptTimestamp: number` — time of the last flush attempt.
- `static cacheKey = "AvoInspectorEvents"` — storage key for the persisted queue.

## Functional requirements

- **Constructor:** stores the handler, stamps `batchFlushAttemptTimestamp = now`, asynchronously reads `cacheKey` from `AvoInspectorLite.avoStorage`; non-null saved bodies are appended to `events` and a flush check runs. Read errors are logged with `console.error`.
- `handleSessionStarted()` — returns without queueing when the handler `isQueueingDisabled()`; otherwise pushes `bodyForSessionStartedCall()`, saves, checks flush.
- `handleTrackSchema(eventName, schema, eventId, eventHash, eventSpecMetadata?, options?)` — returns without queueing when the handler `isQueueingDisabled()` (v2 only); otherwise builds `bodyForEventSchemaCall(eventName, schema, eventId, eventHash, eventSpecMetadata, undefined, options)` (no `validatedBranchId` on the batched path) and queues it through `handleEventBody`. `options` are the internal gateway coordinates; the handler applies them only on the v2 transport.
- `handleEventBody(eventBody)` — queues a prebuilt body unchanged. Returns without queueing when the handler `isQueueingDisabled()`; otherwise pushes, saves, logs when `shouldLog`, then checks flush unless the handler `isSendingDisabled()` — in which case the event stays queued and saved for a later page load, with no further send attempt. The lite SDK itself calls it only from `handleTrackSchema`.
- `checkIfBatchNeedsToBeSent()` — no-op on an empty queue, and while the handler `isBatchInFlight()`. Flushes when `events.length % AvoInspectorLite.batchSize === 0` OR at least `batchFlushSeconds` elapsed since the last attempt: stamps the attempt time, hands the whole queue to `callInspectorWithBatchBody` and empties `events`. On error, the handler's `retryEvents` — or, when it supplies none (v1), the whole sent batch — are appended back onto `events` (after anything queued meanwhile); either way the queue is saved. After a successful batch, unless the handler `isSendingDisabled()`, the same flush check runs again, so bodies queued during the send that meet the size or time rule go out without waiting for another event; after a failed batch it does not.
- `saveEvents()` — trims the queue to the newest 1000 bodies, then writes it to storage under `cacheKey`.

## Non-functional requirements

- The flush check runs when a body is added, on construction after the storage read, and after a successful batch; there is no timer.
- At most one batch is in flight per handler. Bodies queued meanwhile wait in `events` and are not re-sent as a cancelled batch.
- While a batch is in flight its bodies are in neither `events` nor, after the next `saveEvents`, storage: storage holds them only until another body is queued during the send.
- Persisted bodies are replayed as-is by whichever SDK instance next constructs a batcher with the same storage suffix.
- A failed batch is retried with the next flush; ordering after a failure is not preserved.
- Bodies are finalized when queued: transport-specific fields (gateway hints, nullable `appVersion`) are baked in by the handler that built them, while URL and headers (`api-key`, `env`) come from the handler that flushes them. A persisted queue flushed by a differently configured instance therefore travels on that instance's transport and headers.
- `handleTrackSchema`'s `options` parameter is visible on the public `avoBatcher` field's type; without the `"gtm-web"` client it has no effect.
- **Lite-sync invariant:** identical to `src/AvoBatcher.ts` apart from imports; `verify:lite-sync` drift is 8 of 55.
