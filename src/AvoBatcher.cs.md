# AvoBatcher

## Short description

In-memory, storage-backed event queue for the full Inspector build. Collects session-started and event-schema bodies, persists the queue, and flushes it to `AvoNetworkCallsHandler.callInspectorWithBatchBody` by size or elapsed time, re-queueing a batch whose send fails.

## Tech stack

- TypeScript, browser runtime.
- Collaborators: `AvoNetworkCallsHandler` (body construction, batch send, `TrackOptions` type), `AvoInspector` (static `batchSize`, `batchFlushSeconds`, `shouldLog`, `avoStorage`), `EventSpecMetadata` type.

## Data

```ts
export interface AvoBatcherType {
  handleSessionStarted: () => void;
  handleTrackSchema: (eventName: string, schema: EventProperty[], eventId: string | null,
    eventHash: string | null, eventSpecMetadata?: EventSpecMetadata, options?: TrackOptions) => void;
}
```

- `events: Array<SessionStartedBody | EventSchemaBody>` — the pending queue.
- `batchFlushAttemptTimestamp: number` — time of the last flush attempt.
- `static cacheKey = "AvoInspectorEvents"` — storage key for the persisted queue.

## Functional requirements

- **Constructor:** stores the handler, stamps `batchFlushAttemptTimestamp = now`, asynchronously reads `cacheKey` from `AvoInspector.avoStorage`; non-null saved bodies are appended to `events` and a flush check runs. Read errors are logged with `console.error`.
- `handleSessionStarted()` — pushes `bodyForSessionStartedCall()`, saves, checks flush.
- `handleTrackSchema(eventName, schema, eventId, eventHash, eventSpecMetadata?, options?)` — pushes `bodyForEventSchemaCall(eventName, schema, eventId, eventHash, eventSpecMetadata, undefined, options)` (no `validatedBranchId` on the batched path), saves, logs when `shouldLog`, checks flush. `options` are the internal gateway coordinates; the handler applies them only on the v2 transport.
- `checkIfBatchNeedsToBeSent()` — no-op on an empty queue. Flushes when `events.length % AvoInspector.batchSize == 0` OR at least `batchFlushSeconds` elapsed since the last attempt: stamps the attempt time, hands the whole queue to `callInspectorWithBatchBody` and empties `events`. On error, the sent batch is appended back onto `events` (after anything queued meanwhile); either way the queue is saved.
- `saveEvents()` — trims the queue to the newest 1000 bodies, then writes it to storage under `cacheKey`.

## Non-functional requirements

- The flush check runs only when a body is added or on construction after the storage read; there is no timer.
- Persisted bodies are replayed as-is by whichever SDK instance next constructs a batcher with the same storage suffix.
- A failed batch is retried with the next flush; ordering after a failure is not preserved.
- Bodies are finalized when queued: transport-specific fields (gateway hints, nullable `appVersion`) are baked in by the handler that built them, while URL and headers (`api-key`, `env`) come from the handler that flushes them. A persisted queue flushed by a differently configured instance therefore travels on that instance's transport and headers.
- `handleTrackSchema`'s `options` parameter is visible on the public `avoBatcher` field's type; without the `"gtm-web"` client it has no effect.
