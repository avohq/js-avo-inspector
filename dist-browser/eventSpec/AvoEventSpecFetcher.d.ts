/**
 * This file is generated. Internal development changes should be made in the generator
 * and the file should be re-generated. External contributions are welcome to submit
 * changes directly to this file, and we'll apply them to the generator internally.
 */
import type { EventSpecResponse, FetchEventSpecParams } from "./AvoEventSpecFetchTypes";
/**
 * EventSpecFetcher handles fetching event specifications from the Avo API.
 *
 * Endpoint: GET /streamInspectorEventShapes
 * Base URL: http://localhost:5001/avo-web-app/us-central1 (local dev)
 *           https://us-central1-avo-web-app.cloudfunctions.net (production)
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
     * When null is returned, validation should be skipped for that event.
     */
    fetch(params: FetchEventSpecParams): Promise<EventSpecResponse | null>;
    /** Internal fetch implementation. */
    private fetchInternal;
    /** Builds the complete URL with query parameters. */
    private buildUrl;
    /**
     * Makes an HTTP GET request using XMLHttpRequest.
     * Returns the parsed JSON response or null on failure.
     */
    private makeRequest;
    /**
     * Basic shape check - ensures response has the minimum expected structure.
     * Does not perform deep validation of all fields.
     */
    private hasExpectedShape;
}
