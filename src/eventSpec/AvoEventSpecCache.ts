import type { EventSpecResponse, EventSpecCacheEntry } from "./AvoEventSpecFetchTypes";

/**
 * EventSpecCache implements a dual-condition cache with LRU eviction.
 *
 * Cache Policy:
 * - TTL: Entries expire after 60 seconds
 * - Per-entry eviction: Entries retrieved 50+ times evicted immediately on next get
 * - Global sweep: Runs every 50 cache operations (get/set)
 * - Capacity: LRU eviction when size > 50 entries
 * - Null spec responses: cached (to avoid re-fetching)
 * - branchId flush: cache cleared when branchId changes (handled externally)
 *
 * Cache Key Format: ${apiKey}:${streamId}:${eventName}
 */
export class EventSpecCache {
  /** Cache storage: key -> CacheEntry */
  private cache: Map<string, EventSpecCacheEntry>;

  /** Time-to-live in milliseconds (60 seconds) */
  private readonly TTL_MS = 60 * 1000;

  /** Maximum cache hit count before per-entry eviction (50 hits) */
  private readonly MAX_EVENT_COUNT = 50;

  /** Maximum number of cache entries */
  private readonly MAX_ENTRIES = 50;

  /** Global cache operation counter to track when to sweep */
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
   * Returns undefined (cache miss) if the entry is missing.
   * Returns null if a null spec was cached (known absent).
   * Returns the spec if valid.
   *
   * On cache hit, increments the hit count for this entry and the global counter.
   */
  get(
    apiKey: string,
    streamId: string,
    eventName: string
  ): EventSpecResponse | null | undefined {
    const key = this.generateKey(apiKey, streamId, eventName);
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check if entry has expired by TTL
    if (this.isExpiredByTTL(entry)) {
      this.cache.delete(key);
      return undefined;
    }

    // Check per-entry eviction (50+ accesses)
    if (entry.eventCount >= this.MAX_EVENT_COUNT) {
      this.cache.delete(key);
      return undefined;
    }

    if (this.shouldLog) {
      console.log(`[Avo Inspector] Cache hit for key: ${key}`);
    }

    // Update lastAccessed for LRU eviction
    entry.lastAccessed = Date.now();

    // Increment hit count for this entry
    entry.eventCount++;
    this.globalEventCount++;

    // Global sweep every 50 operations
    if (this.globalEventCount >= this.MAX_EVENT_COUNT) {
      this.sweep();
      this.globalEventCount = 0;
    }

    return entry.spec;
  }

  /**
   * Stores an event spec response in the cache.
   * Null responses are cached to prevent re-fetching for known absent specs.
   */
  set(
    apiKey: string,
    streamId: string,
    eventName: string,
    spec: EventSpecResponse | null
  ): void {
    const key = this.generateKey(apiKey, streamId, eventName);

    // Enforce capacity limit with LRU eviction
    if (!this.cache.has(key) && this.cache.size >= this.MAX_ENTRIES) {
      this.evictLRU();
    }

    const now = Date.now();
    const entry: EventSpecCacheEntry = {
      spec: spec,
      timestamp: now,
      lastAccessed: now,
      eventCount: 0
    };

    this.cache.set(key, entry);

    this.globalEventCount++;

    // Global sweep every 50 operations
    if (this.globalEventCount >= this.MAX_EVENT_COUNT) {
      this.sweep();
      this.globalEventCount = 0;
    }
  }

  /**
   * Checks if a cache entry has expired by TTL (older than 60s).
   */
  private isExpiredByTTL(entry: EventSpecCacheEntry): boolean {
    const age = Date.now() - entry.timestamp;
    return age > this.TTL_MS;
  }

  /**
   * Sweeps the cache: removes all entries expired by TTL.
   */
  private sweep(): void {
    const keysToDelete: string[] = [];
    this.cache.forEach((entry, key) => {
      if (this.isExpiredByTTL(entry)) {
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Evicts the least recently used cache entry based on lastAccessed timestamp.
   */
  private evictLRU(): void {
    if (this.cache.size === 0) {
      return;
    }

    let lruKey: string | null = null;
    let oldestAccessTime = Infinity;

    this.cache.forEach((entry, key) => {
      if (entry.lastAccessed < oldestAccessTime) {
        oldestAccessTime = entry.lastAccessed;
        lruKey = key;
      }
    });

    if (lruKey !== null) {
      this.cache.delete(lruKey);
    }
  }

  /**
   * Clears all cached entries.
   */
  clear(): void {
    this.cache.clear();
    this.globalEventCount = 0;
    if (this.shouldLog) {
      console.log("[Avo Inspector] Cache cleared");
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
    entries: Array<{ key: string; age: number; lastAccessedAgo: number; eventCount: number }>;
  } {
    const entries: Array<{ key: string; age: number; lastAccessedAgo: number; eventCount: number }> = [];
    const now = Date.now();

    this.cache.forEach((entry, key) => {
      entries.push({
        key,
        age: now - entry.timestamp,
        lastAccessedAgo: now - entry.lastAccessed,
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
