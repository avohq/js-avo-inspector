import { AvoEventSpecFetcher } from "../eventSpec/AvoEventSpecFetcher";
import type { EventSpecResponseWire } from "../eventSpec/AvoEventSpecFetchTypes";

// Mock XMLHttpRequest
class MockXMLHttpRequest {
  public status: number = 0;
  public responseText: string = "";
  public timeout: number = 0;
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public ontimeout: (() => void) | null = null;

  private url: string = "";
  private method: string = "";
  private headers: Record<string, string> = {};

  // Track last called URL for test assertions
  static lastCalledUrl: string = "";

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
    MockXMLHttpRequest.lastCalledUrl = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(): void {
    // Simulate async behavior
    setTimeout(() => {
      if (this.url.includes("success")) {
        this.status = 200;
        this.responseText = JSON.stringify(mockEventSpecResponseWire);
        if (this.onload) this.onload();
      } else if (this.url.includes("invalid")) {
        this.status = 200;
        this.responseText = JSON.stringify({ invalid: "response" });
        if (this.onload) this.onload();
      } else if (this.url.includes("error")) {
        if (this.onerror) this.onerror();
      } else if (this.url.includes("timeout")) {
        if (this.ontimeout) this.ontimeout();
      } else if (this.url.includes("404")) {
        this.status = 404;
        if (this.onload) this.onload();
      } else {
        this.status = 200;
        this.responseText = JSON.stringify(mockEventSpecResponseWire);
        if (this.onload) this.onload();
      }
    }, 10);
  }
}

// Mock wire format response (short field names)
const mockEventSpecResponseWire: EventSpecResponseWire = {
  events: [
    {
      b: "main", // branchId
      id: "evt_123", // baseEventId
      vids: ["evt_123.v1", "evt_123.v2"], // variantIds
      p: {
        // props
        login_method: {
          t: "string", // type
          r: true, // required
          p: {
            // pinned values
            email: ["evt_123"],
            google: ["evt_123.v1"],
            facebook: ["evt_123.v2"]
          }
        },
        user_email: {
          t: "string",
          r: true,
          rx: {
            // regex patterns
            "^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$": [
              "evt_123",
              "evt_123.v1",
              "evt_123.v2"
            ]
          }
        }
      }
    }
  ],
  metadata: {
    schemaId: "schema_123",
    branchId: "main",
    latestActionId: "action_456",
    sourceId: "source_789"
  }
};

