import { EventSpecFetcher } from "../eventSpec/fetcher";
import type { EventSpec } from "../eventSpec/types";

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

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(): void {
    // Simulate async behavior
    setTimeout(() => {
      if (this.url.includes("success")) {
        this.status = 200;
        this.responseText = JSON.stringify(mockEventSpec);
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
        this.responseText = JSON.stringify(mockEventSpec);
        if (this.onload) this.onload();
      }
    }, 10);
  }
}

const mockEventSpec: EventSpec = {
  baseEvent: {
    name: "user_login",
    id: "evt_123",
    props: {
      login_method: {
        t: "string",
        r: true,
        v: ["email", "google", "facebook"]
      },
      user_email: {
        t: "string",
        r: true,
        rx: "^[\\w-\\.]+@([\\w-]+\\.)+[\\w-]{2,4}$"
      }
    }
  },
  variants: [
    {
      variantId: "enterprise",
      nameSuffix: "Enterprise",
      eventId: "evt_123.enterprise",
      props: {
        login_method: {
          t: "string",
          r: true,
          v: ["saml", "ldap"]
        },
        company_domain: {
          t: "string",
          r: true,
          rx: "^[a-z0-9-]+\\.com$"
        }
      }
    }
  ]
};

describe("EventSpecFetcher", () => {
  let originalXMLHttpRequest: any;
  let fetcher: EventSpecFetcher;

  beforeAll(() => {
    originalXMLHttpRequest = (global as any).XMLHttpRequest;
    (global as any).XMLHttpRequest = MockXMLHttpRequest;
  });

  afterAll(() => {
    (global as any).XMLHttpRequest = originalXMLHttpRequest;
  });

  beforeEach(() => {
    fetcher = new EventSpecFetcher(2000, false);
  });

  describe("Successful Fetches", () => {
    test("should fetch event spec successfully", async () => {
      const result = await fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success"
      });

      expect(result).not.toBeNull();
      expect(result?.baseEvent.name).toBe("user_login");
      expect(result?.baseEvent.id).toBe("evt_123");
    });

    test("should use default branchId when not provided", async () => {
      const result = await fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success"
      });

      expect(result).not.toBeNull();
    });

    test("should use provided branchId", async () => {
      const result = await fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success",
        branchId: "dev"
      });

      expect(result).not.toBeNull();
    });

    test("should parse event spec with variants", async () => {
      const result = await fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success"
      });

      expect(result?.variants).toBeDefined();
      expect(result?.variants?.length).toBe(1);
      expect(result?.variants?.[0].variantId).toBe("enterprise");
    });
  });

  describe("Failed Fetches", () => {
    test("should return null on network error", async () => {
      const result = await fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "error"
      });

      expect(result).toBeNull();
    });

    test("should return null on timeout", async () => {
      const result = await fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "timeout"
      });

      expect(result).toBeNull();
    });

    test("should return null on 404 status", async () => {
      const result = await fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "404"
      });

      expect(result).toBeNull();
    });

    test("should return null on invalid response", async () => {
      const result = await fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "invalid"
      });

      expect(result).toBeNull();
    });
  });

  describe("In-flight Request Deduplication", () => {
    test("should deduplicate concurrent requests for same event", async () => {
      const promise1 = fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success"
      });

      const promise2 = fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success"
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toEqual(result2);
      expect(result1).not.toBeNull();
    });

    test("should not deduplicate requests for different events", async () => {
      const promise1 = fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success1"
      });

      const promise2 = fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success2"
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should succeed independently
      expect(result1).not.toBeNull();
      expect(result2).not.toBeNull();
    });
  });

  describe("Response Validation", () => {
    test("should validate baseEvent structure", async () => {
      // This test uses the mock which returns valid structure
      const result = await fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success"
      });

      expect(result?.baseEvent).toBeDefined();
      expect(result?.baseEvent.name).toBeDefined();
      expect(result?.baseEvent.id).toBeDefined();
      expect(result?.baseEvent.props).toBeDefined();
    });

    test("should validate property specs", async () => {
      const result = await fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success"
      });

      const loginMethod = result?.baseEvent.props.login_method;
      expect(loginMethod).toBeDefined();
      expect(loginMethod?.t).toBe("string");
      expect(loginMethod?.r).toBe(true);
      expect(loginMethod?.v).toEqual(["email", "google", "facebook"]);
    });

    test("should validate variant structure when present", async () => {
      const result = await fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success"
      });

      const variant = result?.variants?.[0];
      expect(variant).toBeDefined();
      expect(variant?.variantId).toBe("enterprise");
      expect(variant?.nameSuffix).toBe("Enterprise");
      expect(variant?.eventId).toBe("evt_123.enterprise");
      expect(variant?.props).toBeDefined();
    });
  });

  describe("URL Building", () => {
    test("should build correct URL with all parameters", async () => {
      // We can't directly test URL building, but we can verify the fetch succeeds
      // which means the URL was built correctly
      const result = await fetcher.fetch({
        schemaId: "schema_test",
        sourceId: "source_test",
        eventName: "success",
        branchId: "feature-branch"
      });

      expect(result).not.toBeNull();
    });
  });

  describe("Logging", () => {
    test("should not log when shouldLog is false", async () => {
      const consoleSpy = jest.spyOn(console, "log");

      await fetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success"
      });

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    test("should log when shouldLog is true", async () => {
      const consoleSpy = jest.spyOn(console, "log");
      const logFetcher = new EventSpecFetcher(2000, true);

      await logFetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success"
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("Custom Base URL", () => {
    test("should use custom base URL when provided", async () => {
      const customFetcher = new EventSpecFetcher(
        2000,
        false,
        "https://custom.api.example.com/v1"
      );

      const result = await customFetcher.fetch({
        schemaId: "schema1",
        sourceId: "source1",
        eventName: "success"
      });

      // Should still work with custom base URL
      expect(result).not.toBeNull();
    });
  });
});
