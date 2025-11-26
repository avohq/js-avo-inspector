/**
 * This file is generated. Internal development changes should be made in the generator
 * and the file should be re-generated. External contributions are welcome to submit
 * changes directly to this file, and we'll apply them to the generator internally.
 */

import type { EventSpecResponse, FetchEventSpecParams } from "./AvoEventSpecFetchTypes";

/**
 * EventSpecFetcher handles fetching event specifications from the Avo API.
 *
 * Endpoint: GET /getEventSpec
 * Base URL: https://us-central1-avo-web-app.cloudfunctions.net
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
  
  constructor(timeout: number = 2000, shouldLog: boolean = false, env: string, baseUrl: string = "https://us-central1-avo-web-app.cloudfunctions.net") {
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
    const existingRequest: Promise<EventSpecResponse | null> | undefined = this.inFlightRequests.get(requestKey);
    if (existingRequest) {
      if (this.shouldLog) {
        console.log(`[EventSpecFetcher] Returning existing in-flight request for streamId=${params.streamId}, eventName=${params.eventName}`);
      }
      return existingRequest;
    }
    // Create and track the new request
    const requestPromise: Promise<EventSpecResponse | null> = this.fetchInternal(params);
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
  private async fetchInternal(params: FetchEventSpecParams): Promise<EventSpecResponse | null> {
    if (!(this.env === "dev" || this.env === "staging")) {
      return null;
    }
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
      // Basic structure check - just ensure it has the expected shape
      if (!this.hasExpectedShape(response)) {
        if (this.shouldLog) {
          console.warn(`[EventSpecFetcher] Invalid event spec response for: ${params.eventName}`);
        }
        return null;
      }
      if (this.shouldLog) {
        console.log(`[EventSpecFetcher] Successfully fetched event spec for: ${params.eventName}`);
      }
      return response as EventSpecResponse;
    } catch (error) {
      if (this.shouldLog) {
        console.error(`[EventSpecFetcher] Error fetching event spec for: ${params.eventName}`, error);
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
  
  /**
   * Basic shape check - ensures response has the minimum expected structure.
   * Does not perform deep validation of all fields.
   */
  private hasExpectedShape(response: any): boolean {
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
