import type {
  EventSpecResponse,
  EventSpecResponseWire,
  EventSpecEntry,
  EventSpecEntryWire,
  PropertyConstraints,
  PropertyConstraintsWire,
  FetchEventSpecParams,
} from "./AvoEventSpecFetchTypes";

/**
 * EventSpecFetcher handles fetching event specifications from the Avo API.
 *
 * Endpoint: GET /trackingPlan/eventSpec
 * Base URL: https://api.avo.app
 *
 * Adapted for React Native: uses global fetch instead of XMLHttpRequest.
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
    return `${params.apiKey}:${params.streamId}:${params.eventName}`;
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
   * When null is returned, validation is skipped for that event.
   *
   * In-flight de-duplication: concurrent requests for the same key
   * share a single fetch promise. On failure, all waiters receive null.
   */
  async fetch(params: FetchEventSpecParams): Promise<EventSpecResponse | null> {
    const requestKey: string = this.generateRequestKey(params);
    // Check if there's already an in-flight request for this spec
    const existingRequest: Promise<EventSpecResponse | null> | undefined =
      this.inFlightRequests.get(requestKey);
    if (existingRequest) {
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
    try {
      const wireResponse: EventSpecResponseWire | null = await this.makeRequest(
        url
      );
      if (!wireResponse) {
        if (this.shouldLog) {
          console.warn(
            `[Avo Inspector] Failed to fetch event spec for: ${params.eventName}`
          );
        }
        return null;
      }
      // Basic structure check for wire format
      if (!this.hasExpectedShape(wireResponse)) {
        if (this.shouldLog) {
          console.warn(
            `[Avo Inspector] Invalid event spec response for: ${params.eventName}`
          );
        }
        return null;
      }
      // Parse wire format to internal format
      const response: EventSpecResponse =
        AvoEventSpecFetcher.parseEventSpecResponse(wireResponse);
      return response;
    } catch (error) {
      if (this.shouldLog) {
        console.error(
          `[Avo Inspector] Error fetching event spec for: ${params.eventName}`,
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
      eventName: params.eventName,
    });
    return `${this.baseUrl}/trackingPlan/eventSpec?${queryParams.toString()}`;
  }

  /**
   * Makes an HTTP GET request using global fetch (available in React Native).
   * Returns the parsed JSON response or null on failure.
   */
  private async makeRequest(url: string): Promise<EventSpecResponseWire | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status !== 200) {
        if (this.shouldLog) {
          console.warn(
            `[Avo Inspector] Request failed with status: ${response.status}`
          );
        }
        return null;
      }

      try {
        const json: EventSpecResponseWire = await response.json();
        return json;
      } catch (parseError) {
        if (this.shouldLog) {
          console.error(
            "[Avo Inspector] Failed to parse response:",
            parseError
          );
        }
        return null;
      }
    } catch (error: any) {
      clearTimeout(timeoutId);
      if (error && error.name === "AbortError") {
        if (this.shouldLog) {
          console.error(
            `[Avo Inspector] Request timed out after ${this.timeout}ms`
          );
        }
      } else {
        if (this.shouldLog) {
          console.error("[Avo Inspector] Network error occurred");
        }
      }
      return null;
    }
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

  /** Parses the wire format response into internal format with meaningful field names. */
  private static parseEventSpecResponse(
    wire: EventSpecResponseWire
  ): EventSpecResponse {
    return {
      events: wire.events.map(AvoEventSpecFetcher.parseEventSpecEntry),
      metadata: wire.metadata,
    };
  }

  /** Parses a single event spec entry from wire format. */
  private static parseEventSpecEntry(wire: EventSpecEntryWire): EventSpecEntry {
    const props: Record<string, PropertyConstraints> = {};
    for (const entry of Object.entries(wire.p)) {
      const propName: string = entry[0];
      const propWire: PropertyConstraintsWire = entry[1];
      props[propName] = AvoEventSpecFetcher.parsePropertyConstraints(propWire);
    }
    return {
      branchId: wire.b,
      baseEventId: wire.id,
      variantIds: wire.vids,
      props: props,
    };
  }

  /** Parses property constraints from wire format. */
  private static parsePropertyConstraints(
    wire: PropertyConstraintsWire
  ): PropertyConstraints {
    const result: PropertyConstraints = { type: wire.t, required: wire.r };
    if (wire.l) {
      result.isList = wire.l;
    }
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
        result.children[propName] =
          AvoEventSpecFetcher.parsePropertyConstraints(childWire);
      }
    }
    return result;
  }
}
