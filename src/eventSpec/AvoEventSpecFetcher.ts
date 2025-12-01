/**
 * This file is generated. Internal development changes should be made in the generator
 * and the file should be re-generated. External contributions are welcome to submit
 * changes directly to this file, and we'll apply them to the generator internally.
 */

import type {
  EventSpecResponse,
  EventSpecResponseWire,
  EventSpecEntry,
  EventSpecEntryWire,
  PropertyConstraints,
  PropertyConstraintsWire,
  FetchEventSpecParams
} from "./AvoEventSpecFetchTypes";

// =============================================================================
// PARSING FUNCTIONS (wire format -> internal format)
// =============================================================================

/**
 * Parses the wire format response into internal format with meaningful field names.
 */
function parseEventSpecResponse(wire: EventSpecResponseWire): EventSpecResponse {
  return {
    events: wire.events.map(parseEventSpecEntry),
    metadata: wire.metadata
  };
}

/**
 * Parses a single event spec entry from wire format.
 */
function parseEventSpecEntry(wire: EventSpecEntryWire): EventSpecEntry {
  const props: Record<string, PropertyConstraints> = {};
  for (const [propName, propWire] of Object.entries(wire.p)) {
    props[propName] = parsePropertyConstraints(propWire);
  }

  return {
    branchId: wire.b,
    baseEventId: wire.id,
    variantIds: wire.vids,
    props
  };
}

/**
 * Parses property constraints from wire format.
 */
function parsePropertyConstraints(wire: PropertyConstraintsWire): PropertyConstraints {
  const result: PropertyConstraints = {
    type: wire.t,
    required: wire.r
  };

  if (wire.p) {
    result.pinnedValues = wire.p;
  }
  if (wire.v) {
    result.allowedValues = wire.v;
  }
  if (wire.rx) {
    result.regexPatterns = wire.rx;
  }
  if (wire.minmax) {
    result.minMaxRanges = wire.minmax;
  }
  if (wire.children) {
    result.children = {};
    for (const [propName, childWire] of Object.entries(wire.children)) {
      result.children[propName] = parsePropertyConstraints(childWire);
    }
  }

  return result;
}

// =============================================================================
// EVENT SPEC FETCHER
// =============================================================================

/**
 * EventSpecFetcher handles fetching event specifications from the Avo API.
 *
 * Endpoint: GET /trackingPlan/eventSpec
 * Base URL: https://api.avo.app
 */
export class AvoEventSpecFetcher {
  /** Base URL for the event spec API */
  private readonly baseUrl: string;
  /** Network timeout in milliseconds */
  private readonly timeout: number;
  /** In-flight requests to prevent duplicate fetches */
  private inFlightRequests: Map<string, Promise<EventSpecResponse | null>>;
  /** Whether to log debug information */
  private readonly shouldLog: boolean;
  /** Environment name */
  private readonly env: string;

  constructor(
    timeout: number = 2000,
    shouldLog: boolean = false,
    env: string,
    baseUrl: string = "https://api.avo.app"
  ) {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
    this.shouldLog = shouldLog;
    this.env = env;
    this.inFlightRequests = new Map();
  }

  /** Generates a unique key for tracking in-flight requests. */
  private generateRequestKey(params: FetchEventSpecParams): string {
    return `${params.streamId}:${params.eventName}`;
  }

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
  async fetch(params: FetchEventSpecParams): Promise<EventSpecResponse | null> {
    const requestKey: string = this.generateRequestKey(params);
    // Check if there's already an in-flight request for this spec
    const existingRequest: Promise<EventSpecResponse | null> | undefined =
      this.inFlightRequests.get(requestKey);
    if (existingRequest) {
      if (this.shouldLog) {
        console.log(
          `[EventSpecFetcher] Returning existing in-flight request for streamId=${params.streamId}, eventName=${params.eventName}`
        );
      }
      return existingRequest;
    }
    // Create and track the new request
    const requestPromise: Promise<EventSpecResponse | null> =
      this.fetchInternal(params);
    this.inFlightRequests.set(requestKey, requestPromise);
    try {
      const result: EventSpecResponse | null = await requestPromise;
      return result;
    } finally {
      // Clean up the in-flight request tracking
      this.inFlightRequests.delete(requestKey);
    }
  }

