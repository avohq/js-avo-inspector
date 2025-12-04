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
      } else if (this.url.includes("nested")) {
        this.status = 200;
        this.responseText = JSON.stringify(mockNestedEventSpecResponseWire);
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

// Mock wire format response matching the real API format
const mockEventSpecResponseWire: EventSpecResponseWire = {
  branchId: "main",
  baseEvent: {
    name: "User Login",
    id: "evt_123",
    props: {
      login_method: {
        t: "string",
        r: true,
        v: ["email", "google", "facebook"]
      },
      user_email: {
        t: "string",
        r: true
      },
      attempt_count: {
        t: "int",
        r: false,
        min: 1,
        max: 10
      }
    }
  },
  variants: [
    {
      variantId: "v1",
      nameSuffix: "with social",
      eventId: "evt_123.v1",
      props: {
        login_method: {
          t: "string",
          r: true,
          v: ["google", "facebook"]
        },
        user_email: {
          t: "string",
          r: true
        },
        attempt_count: {
          t: "int",
          r: false,
          min: 1,
          max: 5
        }
      }
    },
    {
      variantId: "v2",
      nameSuffix: "with email",
      eventId: "evt_123.v2",
      props: {
        login_method: {
          t: "string",
          r: true,
          v: ["email"]
        },
        user_email: {
          t: "string",
          r: true
        },
        attempt_count: {
          t: "int",
          r: false,
          min: 1,
          max: 3
        }
      }
    }
  ]
};

// Mock wire format response with nested object arrays (like Cmd Palette Results Received)
const mockNestedEventSpecResponseWire: EventSpecResponseWire = {
  branchId: "main",
  baseEvent: {
    name: "Cmd Palette Results Received",
    id: "m2MFSPe9KC",
    props: {
      "Schema Id": {
        t: "string",
        r: true
      },
      "Visible Smart Results": {
        t: {
          "Item Name": { t: "string", r: false },
          "Item Type": {
            t: "string",
            r: false,
            v: ["Property", "Event", "Branch"]
          },
          "Search Result Position": { t: "int", r: true, min: 1 },
          "Search Result Ranking": { t: "float", r: true, min: 0, max: 1 },
          "Search Term": { t: "string", r: true }
        },
        r: true,
        l: true
      },
      "Visible Fuzzy Matches": {
        t: {
          "Item Name": { t: "string", r: false },
          "Item Type": { t: "string", r: false }
        },
        r: true,
        l: true
      }
    }
  },
  variants: [
    {
      variantId: "uBcwgjbg-",
      nameSuffix: "tracking plan item search",
      eventId: "m2MFSPe9KC.uBcwgjbg-",
      props: {
        "Schema Id": {
          t: "string",
          r: true
        },
        "Visible Smart Results": {
          t: {
            "Item Name": { t: "string", r: false },
            "Item Type": {
              t: "string",
              r: false,
              v: ["Property", "Event", "Branch"]
            },
            "Search Result Position": { t: "int", r: true, min: 1 },
            "Search Result Ranking": { t: "float", r: true, min: 0, max: 1 },
            "Search Term": { t: "string", r: true }
          },
          r: true,
          l: true
        },
        "Visible Fuzzy Matches": {
          t: {
            "Item Name": { t: "string", r: false },
            "Item Type": { t: "string", r: false }
          },
          r: true,
          l: true
        }
      }
    }
  ]
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
      // Note: schemaId and latestActionId are not in the new API format
      expect(result?.metadata.branchId).toBe("main");
    });

    test("should parse property constraints with allowed values", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      const loginMethod = result?.events[0].props.login_method;
      expect(loginMethod).toBeDefined();
      expect(loginMethod?.type).toBe("string");
      expect(loginMethod?.required).toBe(true);
      // Allowed values should be converted to Record<JSON string, eventIds>
      expect(loginMethod?.allowedValues).toBeDefined();
    });

    test("should parse min/max ranges correctly", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      const attemptCount = result?.events[0].props.attempt_count;
      expect(attemptCount).toBeDefined();
      expect(attemptCount?.type).toBe("int");
      expect(attemptCount?.minMaxRanges).toBeDefined();
      // Should have entries for each event's min/max
      expect(Object.keys(attemptCount?.minMaxRanges || {}).length).toBeGreaterThan(0);
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

  describe("Nested Object Arrays (List of Objects)", () => {
    test("should parse list of objects with nested schema", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "nested"
      });

      expect(result).not.toBeNull();
      expect(result?.events[0].baseEventId).toBe("m2MFSPe9KC");
      expect(result?.events[0].branchId).toBe("main");
    });

    test("should identify list type correctly for nested objects", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "nested"
      });

      const visibleSmartResults = result?.events[0].props["Visible Smart Results"];
      expect(visibleSmartResults).toBeDefined();
      expect(visibleSmartResults?.type).toBe("list");
      expect(visibleSmartResults?.required).toBe(true);
    });

    test("should parse children for nested object arrays", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "nested"
      });

      const visibleSmartResults = result?.events[0].props["Visible Smart Results"];
      expect(visibleSmartResults?.children).toBeDefined();

      // Should have all child properties
      expect(visibleSmartResults?.children?.["Item Name"]).toBeDefined();
      expect(visibleSmartResults?.children?.["Item Type"]).toBeDefined();
      expect(visibleSmartResults?.children?.["Search Result Position"]).toBeDefined();
      expect(visibleSmartResults?.children?.["Search Result Ranking"]).toBeDefined();
      expect(visibleSmartResults?.children?.["Search Term"]).toBeDefined();
    });

    test("should parse child property types correctly", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "nested"
      });

      const visibleSmartResults = result?.events[0].props["Visible Smart Results"];

      expect(visibleSmartResults?.children?.["Item Name"]?.type).toBe("string");
      expect(visibleSmartResults?.children?.["Item Type"]?.type).toBe("string");
      expect(visibleSmartResults?.children?.["Search Result Position"]?.type).toBe("int");
      expect(visibleSmartResults?.children?.["Search Result Ranking"]?.type).toBe("float");
      expect(visibleSmartResults?.children?.["Search Term"]?.type).toBe("string");
    });

    test("should parse child property constraints correctly", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "nested"
      });

      const visibleSmartResults = result?.events[0].props["Visible Smart Results"];

      // Item Type should have allowed values
      expect(visibleSmartResults?.children?.["Item Type"]?.allowedValues).toBeDefined();

      // Search Result Position should have min/max
      expect(visibleSmartResults?.children?.["Search Result Position"]?.minMaxRanges).toBeDefined();

      // Search Result Ranking should have min/max
      expect(visibleSmartResults?.children?.["Search Result Ranking"]?.minMaxRanges).toBeDefined();
    });

    test("should parse child required flags correctly", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "nested"
      });

      const visibleSmartResults = result?.events[0].props["Visible Smart Results"];

      expect(visibleSmartResults?.children?.["Item Name"]?.required).toBe(false);
      expect(visibleSmartResults?.children?.["Item Type"]?.required).toBe(false);
      expect(visibleSmartResults?.children?.["Search Result Position"]?.required).toBe(true);
      expect(visibleSmartResults?.children?.["Search Result Ranking"]?.required).toBe(true);
      expect(visibleSmartResults?.children?.["Search Term"]?.required).toBe(true);
    });

    test("should include variant event IDs", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "nested"
      });

      expect(result?.events[0].variantIds).toBeDefined();
      expect(result?.events[0].variantIds).toContain("m2MFSPe9KC.uBcwgjbg-");
    });
  });
});
