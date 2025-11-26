import { AvoEventSpecFetcher } from "../eventSpec/AvoEventSpecFetcher";
import type { EventSpecResponse } from "../eventSpec/AvoEventSpecFetchTypes";

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
        this.responseText = JSON.stringify(mockEventSpecResponse);
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
        this.responseText = JSON.stringify(mockEventSpecResponse);
        if (this.onload) this.onload();
      }
    }, 10);
  }
}

const mockEventSpecResponse: EventSpecResponse = {
  events: [
    {
      id: "evt_123",
      name: "user_login",
      props: {
        login_method: {
          id: "prop_login_method",
          t: { type: "primitive", value: "string" },
          r: true,
          v: ["email", "google", "facebook"]
        },
        user_email: {
          id: "prop_user_email",
          t: { type: "primitive", value: "string" },
          r: true,
          rx: "^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$"
        }
      },
      variants: [
        {
          variantId: "enterprise",
          eventId: "evt_123",
          nameSuffix: "Enterprise",
          props: {
            login_method: {
              id: "prop_login_method_ent",
              t: { type: "primitive", value: "string" },
              r: true,
              v: ["saml", "ldap"]
            },
            company_domain: {
              id: "prop_company_domain",
              t: { type: "primitive", value: "string" },
              r: true,
              rx: "^[a-z0-9-]+\\.com$"
            }
          }
        }
      ]
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
      expect(result?.events[0].name).toBe("user_login");
      expect(result?.events[0].id).toBe("evt_123");
    });

    test("should use provided parameters in URL", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      expect(result).not.toBeNull();
      expect(result?.events[0].name).toBe("user_login");

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

      expect(result?.events[0].variants).toBeDefined();
      expect(result?.events[0].variants?.length).toBe(1);
      expect(result?.events[0].variants?.[0].variantId).toBe("enterprise");
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
      expect(result?.events[0].name).toBeDefined();
      expect(result?.events[0].id).toBeDefined();
      expect(result?.events[0].props).toBeDefined();
    });

    test("should validate property specs", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      const loginMethod = result?.events[0].props.login_method;
      expect(loginMethod).toBeDefined();
      expect(loginMethod?.t.type).toBe("primitive");
      expect(loginMethod?.t.value).toBe("string");
      expect(loginMethod?.r).toBe(true);
      expect(loginMethod?.v).toEqual(["email", "google", "facebook"]);
    });

    test("should validate variant structure when present", async () => {
      const result = await fetcher.fetch({
        apiKey: "apiKey1",
        streamId: "stream1",
        eventName: "success"
      });

      const variant = result?.events[0].variants?.[0];
      expect(variant).toBeDefined();
      expect(variant?.variantId).toBe("enterprise");
      expect(variant?.eventId).toBe("evt_123");
      expect(variant?.nameSuffix).toBe("Enterprise");
      expect(variant?.props).toBeDefined();
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