  /** Internal fetch implementation. */
  private async fetchInternal(
    params: FetchEventSpecParams
  ): Promise<EventSpecResponse | null> {
    if (!(this.env === "dev" || this.env === "staging")) {
      return null;
    }
    const url: string = this.buildUrl(params);
    if (this.shouldLog) {
      console.log(
        `[EventSpecFetcher] Fetching event spec for: ${params.eventName}`
      );
      console.log(`[EventSpecFetcher] Using base URL: ${this.baseUrl}`);
    }
    try {
      const wireResponse: EventSpecResponseWire | null =
        await this.makeRequest(url);
      if (!wireResponse) {
        if (this.shouldLog) {
          console.warn(
            `[EventSpecFetcher] Failed to fetch event spec for: ${params.eventName}`
          );
        }
        return null;
      }
      // Basic structure check for wire format
      if (!this.hasExpectedShape(wireResponse)) {
        if (this.shouldLog) {
          console.warn(
            `[EventSpecFetcher] Invalid event spec response for: ${params.eventName}`
          );
        }
        return null;
      }
      // Parse wire format to internal format
      const response = parseEventSpecResponse(wireResponse);
      if (this.shouldLog) {
        console.log(
          `[EventSpecFetcher] Successfully fetched event spec for: ${params.eventName}`
        );
      }
      return response;
    } catch (error) {
      if (this.shouldLog) {
        console.error(
          `[EventSpecFetcher] Error fetching event spec for: ${params.eventName}`,
          error
        );
      }
      return null;
    }
  }

  /** Builds the complete URL with query parameters. */
  private buildUrl(params: FetchEventSpecParams): string {
    const queryParams: URLSearchParams = new URLSearchParams({
      apiKey: params.apiKey,
      streamId: params.streamId,
      eventName: params.eventName
    });
    return `${this.baseUrl}/trackingPlan/eventSpec?${queryParams.toString()}`;
  }

  /**
   * Makes an HTTP GET request using XMLHttpRequest.
   * Returns the parsed JSON response or null on failure.
   */
  private makeRequest(url: string): Promise<EventSpecResponseWire | null> {
    return new Promise((resolve: (value: EventSpecResponseWire | null) => void) => {
      const xhr: XMLHttpRequest = new XMLHttpRequest();
      xhr.open("GET", url, true);
      xhr.timeout = this.timeout;
      // Note: Don't set Content-Type for GET requests - it triggers CORS preflight

      xhr.onload = () => {
        if (xhr.status === 200) {
          try {
            const response: EventSpecResponseWire = JSON.parse(xhr.responseText);
            resolve(response);
          } catch (error) {
            if (this.shouldLog) {
              console.error(
                "[EventSpecFetcher] Failed to parse response:",
                error
              );
            }
            resolve(null);
          }
        } else {
          if (this.shouldLog) {
            console.warn(
              `[EventSpecFetcher] Request failed with status: ${xhr.status}`
            );
          }
          resolve(null);
        }
      };

      xhr.onerror = () => {
        if (this.shouldLog) {
          console.error("[EventSpecFetcher] Network error occurred");
        }
        resolve(null);
      };

      xhr.ontimeout = () => {
        if (this.shouldLog) {
          console.error(
            `[EventSpecFetcher] Request timed out after ${this.timeout}ms`
          );
        }
        resolve(null);
      };

      xhr.send();
    });
  }

  /**
   * Basic shape check for wire format - ensures response has the minimum expected structure.
   * Uses short field names from wire format.
   */
  private hasExpectedShape(response: any): response is EventSpecResponseWire {
    return (
      response &&
      typeof response === "object" &&
      Array.isArray(response.events) &&
      response.metadata &&
      typeof response.metadata === "object" &&
      typeof response.metadata.schemaId === "string" &&
      typeof response.metadata.branchId === "string" &&
      typeof response.metadata.latestActionId === "string"
    );
  }
}
