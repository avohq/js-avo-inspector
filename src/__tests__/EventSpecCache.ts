import { EventSpecCache } from "../eventSpec/AvoEventSpecCache";
import type { EventSpecResponse } from "../eventSpec/AvoEventSpecFetchTypes";

function makeSpec(branchId: string = "branch1"): EventSpecResponse {
  return {
    events: [
      {
        branchId,
        baseEventId: "evt_1",
        variantIds: [],
        props: {
          method: { type: "string", required: true },
        },
      },
    ],
    metadata: {
      schemaId: "schema1",
      branchId,
      latestActionId: "action1",
    },
  };
}

describe("EventSpecCache", () => {
  let cache: EventSpecCache;

  beforeEach(() => {
    cache = new EventSpecCache(false);
  });

  test("returns undefined on cache miss", () => {
    const result = cache.get("key", "stream", "event");
    expect(result).toBeUndefined();
  });

  test("stores and retrieves a spec", () => {
    const spec = makeSpec();
    cache.set("key", "stream", "event", spec);
    const result = cache.get("key", "stream", "event");
    expect(result).toEqual(spec);
  });

  test("caches null spec responses", () => {
    cache.set("key", "stream", "event", null);
    const result = cache.get("key", "stream", "event");
    expect(result).toBeNull();
  });

  test("TTL eviction: entries older than 60s removed on next get", () => {
    const spec = makeSpec();
    cache.set("key", "stream", "event", spec);

    // Fast-forward time by 61 seconds
    const now = Date.now();
    jest.spyOn(Date, "now").mockReturnValue(now + 61000);

    const result = cache.get("key", "stream", "event");
    expect(result).toBeUndefined();
    expect(cache.size()).toBe(0);

    jest.restoreAllMocks();
  });

  test("per-entry eviction: entries retrieved 50+ times evicted immediately on next get", () => {
    const spec = makeSpec();
    cache.set("key", "stream", "event", spec);

    // Access 50 times (reaching the threshold)
    for (let i = 0; i < 50; i++) {
      cache.get("key", "stream", "event");
    }

    // 51st access should evict
    const result = cache.get("key", "stream", "event");
    expect(result).toBeUndefined();
  });

  test("global sweep: runs every 50 cache operations and removes expired entries", () => {
    const now = Date.now();
    const dateSpy = jest.spyOn(Date, "now");

    // Add an entry that will be old
    dateSpy.mockReturnValue(now);
    cache.set("key", "stream", "old-event", makeSpec());

    // Add entries that will be fresh
    dateSpy.mockReturnValue(now + 59000);
    cache.set("key", "stream", "fresh-event", makeSpec());

    // Access fresh-event 50 times to trigger sweep (at now + 59000, old-event has age 59000 which is < 60000)
    // But let's make old-event actually expired
    dateSpy.mockReturnValue(now + 61000);

    // We need 50 operations to trigger sweep. Access fresh-event repeatedly.
    // fresh-event was set at now+59000, so at now+61000 it's only 2s old
    for (let i = 0; i < 49; i++) {
      cache.get("key", "stream", "fresh-event");
    }
    // The 50th get triggers sweep
    cache.get("key", "stream", "fresh-event");

    // old-event should be swept (age > 60s)
    // But fresh-event hit 50 times so per-entry eviction kicks in on next get
    expect(cache.size()).toBeLessThanOrEqual(1);

    jest.restoreAllMocks();
  });

  test("cache capacity: LRU eviction when size > 50", () => {
    // Fill cache to capacity
    for (let i = 0; i < 50; i++) {
      cache.set("key", "stream", `event-${i}`, makeSpec());
    }
    expect(cache.size()).toBe(50);

    // Adding one more should evict the LRU entry
    cache.set("key", "stream", "event-new", makeSpec());
    expect(cache.size()).toBe(50);
  });

  test("LRU eviction removes least recently used entry", () => {
    const now = Date.now();
    const dateSpy = jest.spyOn(Date, "now");

    // Add entries with different timestamps
    dateSpy.mockReturnValue(now);
    cache.set("key", "stream", "event-0", makeSpec());

    dateSpy.mockReturnValue(now + 1000);
    cache.set("key", "stream", "event-1", makeSpec());

    // Access event-0 to update its lastAccessed
    dateSpy.mockReturnValue(now + 2000);
    cache.get("key", "stream", "event-0");

    // Fill to capacity
    for (let i = 2; i < 50; i++) {
      dateSpy.mockReturnValue(now + 3000 + i);
      cache.set("key", "stream", `event-${i}`, makeSpec());
    }

    // Add one more - should evict event-1 (least recently accessed at now+1000)
    dateSpy.mockReturnValue(now + 4000);
    cache.set("key", "stream", "event-new", makeSpec());

    // event-1 should be evicted
    const evicted = cache.get("key", "stream", "event-1");
    expect(evicted).toBeUndefined();

    // event-0 should still be present
    const kept = cache.get("key", "stream", "event-0");
    expect(kept).toBeDefined();

    jest.restoreAllMocks();
  });

  test("clear removes all entries and resets counter", () => {
    cache.set("key", "stream", "event1", makeSpec());
    cache.set("key", "stream", "event2", makeSpec());
    expect(cache.size()).toBe(2);

    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get("key", "stream", "event1")).toBeUndefined();
  });

  test("getStats returns correct statistics", () => {
    cache.set("key", "stream", "event1", makeSpec());
    cache.get("key", "stream", "event1");

    const stats = cache.getStats();
    expect(stats.size).toBe(1);
    expect(stats.entries.length).toBe(1);
    expect(stats.entries[0].eventCount).toBe(1);
  });
});
