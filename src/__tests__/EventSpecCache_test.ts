import { EventSpecCache } from "../eventSpec/AvoEventSpecCache";
import type { EventSpecResponse } from "../eventSpec/AvoEventSpecFetchTypes";

// Mock event spec response for testing
const mockEventSpecResponse: EventSpecResponse = {
  events: [
    {
      id: "evt_123",
      name: "user_login",
      props: {
        login_method: {
          id: "prop_login_method",
          t: { type: "primitive", value: "string" },
          r: true,
          v: ["email", "google", "facebook"]
        }
      },
      variants: []
    }
  ],
  metadata: {
    schemaId: "schema_123",
    branchId: "main",
    latestActionId: "action_123"
  }
};

describe("EventSpecCache", () => {
  let cache: EventSpecCache;

  beforeEach(() => {
    cache = new EventSpecCache(false);
  });

  describe("Basic Operations", () => {
    test("should store and retrieve event specs", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);
      const retrieved = cache.get("apiKey1", "stream1", "event1");

      expect(retrieved).toEqual(mockEventSpecResponse);
    });

    test("should return null for cache miss", () => {
      const retrieved = cache.get("apiKey1", "stream1", "event1");
      expect(retrieved).toBeNull();
    });

    test("should distinguish between different cache keys", () => {
      const spec1: EventSpecResponse = {
        ...mockEventSpecResponse,
        events: [{ ...mockEventSpecResponse.events[0], id: "evt_1" }]
      };
      const spec2: EventSpecResponse = {
        ...mockEventSpecResponse,
        events: [{ ...mockEventSpecResponse.events[0], id: "evt_2" }]
      };

      cache.set("apiKey1", "stream1", "event1", spec1);
      cache.set("apiKey1", "stream1", "event2", spec2);

      const retrieved1 = cache.get("apiKey1", "stream1", "event1");
      const retrieved2 = cache.get("apiKey1", "stream1", "event2");

      expect(retrieved1?.events[0].id).toBe("evt_1");
      expect(retrieved2?.events[0].id).toBe("evt_2");
    });

    test("should distinguish between different apiKeys", () => {
      const spec1: EventSpecResponse = {
        ...mockEventSpecResponse,
        events: [{ ...mockEventSpecResponse.events[0], id: "evt_key1" }]
      };
      const spec2: EventSpecResponse = {
        ...mockEventSpecResponse,
        events: [{ ...mockEventSpecResponse.events[0], id: "evt_key2" }]
      };

      cache.set("apiKey1", "stream1", "event1", spec1);
      cache.set("apiKey2", "stream1", "event1", spec2);

      const retrieved1 = cache.get("apiKey1", "stream1", "event1");
      const retrieved2 = cache.get("apiKey2", "stream1", "event1");

      expect(retrieved1?.events[0].id).toBe("evt_key1");
      expect(retrieved2?.events[0].id).toBe("evt_key2");
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
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);

      // Initially should be cached
      expect(cache.get("apiKey1", "stream1", "event1")).toEqual(mockEventSpecResponse);

      // Fast forward 4 minutes - should still be cached
      jest.advanceTimersByTime(4 * 60 * 1000);
      expect(cache.get("apiKey1", "stream1", "event1")).toEqual(mockEventSpecResponse);

      // Fast forward 2 more minutes (total 6 minutes) - should be expired
      jest.advanceTimersByTime(2 * 60 * 1000);
      expect(cache.get("apiKey1", "stream1", "event1")).toBeNull();
    });

    test("should not expire entries before TTL", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);

      // Fast forward just under 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000 - 1);

      expect(cache.get("apiKey1", "stream1", "event1")).toEqual(mockEventSpecResponse);
    });
  });

  describe("Cache Hit-based Rotation", () => {
    test("should increment hit count on cache hits", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);
      cache.set("apiKey1", "stream1", "event2", mockEventSpecResponse);

      // Simulate cache hits (not just any events)
      cache.get("apiKey1", "stream1", "event1");
      cache.get("apiKey1", "stream1", "event2");

      const stats = cache.getStats();
      expect(stats.globalEventCount).toBe(2);
      expect(stats.entries[0].eventCount).toBe(1); // event1 hit once
      expect(stats.entries[1].eventCount).toBe(1); // event2 hit once
    });

    test("should evict oldest entry after 50 cache hits", () => {
      // Add first entry
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);

      // Simulate 10 cache hits on event1
      for (let i = 0; i < 10; i++) {
        cache.get("apiKey1", "stream1", "event1");
      }

      // Add second entry (newer)
      cache.set("apiKey1", "stream1", "event2", mockEventSpecResponse);

      // Simulate 40 more cache hits on event1 (total 50 hits)
      for (let i = 0; i < 40; i++) {
        cache.get("apiKey1", "stream1", "event1");
      }

      // After 50 hits, next get should trigger eviction of the oldest entry
      // First entry should be evicted (oldest timestamp)
      expect(cache.get("apiKey1", "stream1", "event2")).toEqual(mockEventSpecResponse);
      // The cache should have rotated after 50 hits
      expect(cache.size()).toBe(1);
    });

    test("should reset global hit count after rotation", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);

      // Trigger 50 cache hits to trigger rotation
      for (let i = 0; i < 50; i++) {
        cache.get("apiKey1", "stream1", "event1");
      }

      const stats = cache.getStats();
      expect(stats.globalEventCount).toBe(0); // Should reset after rotation
    });

    test("should expire entries that reach 50 hits", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);

      // Hit 50 times
      for (let i = 0; i < 50; i++) {
        cache.get("apiKey1", "stream1", "event1");
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
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);
      jest.advanceTimersByTime(1000);

      cache.set("apiKey1", "stream1", "event2", mockEventSpecResponse);
      jest.advanceTimersByTime(1000);

      cache.set("apiKey1", "stream1", "event3", mockEventSpecResponse);

      // Initially, all entries should be cached
      expect(cache.size()).toBe(3);

      // Hit each event to create a mix of usage patterns
      // event1: 20 hits, event2: 15 hits, event3: 15 hits = 50 total
      for (let i = 0; i < 20; i++) {
        cache.get("apiKey1", "stream1", "event1");
      }
      for (let i = 0; i < 15; i++) {
        cache.get("apiKey1", "stream1", "event2");
      }
      for (let i = 0; i < 15; i++) {
        cache.get("apiKey1", "stream1", "event3");
      }

      // After 50 hits globally, oldest (event1) should be evicted
      expect(cache.size()).toBe(2);

      // Oldest entry (event1) should be evicted
      expect(cache.get("apiKey1", "stream1", "event1")).toBeNull();

      // event2 and event3 should still be accessible (lower individual hit counts)
      expect(cache.get("apiKey1", "stream1", "event2")).toEqual(mockEventSpecResponse);
      expect(cache.get("apiKey1", "stream1", "event3")).toEqual(mockEventSpecResponse);
    });

    test("should evict LRU entry correctly with staggered additions", () => {
      // Add first entry
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);
      jest.advanceTimersByTime(1000);

      // Hit event1 10 times
      for (let i = 0; i < 10; i++) {
        cache.get("apiKey1", "stream1", "event1");
      }

      // Add second entry (newer, with lower hit count)
      cache.set("apiKey1", "stream1", "event2", mockEventSpecResponse);

      // Verify both are cached
      expect(cache.size()).toBe(2);

      // Hit event1 40 more times (total 50 from start, triggers rotation)
      for (let i = 0; i < 40; i++) {
        cache.get("apiKey1", "stream1", "event1");
      }

      // After rotation, oldest entry should be gone, size should be 1
      expect(cache.size()).toBe(1);

      // event1 should be evicted (oldest by timestamp)
      expect(cache.get("apiKey1", "stream1", "event1")).toBeNull();
      // event2 should still be there
      expect(cache.get("apiKey1", "stream1", "event2")).toEqual(mockEventSpecResponse);
    });
  });

  describe("Cache Management", () => {
    test("clear should remove all entries", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);
      cache.set("apiKey1", "stream1", "event2", mockEventSpecResponse);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get("apiKey1", "stream1", "event1")).toBeNull();
      expect(cache.get("apiKey1", "stream1", "event2")).toBeNull();
    });

    test("clear should reset global hit count", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);
      cache.get("apiKey1", "stream1", "event1");
      cache.get("apiKey1", "stream1", "event1");

      cache.clear();

      const stats = cache.getStats();
      expect(stats.globalEventCount).toBe(0);
    });

    test("size should return number of cached entries", () => {
      expect(cache.size()).toBe(0);

      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);
      expect(cache.size()).toBe(1);

      cache.set("apiKey1", "stream1", "event2", mockEventSpecResponse);
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
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);
      jest.advanceTimersByTime(1000);

      cache.get("apiKey1", "stream1", "event1");
      cache.get("apiKey1", "stream1", "event1");

      const stats = cache.getStats();

      expect(stats.size).toBe(1);
      expect(stats.globalEventCount).toBe(2);
      expect(stats.entries.length).toBe(1);
      expect(stats.entries[0].eventCount).toBe(2);
      expect(stats.entries[0].age).toBeGreaterThanOrEqual(1000);
    });

    test("getStats should include all cached entries", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);
      cache.set("apiKey1", "stream1", "event2", mockEventSpecResponse);
      cache.set("apiKey1", "stream1", "event3", mockEventSpecResponse);

      const stats = cache.getStats();

      expect(stats.size).toBe(3);
      expect(stats.entries.length).toBe(3);
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty cache gracefully", () => {
      expect(cache.size()).toBe(0);
      expect(cache.get("apiKey1", "stream1", "event1")).toBeNull();

      const stats = cache.getStats();
      expect(stats.size).toBe(0);
      expect(stats.entries.length).toBe(0);
    });

    test("should handle rotation with single entry", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpecResponse);

      // Trigger rotation with 50 hits
      for (let i = 0; i < 50; i++) {
        cache.get("apiKey1", "stream1", "event1");
      }

      // Entry should be evicted after 50 hits
      expect(cache.size()).toBe(0);
    });

    test("should handle cache misses gracefully", () => {
      // Getting non-existent entries should not throw error
      for (let i = 0; i < 50; i++) {
        expect(cache.get("apiKey1", "stream1", "nonexistent")).toBeNull();
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
        cache.set("apiKey1", "stream1", `event${i}`, mockEventSpecResponse);
      }

      // Simulate realistic usage:
      // - 3 "hot" events get hit frequently (event1, event2, event3)
      // - 7 "cold" events rarely get hit (event4-10)

      // Hot events: 15 hits each = 45 total hits
      for (let i = 0; i < 15; i++) {
        cache.get("apiKey1", "stream1", "event1");
        cache.get("apiKey1", "stream1", "event2");
        cache.get("apiKey1", "stream1", "event3");
      }

      // Cold events: 1 hit each = 7 hits (total now 52)
      for (let i = 4; i <= 10; i++) {
        cache.get("apiKey1", "stream1", `event${i}`);
      }

      // After 50+ cache hits, oldest entry should be evicted
      // event1 was added first, so it should be evicted
      expect(cache.size()).toBe(9);
      expect(cache.get("apiKey1", "stream1", "event1")).toBeNull();

      // Hot events 2 and 3 should still be cached
      expect(cache.get("apiKey1", "stream1", "event2")).toEqual(mockEventSpecResponse);
      expect(cache.get("apiKey1", "stream1", "event3")).toEqual(mockEventSpecResponse);

      // Cold events should still be cached (low individual hit counts)
      expect(cache.get("apiKey1", "stream1", "event4")).toEqual(mockEventSpecResponse);
      expect(cache.get("apiKey1", "stream1", "event10")).toEqual(mockEventSpecResponse);
    });

    test("should handle mixed hit patterns without premature eviction", () => {
      // Scenario: Multiple events with varying access patterns
      // Verify that uncached events don't trigger eviction

      cache.set("apiKey1", "stream1", "popular", mockEventSpecResponse);
      cache.set("apiKey1", "stream1", "occasional", mockEventSpecResponse);
      cache.set("apiKey1", "stream1", "rare", mockEventSpecResponse);

      // Popular event: 40 cache hits
      for (let i = 0; i < 40; i++) {
        cache.get("apiKey1", "stream1", "popular");
      }

      // Occasional event: 8 cache hits (total 48)
      for (let i = 0; i < 8; i++) {
        cache.get("apiKey1", "stream1", "occasional");
      }

      // Rare event: 1 cache hit (total 49)
      cache.get("apiKey1", "stream1", "rare");

      // All should still be cached (under 50 total hits)
      expect(cache.size()).toBe(3);
      expect(cache.get("apiKey1", "stream1", "popular")).toEqual(mockEventSpecResponse); // 41 hits now
      expect(cache.get("apiKey1", "stream1", "occasional")).toEqual(mockEventSpecResponse); // 9 hits now
      expect(cache.get("apiKey1", "stream1", "rare")).toEqual(mockEventSpecResponse); // 2 hits now (total 52)

      // After 50+ hits, oldest should be evicted
      expect(cache.size()).toBe(2);
    });

    test("should demonstrate improved behavior vs old implementation", () => {
      // Old behavior: Tracking 1000 different events would cause constant evictions
      // New behavior: Only cache hits matter, so rarely-accessed cache entries stay longer

      // Add 5 events
      for (let i = 1; i <= 5; i++) {
        cache.set("apiKey1", "stream1", `event${i}`, mockEventSpecResponse);
      }

      // Hit only event1 repeatedly (49 times)
      for (let i = 0; i < 49; i++) {
        cache.get("apiKey1", "stream1", "event1");
      }

      // All 5 events should still be cached
      // (Old implementation would have evicted after 50 "events" tracked)
      expect(cache.size()).toBe(5);

      // One more hit triggers rotation
      cache.get("apiKey1", "stream1", "event1");

      // Now oldest (event1) is evicted, others remain
      expect(cache.size()).toBe(4);
      expect(cache.get("apiKey1", "stream1", "event2")).toEqual(mockEventSpecResponse);
      expect(cache.get("apiKey1", "stream1", "event3")).toEqual(mockEventSpecResponse);
      expect(cache.get("apiKey1", "stream1", "event4")).toEqual(mockEventSpecResponse);
      expect(cache.get("apiKey1", "stream1", "event5")).toEqual(mockEventSpecResponse);
    });
  });
});
