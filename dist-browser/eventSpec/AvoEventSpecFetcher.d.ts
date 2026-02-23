import type { EventSpecResponse, FetchEventSpecParams } from "./AvoEventSpecFetchTypes";
/**
 * EventSpecFetcher handles fetching event specifications from the Avo API.
 *
 * Endpoint: GET /trackingPlan/eventSpec
 * Base URL: https://api.avo.app
 *
 * Adapted for React Native: uses global fetch instead of XMLHttpRequest.
 */
export declare class AvoEventSpecFetcher {
    /** Base URL for the event spec API */
    private readonly baseUrl;
    /** Network timeout in milliseconds */
    private readonly timeout;
    /** In-flight requests to prevent duplicate fetches */
    private inFlightRequests;
    /** Whether to log debug information */
    private readonly shouldLog;
    /** Environment name */
    private readonly env;
    constructor(timeout: number | undefined, shouldLog: boolean | undefined, env: string, baseUrl?: string);
    /** Generates a unique key for tracking in-flight requests. */
    private generateRequestKey;
    /**
     * Fetches an event specification from the API.
     *
     * Returns null if:
     * - The network request fails
     * - The response has an invalid status code (non-200)
     * - The response is invalid or malformed
     * - The request times out
     *
     * This method gracefully degrades - failures do not throw errors.
     * When null is returned, validation is skipped for that event.
     *
     * In-flight de-duplication: concurrent requests for the same key
     * share a single fetch promise. On failure, all waiters receive null.
     */
    fetch(params: FetchEventSpecParams): Promise<EventSpecResponse | null>;
    /** Internal fetch implementation. */
    private fetchInternal;
    /** Builds the complete URL with query parameters. */
    private buildUrl;
    /**
     * Makes an HTTP GET request using global fetch (available in React Native).
     * Returns the parsed JSON response or null on failure.
     */
    private makeRequest;
    /**
     * Basic shape check for wire format - ensures response has the minimum expected structure.
     * Uses short field names from wire format.
     */
    private hasExpectedShape;
    /** Parses the wire format response into internal format with meaningful field names. */
    private static parseEventSpecResponse;
    /** Parses a single event spec entry from wire format. */
    private static parseEventSpecEntry;
    /** Parses property constraints from wire format. */
    private static parsePropertyConstraints;
}
