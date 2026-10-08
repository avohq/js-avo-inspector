# AvoEventSpecCache

## Short description

In-memory cache of event-spec fetch responses for the full Inspector's dev/staging validation, keyed by api key, stream id and event name. Distinguishes "never fetched" from "fetched, no spec" and expires entries by age, by per-entry hit count, and by a global-hit LRU rotation.

## Tech stack

- TypeScript; `Map`; `Date.now()`.
- Types `EventSpecResponse`, `EventSpecCacheEntry` from `AvoEventSpecFetchTypes`.

## Data

```ts
class EventSpecCache {
  constructor(shouldLog: boolean | (() => boolean) = false)
  contains(apiKey: string, streamId: string, eventName: string): boolean
  get(apiKey: string, streamId: string, eventName: string): EventSpecResponse | null
  set(apiKey: string, streamId: string, eventName: string, spec: EventSpecResponse | null): void
  clear(): void
  size(): number
  getStats(): { size: number; globalEventCount: number;
    entries: Array<{ key: string; age: number; lastAccessedAgo: number; eventCount: number }> }
}
```

- Key: `${apiKey}:${streamId}:${eventName}`.
- Entry (`EventSpecCacheEntry`): `{ spec, timestamp, lastAccessed, eventCount }`.
- `TTL_MS = 60_000` (1 minute; the class doc comment says 5 minutes); `MAX_EVENT_COUNT = 50`.
- `globalEventCount` — hits across all entries since the last rotation or `clear()`.

## Users and permissions

One instance per `AvoInspector`, created only when a stream id exists. No auth.

## Functional requirements

- An entry is **stale** when it is older than `TTL_MS` or its `eventCount` ≥ 50.
- `contains(...)` — `true` for a fresh entry, including a cached `null` spec; a stale entry is deleted and yields `false`. Not a hit.
- `get(...)` — missing → `null`; stale → deleted, `null`; otherwise a hit: logs `[Avo Inspector] Cache hit for key: <key>` when the `shouldLog` getter returns true (read live), sets `lastAccessed = now`, increments the entry's and the global count; when the global count reaches 50, evicts the least-recently-accessed entry and resets the global count; returns `entry.spec` (may be `null`).
- `set(..., spec)` — inserts or overwrites with fresh timestamps and `eventCount = 0`; `null` caches "no spec on the backend".
- `clear()` — empties the map, resets the global count, logs `[Avo Inspector] Cache cleared` when the `shouldLog` getter returns true.
- `size()`, `getStats()` — debug snapshot (`age` and `lastAccessedAgo` in ms).

## Non-functional requirements

- Synchronous; no I/O. Console logging is the only side effect outside the map.
- Size is bounded only by lazy expiry on access and one LRU eviction per 50 global hits; stale entries for keys never requested again stay until `clear()`.
- The hit log line prints the full key, api key included.
