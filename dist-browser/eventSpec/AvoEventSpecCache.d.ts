import type { EventSpecResponse } from "./AvoEventSpecFetchTypes";
/**
 * EventSpecCache implements a dual-condition cache with LRU eviction.
 *
 * Cache Policy:
 * - Entries expire after 5 minutes OR 50 cache hits, whichever comes first
 * - When 50 cache hits occur globally, the oldest cached entry is evicted
 * - Each cache entry tracks: spec, timestamp, and hit count
 *
 * Cache Key Format: ${apiKey}:${streamId}:${eventName}
 *
 * Note: Event count only increments on cache hits, not on every tracked event.
 * This ensures the cache evicts based on actual usage, not overall tracking volume.
 */
export declare class EventSpecCache {
    /** Cache storage: key -> CacheEntry */
    private cache;
    /** Time-to-live in milliseconds (5 minutes) */
    private readonly TTL_MS;
    /** Maximum cache hit count before rotating cache (50 hits) */
    private readonly MAX_EVENT_COUNT;
    /** Global cache hit counter to track when to rotate cache */
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
     * Returns null if the entry is missing, expired, or has exceeded event count.
     *
     * On cache hit, increments the hit count for this entry and the global counter.
     */
    get(apiKey: string, streamId: string, eventName: string): EventSpecResponse | null;
    /**
     * Stores an event spec response in the cache.
     */
    set(apiKey: string, streamId: string, eventName: string, spec: EventSpecResponse): void;
    /**
     * Determines if a cache entry should be evicted based on:
     * - Age (older than 5 minutes)
     * - Hit count (50 or more cache hits)
     */
    private shouldEvict;
    /**
     * Evicts the oldest cache entry based on timestamp.
     * This implements the LRU (Least Recently Used) eviction policy.
     */
    private evictOldest;
    /**
     * Clears all cached entries. Useful for testing.
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
            eventCount: number;
        }>;
    };
}
