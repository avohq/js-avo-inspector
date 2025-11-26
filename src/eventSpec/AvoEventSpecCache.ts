import type { EventSpecResponse, EventSpecCacheEntry } from "./AvoEventSpecFetchTypes";

/**
 * EventSpecCache implements a dual-condition cache with LRU eviction.
 *
 * Cache Policy:
 * - Entries expire after 5 minutes OR 50 cache hits, whichever comes first
 * - When 50 cache hits occur globally, the oldest cached entry is evicted
 * - Each cache entry tracks: spec, timestamp, and hit count
 *
 * Cache Key Format: ${schemaId}:${sourceId}:${eventName}:${branchId}
 *
 * Note: Event count only increments on cache hits, not on every tracked event.
 * This ensures the cache evicts based on actual usage, not overall tracking volume.
 */
export class EventSpecCache {
  /** Cache storage: key -> CacheEntry */
  private cache: Map<string, EventSpecCacheEntry>;

  /** Time-to-live in milliseconds (5 minutes) */
  private readonly TTL_MS = 5 * 60 * 1000;

  /** Maximum cache hit count before rotating cache (50 hits) */
  private readonly MAX_EVENT_COUNT = 50;

  /** Global cache hit counter to track when to rotate cache */
  private globalEventCount: number = 0;

  /** Whether to log debug information */
  private readonly shouldLog: boolean;

  constructor(shouldLog: boolean = false) {
    this.cache = new Map();
    this.shouldLog = shouldLog;
  }

  /**
   * Generates a cache key from the provided parameters.
   */
  private generateKey(
    apiKey: string,
    streamId: string,
    eventName: string
  ): string {
    return `${apiKey}:${streamId}:${eventName}`;
  }

  /**
   * Retrieves an event spec response from the cache if it exists and is valid.
   * Returns null if the entry is missing, expired, or has exceeded event count.
   *
   * On cache hit, increments the hit count for this entry and the global counter.
   */
  get(
    apiKey: string,
    streamId: string,
    eventName: string
  ): EventSpecResponse | null {
    const key = this.generateKey(apiKey, streamId, eventName);
    const entry = this.cache.get(key);

    if (!entry) {
      if (this.shouldLog) {
        console.log(`[EventSpecCache] Cache miss for key: ${key}`);
      }
      return null;
    }

    // Check if entry has expired
    if (this.shouldEvict(entry)) {
      if (this.shouldLog) {
        console.log(`[EventSpecCache] Cache entry expired for key: ${key}`);
      }
      this.cache.delete(key);
      return null;
    }

    if (this.shouldLog) {
      console.log(`[EventSpecCache] Cache hit for key: ${key}`);
    }

    // Increment hit count for this entry
    entry.eventCount++;
    this.globalEventCount++;

    // Check if we need to evict the oldest entry
    if (this.globalEventCount >= this.MAX_EVENT_COUNT) {
      this.evictOldest();
      this.globalEventCount = 0;
    }

    return entry.spec;
  }

  /**
   * Stores an event spec response in the cache.
   */
  set(
    apiKey: string,
    streamId: string,
    eventName: string,
    spec: EventSpecResponse
  ): void {
    const key = this.generateKey(apiKey, streamId, eventName);

    const entry: EventSpecCacheEntry = {
      spec,
      timestamp: Date.now(),
      eventCount: 0
    };

    this.cache.set(key, entry);

    if (this.shouldLog) {
      console.log(`[EventSpecCache] Cached spec for key: ${key}`);
    }
  }


  /**
   * Determines if a cache entry should be evicted based on:
   * - Age (older than 5 minutes)
   * - Hit count (50 or more cache hits)
   */
  private shouldEvict(entry: EventSpecCacheEntry): boolean {
    const age = Date.now() - entry.timestamp;
    const ageExpired = age > this.TTL_MS;
    const countExpired = entry.eventCount >= this.MAX_EVENT_COUNT;

    return ageExpired || countExpired;
  }

  /**
   * Evicts the oldest cache entry based on timestamp.
   * This implements the LRU (Least Recently Used) eviction policy.
   */
  private evictOldest(): void {
    if (this.cache.size === 0) {
      return;
    }

    let oldestKey: string | null = null;
    let oldestTimestamp = Infinity;

    // Find the entry with the oldest timestamp
    this.cache.forEach((entry, key) => {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    });

    // Remove the oldest entry
    if (oldestKey !== null) {
      this.cache.delete(oldestKey);
      if (this.shouldLog) {
        console.log(`[EventSpecCache] Evicted oldest entry: ${oldestKey}`);
      }
    }
  }

  /**
   * Clears all cached entries. Useful for testing.
   */
  clear(): void {
    this.cache.clear();
    this.globalEventCount = 0;
    if (this.shouldLog) {
      console.log("[EventSpecCache] Cache cleared");
    }
  }

  /**
   * Returns the current size of the cache.
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Returns cache statistics for debugging.
   */
  getStats(): {
    size: number;
    globalEventCount: number;
    entries: Array<{ key: string; age: number; eventCount: number }>;
  } {
    const entries: Array<{ key: string; age: number; eventCount: number }> = [];
    const now = Date.now();

    this.cache.forEach((entry, key) => {
      entries.push({
        key,
        age: now - entry.timestamp,
        eventCount: entry.eventCount
      });
    });

    return {
      size: this.cache.size,
      globalEventCount: this.globalEventCount,
      entries
    };
  }
}
