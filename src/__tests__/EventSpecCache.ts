import { EventSpecCache } from "../eventSpec/AvoEventSpecCache";
import type { EventSpec } from "../eventSpec/AvoEventSpecFetchTypes";

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
      cache.set("apiKey1", "stream1", "event1", mockEventSpec);
      const retrieved = cache.get("apiKey1", "stream1", "event1");

      expect(retrieved).toEqual(mockEventSpec);
    });

    test("should return null for cache miss", () => {
      const retrieved = cache.get("apiKey1", "stream1", "event1");
      expect(retrieved).toBeNull();
    });

    test("should distinguish between different cache keys", () => {
      const spec1 = { ...mockEventSpec, baseEvent: { ...mockEventSpec.baseEvent, id: "evt_1" } };
      const spec2 = { ...mockEventSpec, baseEvent: { ...mockEventSpec.baseEvent, id: "evt_2" } };

      cache.set("apiKey1", "stream1", "event1", spec1);
      cache.set("apiKey1", "stream1", "event2", spec2);

      const retrieved1 = cache.get("apiKey1", "stream1", "event1");
      const retrieved2 = cache.get("apiKey1", "stream1", "event2");

      expect(retrieved1?.baseEvent.id).toBe("evt_1");
      expect(retrieved2?.baseEvent.id).toBe("evt_2");
    });

    test("should distinguish between different branch IDs", () => {
      const spec1 = { ...mockEventSpec, baseEvent: { ...mockEventSpec.baseEvent, id: "evt_main" } };
      const spec2 = { ...mockEventSpec, baseEvent: { ...mockEventSpec.baseEvent, id: "evt_dev" } };

      cache.set("apiKey1", "stream1", "event1", spec1);
      cache.set("apiKey1", "stream2", "event1", spec2);

      const retrieved1 = cache.get("apiKey1", "stream1", "event1");
      const retrieved2 = cache.get("apiKey1", "stream2", "event1");

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
      cache.set("apiKey1", "stream1", "event1", mockEventSpec);

      // Initially should be cached
      expect(cache.get("apiKey1", "stream1", "event1")).toEqual(mockEventSpec);

      // Fast forward 4 minutes - should still be cached
      jest.advanceTimersByTime(4 * 60 * 1000);
      expect(cache.get("apiKey1", "stream1", "event1")).toEqual(mockEventSpec);

      // Fast forward 2 more minutes (total 6 minutes) - should be expired
      jest.advanceTimersByTime(2 * 60 * 1000);
      expect(cache.get("apiKey1", "stream1", "event1")).toBeNull();
    });

    test("should not expire entries before TTL", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpec);

      // Fast forward just under 5 minutes
      jest.advanceTimersByTime(5 * 60 * 1000 - 1);

      expect(cache.get("apiKey1", "stream1", "event1")).toEqual(mockEventSpec);
    });
  });

  describe("Event Count-based Rotation", () => {
    test("should increment event count for all entries", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpec);
      cache.set("apiKey1", "stream1", "event2", mockEventSpec);

      cache.incrementEventCount();
      cache.incrementEventCount();

      const stats = cache.getStats();
      expect(stats.globalEventCount).toBe(2);
      expect(stats.entries[0].eventCount).toBe(2);
      expect(stats.entries[1].eventCount).toBe(2);
    });

    test("should evict oldest entry after 50 events", () => {
      // Add first entry
      cache.set("apiKey1", "stream1", "event1", mockEventSpec);

      // Simulate 10 events
      for (let i = 0; i < 10; i++) {
        cache.incrementEventCount();
      }

      // Add second entry (newer)
      cache.set("apiKey1", "stream1", "event2", mockEventSpec);

      // Simulate 40 more events (total 50)
      for (let i = 0; i < 40; i++) {
        cache.incrementEventCount();
      }

      // First entry should be evicted (oldest)
      expect(cache.get("apiKey1", "stream1", "event1")).toBeNull();
      // Second entry should still be cached
      expect(cache.get("apiKey1", "stream1", "event2")).toEqual(mockEventSpec);
    });

    test("should reset global event count after rotation", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpec);

      // Increment to 50 to trigger rotation
      for (let i = 0; i < 50; i++) {
        cache.incrementEventCount();
      }

      const stats = cache.getStats();
      expect(stats.globalEventCount).toBe(0);
    });

    test("should expire entries that reach 50 events", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpec);

      // Increment to 50
      for (let i = 0; i < 50; i++) {
        cache.incrementEventCount();
      }

      // Entry should be expired due to event count
      expect(cache.get("apiKey1", "stream1", "event1")).toBeNull();
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
      cache.set("apiKey1", "stream1", "event1", mockEventSpec);
      jest.advanceTimersByTime(1000);

      cache.set("apiKey1", "stream1", "event2", mockEventSpec);
      jest.advanceTimersByTime(1000);

      cache.set("apiKey1", "stream1", "event3", mockEventSpec);

      // Initially, all entries should be cached
      expect(cache.size()).toBe(3);

      // Trigger rotation by reaching 50 events
      for (let i = 0; i < 50; i++) {
        cache.incrementEventCount();
      }

      // After rotation, only the oldest should be evicted
      // Cache size should be 2 (event2 and event3 remain)
      expect(cache.size()).toBe(2);

      // Oldest entry (event1) should be evicted
      expect(cache.get("apiKey1", "stream1", "event1")).toBeNull();

      // Note: event2 and event3 will also be expired when we try to get them
      // because they have eventCount >= 50. This is expected behavior.
      // The rotation only removes ONE entry (the oldest), but all entries
      // are checked for expiration when accessed.
    });

    test("should evict LRU entry correctly with staggered additions", () => {
      // Add first entry
      cache.set("apiKey1", "stream1", "event1", mockEventSpec);
      jest.advanceTimersByTime(1000);

      // Increment 10 times
      for (let i = 0; i < 10; i++) {
        cache.incrementEventCount();
      }

      // Add second entry (newer, with lower event count)
      cache.set("apiKey1", "stream1", "event2", mockEventSpec);

      // Verify both are cached
      expect(cache.size()).toBe(2);

      // Increment 40 more times (total 50 from start)
      for (let i = 0; i < 40; i++) {
        cache.incrementEventCount();
      }

      // After rotation, oldest entry should be gone, size should be 1
      expect(cache.size()).toBe(1);

      // event1 should be evicted (oldest by timestamp)
      expect(cache.get("apiKey1", "stream1", "event1")).toBeNull();
    });
  });

  describe("Cache Management", () => {
    test("clear should remove all entries", () => {
      cache.set("apiKey1", "stream1", "event1", mockEventSpec);
      cache.set("apiKey1", "stream1", "event2", mockEventSpec);

      cache.clear();

      expect(cache.size()).toBe(0);
      expect(cache.get("apiKey1", "stream1", "event1")).toBeNull();
      expect(cache.get("apiKey1", "stream1", "event2")).toBeNull();
    });

    test("clear should reset global event count", () => {
      cache.incrementEventCount();
      cache.incrementEventCount();

      cache.clear();

      const stats = cache.getStats();
      expect(stats.globalEventCount).toBe(0);
    });

    test("size should return number of cached entries", () => {
      expect(cache.size()).toBe(0);

      cache.set("apiKey1", "stream1", "event1", mockEventSpec);
      expect(cache.size()).toBe(1);

      cache.set("apiKey1", "stream1", "event2", mockEventSpec);
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
      cache.set("apiKey1", "stream1", "event1", mockEventSpec);
      jest.advanceTimersByTime(1000);

      cache.incrementEventCount();
      cache.incrementEventCount();

      const stats = cache.getStats();

      expect(stats.size).toBe(1);
      expect(stats.globalEventCount).toBe(2);
      expect(stats.entries.length).toBe(1);
      expect(stats.entries[0].eventCount).toBe(2);
      expect(stats.entries[0].age).toBeGreaterThanOrEqual(1000);
    });

    test("getStats should include all cached entries", () => {
        cache.set("apiKey1", "stream1", "event1", mockEventSpec);
      cache.set("apiKey1", "stream1", "event2", mockEventSpec);
      cache.set("apiKey1", "stream1", "event3", mockEventSpec);

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
      cache.set("apiKey1", "stream1", "event1", mockEventSpec);

      // Trigger rotation
      for (let i = 0; i < 50; i++) {
        cache.incrementEventCount();
      }

      // Entry should be evicted
      expect(cache.size()).toBe(0);
    });

    test("should handle rotation with no entries", () => {
      // Should not throw error
      for (let i = 0; i < 50; i++) {
        cache.incrementEventCount();
      }

      expect(cache.size()).toBe(0);
    });
  });
});