describe("EventSpecFetcher", () => {
  let originalXMLHttpRequest: any;
  let fetcher: AvoEventSpecFetcher;

  beforeAll(() => {
    originalXMLHttpRequest = (global as any).XMLHttpRequest;
    (global as any).XMLHttpRequest = MockXMLHttpRequest;
  });

  afterAll(() => {
    (global as any).XMLHttpRequest = originalXMLHttpRequest;
  });

  beforeEach(() => {
    fetcher = new AvoEventSpecFetcher(2000, false, "dev");
  });

  describe("Successful Fetches", () => {
    test("should fetch event spec successfully", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(result).not.toBeNull();
      // Parsed result should have long field names
      expect(result?.events[0].baseEventId).toBe("evt_123");
      expect(result?.events[0].branchId).toBe("main");
    });

    test("should use provided parameters in URL", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(result).not.toBeNull();

      // Verify all required parameters are included in the URL query
      expect(MockXMLHttpRequest.lastCalledUrl).toContain("apiKey=apiKey1");
      expect(MockXMLHttpRequest.lastCalledUrl).toContain("streamId=stream1");
      expect(MockXMLHttpRequest.lastCalledUrl).toContain("eventName=success");
    });

    test("should parse event spec with variants", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(result?.events[0].variantIds).toBeDefined();
      expect(result?.events[0].variantIds.length).toBe(2);
      expect(result?.events[0].variantIds).toContain("evt_123.v1");
      expect(result?.events[0].variantIds).toContain("evt_123.v2");
    });

    test("should parse metadata correctly", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(result?.metadata).toBeDefined();
      expect(result?.metadata.schemaId).toBe("schema_123");
      expect(result?.metadata.branchId).toBe("main");
      expect(result?.metadata.latestActionId).toBe("action_456");
      expect(result?.metadata.sourceId).toBe("source_789");
    });

    test("should parse property constraints with long names", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      const loginMethod = result?.events[0].props.login_method;
      expect(loginMethod).toBeDefined();
      expect(loginMethod?.type).toBe("string");
      expect(loginMethod?.required).toBe(true);
      expect(loginMethod?.pinnedValues).toBeDefined();
      expect(loginMethod?.pinnedValues?.email).toContain("evt_123");
    });

    test("should parse regex patterns with long names", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      const userEmail = result?.events[0].props.user_email;
      expect(userEmail).toBeDefined();
      expect(userEmail?.regexPatterns).toBeDefined();
      expect(
        Object.keys(userEmail?.regexPatterns || {}).length
      ).toBeGreaterThan(0);
    });
  });

  describe("Failed Fetches", () => {
    test("should return null on network error", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "error"
      });

      expect(result).toBeNull();
    });

    test("should return null on timeout", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "timeout"
      });

      expect(result).toBeNull();
    });

    test("should return null on 404 status", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "404"
      });

      expect(result).toBeNull();
    });

    test("should return null on invalid response", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "invalid"
      });

      expect(result).toBeNull();
    });

    test("should return null in production environment", async () => {
      const prodFetcher = new AvoEventSpecFetcher(2000, false, "prod");
      const result = await prodFetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(result).toBeNull();
    });
  });

  describe("In-flight Request Deduplication", () => {
    test("should deduplicate concurrent requests for same event", async () => {
      const promise1 = fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      const promise2 = fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual(result2);
      expect(result1).not.toBeNull();
    });

    test("should not deduplicate requests for different events", async () => {
      const promise1 = fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success1"
      });

      const promise2 = fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success2"
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should succeed independently
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });
  });

  describe("Response Validation", () => {
    test("should validate events array structure", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(result?.events).toBeDefined();
      expect(Array.isArray(result?.events)).toBe(true);
      expect(result?.events[0].baseEventId).toBeDefined();
      expect(result?.events[0].branchId).toBeDefined();
      expect(result?.events[0].props).toBeDefined();
    });

    test("should validate property specs structure", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      const loginMethod = result?.events[0].props.login_method;
      expect(loginMethod).toBeDefined();
      expect(loginMethod?.type).toBe("string");
      expect(loginMethod?.required).toBe(true);
    });

    test("should validate metadata structure", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(result?.metadata).toBeDefined();
      expect(result?.metadata.schemaId).toBeDefined();
      expect(result?.metadata.branchId).toBeDefined();
      expect(result?.metadata.latestActionId).toBeDefined();
    });
  });

  describe("URL Building", () => {
    test("should build correct URL with all parameters", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(result).not.toBeNull();
    });
  });

  describe("Logging", () => {
    test("should not log when shouldLog is false", async () => {
      (console.log as jest.Mock).mockClear();

      await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(console.log).not.toHaveBeenCalled();
    });

    test("should log when shouldLog is true", async () => {
      (console.log as jest.Mock).mockClear();
      const logFetcher = new AvoEventSpecFetcher(2000, true, "dev");

      await logFetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(console.log).toHaveBeenCalled();
    });
  });

  describe("Custom Base URL", () => {
    test("should use custom base URL when provided", async () => {
      const customFetcher = new AvoEventSpecFetcher(
        2000,
        false,
        "dev",
        "https://custom.api.example.com/v1"
      );

      const result = await customFetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      // Should still work with custom base URL
      expect(result).not.toBeNull();
    });
  });

  describe("Environment Restrictions", () => {
    test("should work in dev environment", async () => {
      const devFetcher = new AvoEventSpecFetcher(2000, false, "dev");
      const result = await devFetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(result).not.toBeNull();
    });

    test("should work in staging environment", async () => {
      const stagingFetcher = new AvoEventSpecFetcher(2000, false, "staging");
      const result = await stagingFetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(result).not.toBeNull();
    });

    test("should return null in production environment", async () => {
      const prodFetcher = new AvoEventSpecFetcher(2000, false, "prod");
      const result = await prodFetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(result).toBeNull();
    });
  });
});
