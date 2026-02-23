import type { EventSpecResponse } from "./AvoEventSpecFetchTypes";
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
export declare class EventSpecCache {
    /** Cache storage: key -> CacheEntry */
    private cache;
    /** Time-to-live in milliseconds (60 seconds) */
    private readonly TTL_MS;
    /** Maximum cache hit count before per-entry eviction (50 hits) */
    private readonly MAX_EVENT_COUNT;
    /** Maximum number of cache entries */
    private readonly MAX_ENTRIES;
    /** Global cache operation counter to track when to sweep */
    private globalEventCount;
    /** Whether to log debug information */
    private readonly shouldLog;
    constructor(shouldLog?: boolean);
    /**
     * Generates a cache key from the provided parameters.
     */
    private generateKey;
    /**
     * Retrieves an event spec response from the cache if it exists and is valid.
     * Returns undefined (cache miss) if the entry is missing.
     * Returns null if a null spec was cached (known absent).
     * Returns the spec if valid.
     *
     * On cache hit, increments the hit count for this entry and the global counter.
     */
    get(apiKey: string, streamId: string, eventName: string): EventSpecResponse | null | undefined;
    /**
     * Stores an event spec response in the cache.
     * Null responses are cached to prevent re-fetching for known absent specs.
     */
    set(apiKey: string, streamId: string, eventName: string, spec: EventSpecResponse | null): void;
    /**
     * Checks if a cache entry has expired by TTL (older than 60s).
     */
    private isExpiredByTTL;
    /**
     * Sweeps the cache: removes all entries expired by TTL.
     */
    private sweep;
    /**
     * Evicts the least recently used cache entry based on lastAccessed timestamp.
     */
    private evictLRU;
    /**
     * Clears all cached entries.
     */
    clear(): void;
    /**
     * Returns the current size of the cache.
     */
    size(): number;
    /**
     * Returns cache statistics for debugging.
     */
    getStats(): {
        size: number;
        globalEventCount: number;
        entries: Array<{
            key: string;
            age: number;
            lastAccessedAgo: number;
            eventCount: number;
        }>;
    };
}
