import { EventSpecCache } from "../eventSpec/cache";
import type { EventSpec } from "../eventSpec/types";

// Mock event spec for testing
const mockEventSpec: EventSpec = {
  baseEvent: {
    name: "user_login",
    id: "evt_123",
    props: {
      login_method: {
        t: "string",
        r: true,
        v: ["email", "google", "facebook"]
      }
    }
  }
};

describe("EventSpecCache", () => {
  let cache: EventSpecCache;

  beforeEach(() => {
    cache = new EventSpecCache(false);
  });

  describe("Basic Operations", () => {
    test("should store and retrieve event specs", () => {
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);
      const retrieved = cache.get("schema1", "source1", "event1", "main");

      expect(retrieved).toEqual(mockEventSpec);
    });

    test("should return null for cache miss", () => {
      const retrieved = cache.get("schema1", "source1", "event1", "main");
      expect(retrieved).toBeNull();
    });

    test("should distinguish between different cache keys", () => {
      const spec1 = { ...mockEventSpec, baseEvent: { ...mockEventSpec.baseEvent, id: "evt_1" } };
      const spec2 = { ...mockEventSpec, baseEvent: { ...mockEventSpec.baseEvent, id: "evt_2" } };

      cache.set("schema1", "source1", "event1", "main", spec1);
      cache.set("schema1", "source1", "event2", "main", spec2);

      const retrieved1 = cache.get("schema1", "source1", "event1", "main");
      const retrieved2 = cache.get("schema1", "source1", "event2", "main");

      expect(retrieved1?.baseEvent.id).toBe("evt_1");
      expect(retrieved2?.baseEvent.id).toBe("evt_2");
    });

    test("should distinguish between different branch IDs", () => {
      const spec1 = { ...mockEventSpec, baseEvent: { ...mockEventSpec.baseEvent, id: "evt_main" } };
      const spec2 = { ...mockEventSpec, baseEvent: { ...mockEventSpec.baseEvent, id: "evt_dev" } };

      cache.set("schema1", "source1", "event1", "main", spec1);
      cache.set("schema1", "source1", "event1", "dev", spec2);

      const retrieved1 = cache.get("schema1", "source1", "event1", "main");
      const retrieved2 = cache.get("schema1", "source1", "event1", "dev");

      expect(retrieved1?.baseEvent.id).toBe("evt_main");
      expect(retrieved2?.baseEvent.id).toBe("evt_dev");
    });
  });

  describe("Time-based Expiration", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("should expire entries after 5 minutes", () => {
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);

      // Initially should be cached
      expect(cache.get("schema1", "source1", "event1", "main")).toEqual(mockEventSpec);

      // Fast forward 4 minutes - should still be cached
      jest.advanceTimersByTime(4 * 60 * 1000);
      expect(cache.get("schema1", "source1", "event1", "main")).toEqual(mockEventSpec);

      // Fast forward 2 more minutes (total 6 minutes) - should be expired
      jest.advanceTimersByTime(2 * 60 * 1000);
      expect(cache.get("schema1", "source1", "event1", "main")).toBeNull();
    });

    test("should not expire entries before TTL", () => {
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);

      // Fast forward just under 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000 - 1);

      expect(cache.get("schema1", "source1", "event1", "main")).toEqual(mockEventSpec);
    });
  });

  describe("Cache Hit-based Rotation", () => {
    test("should increment hit count on cache hits", () => {
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);
      cache.set("schema1", "source1", "event2", "main", mockEventSpec);

      // Simulate cache hits (not just any events)
      cache.get("schema1", "source1", "event1", "main");
      cache.get("schema1", "source1", "event2", "main");

      const stats = cache.getStats();
      expect(stats.globalEventCount).toBe(2);
      expect(stats.entries[0].eventCount).toBe(1); // event1 hit once
      expect(stats.entries[1].eventCount).toBe(1); // event2 hit once
    });

    test("should evict oldest entry after 50 cache hits", () => {
      // Add first entry
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);

      // Simulate 10 cache hits on event1
      for (let i = 0; i < 10; i++) {
        cache.get("schema1", "source1", "event1", "main");
      }

      // Add second entry (newer)
      cache.set("schema1", "source1", "event2", "main", mockEventSpec);

      // Simulate 40 more cache hits on event1 (total 50 hits)
      for (let i = 0; i < 40; i++) {
        cache.get("schema1", "source1", "event1", "main");
      }

      // After 50 hits, next get should trigger eviction of the oldest entry
      // First entry should be evicted (oldest timestamp)
      expect(cache.get("schema1", "source1", "event2", "main")).toEqual(mockEventSpec);
      // The cache should have rotated after 50 hits
      expect(cache.size()).toBe(1);
    });

    test("should reset global hit count after rotation", () => {
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);

      // Trigger 50 cache hits to trigger rotation
      for (let i = 0; i < 50; i++) {
        cache.get("schema1", "source1", "event1", "main");
      }

      const stats = cache.getStats();
      expect(stats.globalEventCount).toBe(0); // Should reset after rotation
    });

    test("should expire entries that reach 50 hits", () => {
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);

      // Hit 50 times
      for (let i = 0; i < 50; i++) {
        cache.get("schema1", "source1", "event1", "main");
      }

      // After 50 hits, the global counter resets and oldest evicted
      // Since there's only one entry, it was evicted during the 50th hit
      expect(cache.size()).toBe(0);
    });
  });

  describe("LRU Eviction", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("should evict oldest entry when rotating", () => {
      // Add three entries with time gaps
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);
      jest.advanceTimersByTime(1000);

      cache.set("schema1", "source1", "event2", "main", mockEventSpec);
      jest.advanceTimersByTime(1000);

      cache.set("schema1", "source1", "event3", "main", mockEventSpec);

      // Initially, all entries should be cached
      expect(cache.size()).toBe(3);

      // Hit each event to create a mix of usage patterns
      // event1: 20 hits, event2: 15 hits, event3: 15 hits = 50 total
      for (let i = 0; i < 20; i++) {
        cache.get("schema1", "source1", "event1", "main");
      }
      for (let i = 0; i < 15; i++) {
        cache.get("schema1", "source1", "event2", "main");
      }
      for (let i = 0; i < 15; i++) {
        cache.get("schema1", "source1", "event3", "main");
      }

      // After 50 hits globally, oldest (event1) should be evicted
      expect(cache.size()).toBe(2);

      // Oldest entry (event1) should be evicted
      expect(cache.get("schema1", "source1", "event1", "main")).toBeNull();

      // event2 and event3 should still be accessible (lower individual hit counts)
      expect(cache.get("schema1", "source1", "event2", "main")).toEqual(mockEventSpec);
      expect(cache.get("schema1", "source1", "event3", "main")).toEqual(mockEventSpec);
    });

    test("should evict LRU entry correctly with staggered additions", () => {
      // Add first entry
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);
      jest.advanceTimersByTime(1000);

      // Hit event1 10 times
      for (let i = 0; i < 10; i++) {
        cache.get("schema1", "source1", "event1", "main");
      }

      // Add second entry (newer, with lower hit count)
      cache.set("schema1", "source1", "event2", "main", mockEventSpec);

      // Verify both are cached
      expect(cache.size()).toBe(2);

      // Hit event1 40 more times (total 50 from start, triggers rotation)
      for (let i = 0; i < 40; i++) {
        cache.get("schema1", "source1", "event1", "main");
      }

      // After rotation, oldest entry should be gone, size should be 1
      expect(cache.size()).toBe(1);

      // event1 should be evicted (oldest by timestamp)
      expect(cache.get("schema1", "source1", "event1", "main")).toBeNull();
      // event2 should still be there
      expect(cache.get("schema1", "source1", "event2", "main")).toEqual(mockEventSpec);
    });
  });

  describe("Cache Management", () => {
    test("clear should remove all entries", () => {
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);
      cache.set("schema1", "source1", "event2", "main", mockEventSpec);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get("schema1", "source1", "event1", "main")).toBeNull();
      expect(cache.get("schema1", "source1", "event2", "main")).toBeNull();
    });

    test("clear should reset global hit count", () => {
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);
      cache.get("schema1", "source1", "event1", "main");
      cache.get("schema1", "source1", "event1", "main");

      cache.clear();

      const stats = cache.getStats();
      expect(stats.globalEventCount).toBe(0);
    });

    test("size should return number of cached entries", () => {
      expect(cache.size()).toBe(0);

      cache.set("schema1", "source1", "event1", "main", mockEventSpec);
      expect(cache.size()).toBe(1);

      cache.set("schema1", "source1", "event2", "main", mockEventSpec);
      expect(cache.size()).toBe(2);

      cache.clear();
      expect(cache.size()).toBe(0);
    });
  });

  describe("Cache Statistics", () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    test("getStats should return accurate statistics", () => {
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);
      jest.advanceTimersByTime(1000);

      cache.get("schema1", "source1", "event1", "main");
      cache.get("schema1", "source1", "event1", "main");

      const stats = cache.getStats();

      expect(stats.size).toBe(1);
      expect(stats.globalEventCount).toBe(2);
      expect(stats.entries.length).toBe(1);
      expect(stats.entries[0].eventCount).toBe(2);
      expect(stats.entries[0].age).toBeGreaterThanOrEqual(1000);
    });

    test("getStats should include all cached entries", () => {
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);
      cache.set("schema1", "source1", "event2", "main", mockEventSpec);
      cache.set("schema1", "source1", "event3", "main", mockEventSpec);

      const stats = cache.getStats();

      expect(stats.size).toBe(3);
      expect(stats.entries.length).toBe(3);
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty cache gracefully", () => {
      expect(cache.size()).toBe(0);
      expect(cache.get("schema1", "source1", "event1", "main")).toBeNull();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.entries.length).toBe(0);
    });

    test("should handle rotation with single entry", () => {
      cache.set("schema1", "source1", "event1", "main", mockEventSpec);

      // Trigger rotation with 50 hits
      for (let i = 0; i < 50; i++) {
        cache.get("schema1", "source1", "event1", "main");
      }

      // Entry should be evicted after 50 hits
      expect(cache.size()).toBe(0);
    });

    test("should handle cache misses gracefully", () => {
      // Getting non-existent entries should not throw error
      for (let i = 0; i < 50; i++) {
        expect(cache.get("schema1", "source1", "nonexistent", "main")).toBeNull();
      }

      expect(cache.size()).toBe(0);
    });
  });

  describe("Realistic Usage Patterns", () => {
    test("should only count cache hits, not total events tracked", () => {
      // Scenario: App tracks 100 events, but only 10 unique event types
      // and only 3 of them are frequently repeated (cached)

      // Add 10 different events to cache
      for (let i = 1; i <= 10; i++) {
        cache.set("schema1", "source1", `event${i}`, "main", mockEventSpec);
      }

      // Simulate realistic usage:
      // - 3 "hot" events get hit frequently (event1, event2, event3)
      // - 7 "cold" events rarely get hit (event4-10)

      // Hot events: 15 hits each = 45 total hits
      for (let i = 0; i < 15; i++) {
        cache.get("schema1", "source1", "event1", "main");
        cache.get("schema1", "source1", "event2", "main");
        cache.get("schema1", "source1", "event3", "main");
      }

      // Cold events: 1 hit each = 7 hits (total now 52)
      for (let i = 4; i <= 10; i++) {
        cache.get("schema1", "source1", `event${i}`, "main");
      }

      // After 50+ cache hits, oldest entry should be evicted
      // event1 was added first, so it should be evicted
      expect(cache.size()).toBe(9);
      expect(cache.get("schema1", "source1", "event1", "main")).toBeNull();

      // Hot events 2 and 3 should still be cached
      expect(cache.get("schema1", "source1", "event2", "main")).toEqual(mockEventSpec);
      expect(cache.get("schema1", "source1", "event3", "main")).toEqual(mockEventSpec);

      // Cold events should still be cached (low individual hit counts)
      expect(cache.get("schema1", "source1", "event4", "main")).toEqual(mockEventSpec);
      expect(cache.get("schema1", "source1", "event10", "main")).toEqual(mockEventSpec);
    });

    test("should handle mixed hit patterns without premature eviction", () => {
      // Scenario: Multiple events with varying access patterns
      // Verify that uncached events don't trigger eviction

      cache.set("schema1", "source1", "popular", "main", mockEventSpec);
      cache.set("schema1", "source1", "occasional", "main", mockEventSpec);
      cache.set("schema1", "source1", "rare", "main", mockEventSpec);

      // Popular event: 40 cache hits
      for (let i = 0; i < 40; i++) {
        cache.get("schema1", "source1", "popular", "main");
      }

      // Occasional event: 8 cache hits (total 48)
      for (let i = 0; i < 8; i++) {
        cache.get("schema1", "source1", "occasional", "main");
      }

      // Rare event: 1 cache hit (total 49)
      cache.get("schema1", "source1", "rare", "main");

      // All should still be cached (under 50 total hits)
      expect(cache.size()).toBe(3);
      expect(cache.get("schema1", "source1", "popular", "main")).toEqual(mockEventSpec); // 41 hits now
      expect(cache.get("schema1", "source1", "occasional", "main")).toEqual(mockEventSpec); // 9 hits now
      expect(cache.get("schema1", "source1", "rare", "main")).toEqual(mockEventSpec); // 2 hits now (total 52)

      // After 50+ hits, oldest should be evicted
      expect(cache.size()).toBe(2);
    });

    test("should demonstrate improved behavior vs old implementation", () => {
      // Old behavior: Tracking 1000 different events would cause constant evictions
      // New behavior: Only cache hits matter, so rarely-accessed cache entries stay longer

      // Add 5 events
      for (let i = 1; i <= 5; i++) {
        cache.set("schema1", "source1", `event${i}`, "main", mockEventSpec);
      }

      // Hit only event1 repeatedly (49 times)
      for (let i = 0; i < 49; i++) {
        cache.get("schema1", "source1", "event1", "main");
      }

      // All 5 events should still be cached
      // (Old implementation would have evicted after 50 "events" tracked)
      expect(cache.size()).toBe(5);

      // One more hit triggers rotation
      cache.get("schema1", "source1", "event1", "main");

      // Now oldest (event1) is evicted, others remain
      expect(cache.size()).toBe(4);
      expect(cache.get("schema1", "source1", "event2", "main")).toEqual(mockEventSpec);
      expect(cache.get("schema1", "source1", "event3", "main")).toEqual(mockEventSpec);
      expect(cache.get("schema1", "source1", "event4", "main")).toEqual(mockEventSpec);
      expect(cache.get("schema1", "source1", "event5", "main")).toEqual(mockEventSpec);
    });
  });
});
