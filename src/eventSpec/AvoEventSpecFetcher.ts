/**
 * This file is generated. Internal development changes should be made in the generator
 * and the file should be re-generated. External contributions are welcome to submit
 * changes directly to this file, and we'll apply them to the generator internally.
 */

import type { EventSpec, FetchEventSpecParams } from "./AvoEventSpecFetchTypes";

/**
 * EventSpecFetcher handles fetching event specifications from the Avo API.
 *
 * Endpoint: GET /getEventSpec
 * Base URL: https://api.avo.app/inspector/v1
 */
export class AvoEventSpecFetcher {
  /** Base URL for the event spec API */
  private readonly baseUrl: string;
  /** Network timeout in milliseconds */
  private readonly timeout: number;
  /** In-flight requests to prevent duplicate fetches */
  private inFlightRequests: Map<string, Promise<EventSpec | null>>;
  /** Whether to log debug information */
  private readonly shouldLog: boolean;
  
  constructor(timeout: number = 2000, shouldLog: boolean = false, baseUrl: string = "https://api.avo.app/inspector/v1") {
    this.baseUrl = baseUrl;
    this.timeout = timeout;
    this.shouldLog = shouldLog;
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
   * When null is returned, Phase 2 should skip validation for that event.
   */
  async fetch(params: FetchEventSpecParams): Promise<EventSpec | null> {
    const requestKey: string = this.generateRequestKey(params);
    // Check if there's already an in-flight request for this spec
    const existingRequest: Promise<EventSpec | null> | undefined = this.inFlightRequests.get(requestKey);
    if (existingRequest) {
      if (this.shouldLog) {
        console.log(`[EventSpecFetcher] Returning existing in-flight request for streamId=${params.streamId}, eventName=${params.eventName}`);
      }
      return existingRequest;
    }
    // Create and track the new request
    const requestPromise: Promise<EventSpec | null> = this.fetchInternal(params);
    this.inFlightRequests.set(requestKey, requestPromise);
    try {
      const result: EventSpec | null = await requestPromise;
      return result;
    } finally {
      // Clean up the in-flight request tracking
      this.inFlightRequests.delete(requestKey);
    }
  }
  
  /** Internal fetch implementation. */
  private async fetchInternal(params: FetchEventSpecParams): Promise<EventSpec | null> {
    const url: string = this.buildUrl(params);
    if (this.shouldLog) {
      console.log(`[EventSpecFetcher] Fetching event spec for: ${params.eventName}`);
      console.log(`[EventSpecFetcher] Using base URL: ${this.baseUrl}`);
    }
    try {
      const response: any = await this.makeRequest(url);
      if (!response) {
        if (this.shouldLog) {
          console.warn(`[EventSpecFetcher] Failed to fetch event spec for: ${params.eventName}`);
        }
        return null;
      }
      // Validate the response structure
      if (!this.isValidEventSpec(response)) {
        if (this.shouldLog) {
          console.warn(`[EventSpecFetcher] Invalid event spec response for: ${params.eventName}`);
        }
        return null;
      }
      if (this.shouldLog) {
        console.log(`[EventSpecFetcher] Successfully fetched event spec for: ${params.eventName}`);
      }
      return response;
    } catch (error) {
      if (this.shouldLog) {
        console.error(`[EventSpecFetcher] Error fetching event spec for: ${params.eventName}`, error);
      }
      return null;
    }
  }
  
  /** Builds the complete URL with query parameters. */
  private buildUrl(params: FetchEventSpecParams): string {
    const queryParams: URLSearchParams = new URLSearchParams({apiKey: params.apiKey, streamId: params.streamId, eventName: params.eventName});
    return `${this.baseUrl}/getEventSpec?${queryParams.toString()}`;
  }
  
  /**
   * Makes an HTTP GET request using XMLHttpRequest.
   * Returns the parsed JSON response or null on failure.
   */
  private makeRequest(url: string): Promise<any> {
    return new Promise((resolve: (value: any) => void) => {
  const xhr: XMLHttpRequest = new XMLHttpRequest();
  xhr.open("GET", url, true);
  xhr.timeout = this.timeout;
  xhr.setRequestHeader("Content-Type", "application/json");
  xhr.onload = () => {
  if (xhr.status === 200) {
    try {
      const response: any = JSON.parse(xhr.responseText);
      resolve(response);
    } catch (error) {
      if (this.shouldLog) {
        console.error("[EventSpecFetcher] Failed to parse response:", error);
      }
      resolve(null);
    }
  } else {
    if (this.shouldLog) {
      console.warn(`[EventSpecFetcher] Request failed with status: ${xhr.status}`);
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
    console.error(`[EventSpecFetcher] Request timed out after ${this.timeout}ms`);
  }
  resolve(null);
};
  xhr.send();
});
  }
  
  /** Validates that the response matches the EventSpec structure. */
  private isValidEventSpec(response: any): response is EventSpec {
    if ((!response) || ((typeof response) !== "object")) {
      return false;
    }
    // Check baseEvent structure
    if ((((((!response.baseEvent) || ((typeof response.baseEvent) !== "object")) || ((typeof response.baseEvent.name) !== "string")) || ((typeof response.baseEvent.id) !== "string")) || (!response.baseEvent.props)) || ((typeof response.baseEvent.props) !== "object")) {
      return false;
    }
    // Variants are optional, but if present, validate the structure
    if (response.variants !== undefined) {
      if (!Array.isArray(response.variants)) {
        return false;
      }
      for (const variant of response.variants) {
        if (((((((!variant) || ((typeof variant) !== "object")) || ((typeof variant.variantId) !== "string")) || ((typeof variant.nameSuffix) !== "string")) || ((typeof variant.eventId) !== "string")) || (!variant.props)) || ((typeof variant.props) !== "object")) {
          return false;
        }
      }
    }
    return true;
  }
}
