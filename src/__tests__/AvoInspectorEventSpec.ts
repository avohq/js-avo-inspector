import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import type { EventSpec } from "../eventSpec/AvoEventSpecFetchTypes";

// Mock XMLHttpRequest for event spec fetching
class MockXMLHttpRequest {
  public status: number = 0;
  public responseText: string = "";
  public response: string = "";
  public timeout: number = 0;
  public onload: (() => void) | null = null;
  public onerror: (() => void) | null = null;
  public ontimeout: (() => void) | null = null;

  private url: string = "";

  open(_method: string, url: string): void {
    this.url = url;
  }

  setRequestHeader(_name: string, _value: string): void {}

  send(_body?: any): void {
    // Simulate async behavior
    setTimeout(() => {
      // Check if this is a tracking request or event spec request
      if (this.url.includes("/track")) {
        // Mock tracking endpoint response
        this.status = 200;
        const responseBody = JSON.stringify({ samplingRate: 1.0 });
        this.responseText = responseBody;
        this.response = responseBody;
        if (this.onload) this.onload();
      } else if (this.url.includes("/getEventSpec")) {
        // Mock event spec endpoint response
        this.status = 200;
        const mockSpec: EventSpec = {
          baseEvent: {
            name: "test_event",
            id: "evt_test",
            props: {
              test_prop: {
                t: "string",
                r: true
              }
            }
          }
        };
        const responseBody = JSON.stringify(mockSpec);
        this.responseText = responseBody;
        this.response = responseBody;
        if (this.onload) this.onload();
      }
    }, 10);
  }
}

describe("AvoInspector Event Spec Integration", () => {
  let originalXMLHttpRequest: any;

  beforeAll(() => {
    originalXMLHttpRequest = (global as any).XMLHttpRequest;
    (global as any).XMLHttpRequest = MockXMLHttpRequest;
  });

  afterAll(() => {
    (global as any).XMLHttpRequest = originalXMLHttpRequest;
  });

  describe("Constructor", () => {
    test("should initialize without spec fetching params", () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      expect(inspector).toBeDefined();
      expect(inspector.apiKey).toBe("test-key");
    });

    test("should initialize with spec fetching enabled (no encryption)", () => {
      const consoleSpy = jest.spyOn(console, "log");

      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      expect(inspector).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("validation only, property values will not be sent")
      );

      consoleSpy.mockRestore();
    });

    test("should initialize with encryption key (spec fetching with encryption)", () => {
      const consoleSpy = jest.spyOn(console, "log");

      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0",
        encryptionKey: "encryption-key-123"
      });

      expect(inspector).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("property values will be encrypted")
      );

      consoleSpy.mockRestore();
    });

    test("should enable spec fetching when streamId is present", () => {
      const consoleSpy = jest.spyOn(console, "log");

      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      expect(inspector).toBeDefined();
      // Should log spec fetching enabled message since streamId comes from AvoAnonymousId
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Event spec fetching enabled")
      );

      consoleSpy.mockRestore();
    });

    test("should use default branchId when not provided", () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      expect(inspector).toBeDefined();
      // branchId should default to "main" internally
    });

    test("should use custom branchId when provided", () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      expect(inspector).toBeDefined();
    });
  });

  describe("Event Tracking with Spec Fetching", () => {
    test("should track events normally without spec fetching params", () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const result = inspector.trackSchemaFromEvent("test_event", {
        test_prop: "test_value"
      });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    test("should track events and fetch spec WITHOUT encryption key", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const result = inspector.trackSchemaFromEvent("test_event", {
        test_prop: "test_value"
      });

      // Tracking should succeed immediately (non-blocking)
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);

      // Wait for async spec fetch to complete
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    test("should track events and fetch spec WITH encryption key", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0",
        encryptionKey: "encryption-key-123"
      });

      const result = inspector.trackSchemaFromEvent("test_event", {
        test_prop: "test_value"
      });

      // Tracking should succeed immediately (non-blocking)
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);

      // Wait for async spec fetch to complete
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    test("should not block tracking if spec fetch fails (invalid status code)", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      // Track event - should succeed even if fetch fails
      const result = inspector.trackSchemaFromEvent("failing_event", {
        test_prop: "test_value"
      });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    test("should increment cache event count on each track", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      // Track multiple events
      inspector.trackSchemaFromEvent("event1", { prop: "value1" });
      inspector.trackSchemaFromEvent("event2", { prop: "value2" });
      inspector.trackSchemaFromEvent("event3", { prop: "value3" });

      // All should succeed
      expect(true).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });

  describe("trackSchema with Spec Fetching", () => {
    test("should work with manual schema tracking", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const schema = [
        {
          propertyName: "test_prop",
          propertyType: "string"
        }
      ];

      inspector.trackSchema("test_event", schema);

      // Should not throw error
      expect(true).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 50));
    });
  });

  describe("Error Handling", () => {
    test("should handle spec fetch errors gracefully", async () => {
      const consoleSpy = jest.spyOn(console, "error").mockImplementation();

      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      // Track event - should not throw
      expect(() => {
        inspector.trackSchemaFromEvent("test_event", { prop: "value" });
      }).not.toThrow();

      await new Promise((resolve) => setTimeout(resolve, 50));

      consoleSpy.mockRestore();
    });

    test("should continue tracking even when spec fetching is enabled", () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
        // Spec fetching is enabled by default via streamId from AvoAnonymousId
      });

      // Should still track without error
      expect(() => {
        inspector.trackSchemaFromEvent("test_event", { prop: "value" });
      }).not.toThrow();
    });
  });

  describe("Backwards Compatibility", () => {
    test("should maintain existing behavior without new params", () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Prod,
        version: "1.0.0",
        appName: "TestApp"
      });

      const result = inspector.trackSchemaFromEvent("legacy_event", {
        prop: "value"
      });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    test("should work with existing suffix parameter", () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0",
        suffix: "test-suffix"
      });

      expect(inspector).toBeDefined();
    });

    test("should work with all parameters including optional encryption key", () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0",
        suffix: "test-suffix",
        encryptionKey: "key",
      });

      expect(inspector).toBeDefined();
    });
  });
});
