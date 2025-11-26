import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoNetworkCallsHandler } from "../AvoNetworkCallsHandler";
import { AvoBatcher } from "../AvoBatcher";
import { AvoEventSpecFetcher } from "../eventSpec/AvoEventSpecFetcher";
import { EventSpecCache } from "../eventSpec/AvoEventSpecCache";
import type { EventSpecResponse } from "../eventSpec/AvoEventSpecFetchTypes";

// Mock dependencies
jest.mock("../AvoStorage", () => ({
  AvoStorage: jest.fn().mockImplementation(() => ({
    isInitialized: jest.fn().mockReturnValue(true),
    getItemAsync: jest.fn().mockResolvedValue(null),
    getItem: jest.fn().mockReturnValue(null),
    setItem: jest.fn()
  }))
}));
jest.mock("../eventSpec/AvoEventSpecFetcher");
jest.mock("../eventSpec/AvoEventSpecCache");

// Mock spec response for validation
const mockValidEventSpecResponse: EventSpecResponse = {
  events: [
    {
      id: "evt_test",
      name: "test_event",
      props: {
        required_prop: {
          id: "prop_required",
          t: { type: "primitive", value: "string" },
          r: true
        },
        optional_prop: {
          id: "prop_optional",
          t: { type: "primitive", value: "number" },
          r: false,
          min: 0,
          max: 100
        }
      },
      variants: []
    }
  ],
  metadata: {
    schemaId: "schema_123",
    branchId: "main",
    latestActionId: "action_456",
    sourceId: "source_789"
  }
};

describe("Validation Integration", () => {
  let callInspectorImmediatelySpy: jest.SpyInstance;
  let batcherHandleTrackSchemaSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("When event spec is available", () => {
    beforeEach(() => {
      // Mock cache to return spec
      (EventSpecCache as jest.Mock).mockImplementation(() => ({
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));

      // Mock fetcher (shouldn't be called when cache hit)
      (AvoEventSpecFetcher as jest.Mock).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(mockValidEventSpecResponse)
      }));
    });

    test("should validate event and send immediately", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      // Spy on sendEventImmediately
      callInspectorImmediatelySpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      ).mockImplementation((...args: any[]) => { args[1](null); });

      // Spy on batcher
      batcherHandleTrackSchemaSpy = jest.spyOn(
        inspector.avoBatcher,
        "handleTrackSchema"
      );

      // Track valid event
      await inspector.trackSchemaFromEvent("test_event", {
        required_prop: "test_value",
        optional_prop: 50
      });

      // Should send immediately, not batch
      expect(callInspectorImmediatelySpy).toHaveBeenCalledTimes(1);
      expect(batcherHandleTrackSchemaSpy).not.toHaveBeenCalled();

      // Check the event body has validation data
      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];
      expect(eventBody.eventSpecMetadata).toBeDefined();
      expect(eventBody.eventSpecMetadata.schemaId).toBe("schema_123");
    });

    test("should include validation errors in payload when validation fails", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      ).mockImplementation((...args: any[]) => { args[1](null); });

      // Track event with missing required prop
      await inspector.trackSchemaFromEvent("test_event", {
        optional_prop: 50
      });

      expect(callInspectorImmediatelySpy).toHaveBeenCalledTimes(1);

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];
      expect(eventBody.validationErrors).toBeDefined();
      expect(eventBody.validationErrors.length).toBeGreaterThan(0);
      expect(eventBody.validationErrors.some((e: any) => e.code === "RequiredMissing")).toBe(true);
    });

    test("should log validation errors when shouldLog is true", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });
      inspector.enableLogging(true);

      // Clear previous calls to check only this test's calls
      (console.log as jest.Mock).mockClear();

      callInspectorImmediatelySpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      ).mockImplementation((...args: any[]) => { args[1](null); });

      // Track event with validation errors
      await inspector.trackSchemaFromEvent("test_event", {
        optional_prop: 150 // Above max
      });

      // Should log validation errors (console.log is globally mocked)
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Validation errors"),
        expect.any(Array)
      );
    });

    test("should include variantId when variant matches", async () => {
      // Mock spec with variant
      const specWithVariant: EventSpecResponse = {
        events: [
          {
            id: "evt_purchase",
            name: "purchase",
            props: {
              amount: {
                id: "prop_amount",
                t: { type: "primitive", value: "number" },
                r: true
              }
            },
            variants: [
              {
                variantId: "var_premium",
                eventId: "evt_purchase",
                nameSuffix: "Premium",
                props: {
                  tier: {
                    id: "prop_tier",
                    t: { type: "primitive", value: "string" },
                    r: false,
                    v: ["premium"]
                  }
                }
              }
            ]
          }
        ],
        metadata: {
          schemaId: "schema_456",
          branchId: "main",
          latestActionId: "action_789"
        }
      };

      (EventSpecCache as jest.Mock).mockImplementation(() => ({
        get: jest.fn().mockReturnValue(specWithVariant),
        set: jest.fn()
      }));

      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      ).mockImplementation((...args: any[]) => { args[1](null); });

      // Track event matching premium variant
      await inspector.trackSchemaFromEvent("purchase", {
        amount: 100,
        tier: "premium"
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];
      expect(eventBody.variantId).toBe("var_premium");
    });
  });

  describe("When event spec is not available", () => {
    beforeEach(() => {
      // Mock cache to return null (cache miss)
      (EventSpecCache as jest.Mock).mockImplementation(() => ({
        get: jest.fn().mockReturnValue(null),
        set: jest.fn()
      }));

      // Mock fetcher to return null (spec not found)
      (AvoEventSpecFetcher as jest.Mock).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(null)
      }));
    });

    test("should fall back to batched flow", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      );

      batcherHandleTrackSchemaSpy = jest.spyOn(
        inspector.avoBatcher,
        "handleTrackSchema"
      );

      await inspector.trackSchemaFromEvent("unknown_event", {
        some_prop: "value"
      });

      // Should use batcher, not immediate send
      expect(batcherHandleTrackSchemaSpy).toHaveBeenCalledTimes(1);
      expect(callInspectorImmediatelySpy).not.toHaveBeenCalled();
    });
  });

  describe("In production environment", () => {
    beforeEach(() => {
      // Reset mocks
      (EventSpecCache as jest.Mock).mockImplementation(() => ({
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));
    });

    test("should always use batched flow (no validation)", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Prod,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      );

      batcherHandleTrackSchemaSpy = jest.spyOn(
        inspector.avoBatcher,
        "handleTrackSchema"
      );

      await inspector.trackSchemaFromEvent("test_event", {
        required_prop: "test_value"
      });

      // In production, should use batcher (no validation)
      expect(batcherHandleTrackSchemaSpy).toHaveBeenCalledTimes(1);
      expect(callInspectorImmediatelySpy).not.toHaveBeenCalled();
    });
  });

  describe("Error handling", () => {
    beforeEach(() => {
      (EventSpecCache as jest.Mock).mockImplementation(() => ({
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));
    });

    test("should fall back to batcher if immediate send fails", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      // Mock immediate send to fail
      callInspectorImmediatelySpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      ).mockImplementation((...args: any[]) => { args[1](new Error("Network error")); });

      batcherHandleTrackSchemaSpy = jest.spyOn(
        inspector.avoBatcher,
        "handleTrackSchema"
      );

      await inspector.trackSchemaFromEvent("test_event", {
        required_prop: "test_value"
      });

      // Should try immediate send first
      expect(callInspectorImmediatelySpy).toHaveBeenCalledTimes(1);

      // On failure, should fall back to batcher
      expect(batcherHandleTrackSchemaSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Privacy - No user data in validation errors", () => {
    beforeEach(() => {
      (EventSpecCache as jest.Mock).mockImplementation(() => ({
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));
    });

    test("should NOT include 'received' value in validation errors", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      ).mockImplementation((...args: any[]) => { args[1](null); });

      // Track event with validation errors (value above max)
      await inspector.trackSchemaFromEvent("test_event", {
        required_prop: "test",
        optional_prop: 999  // Way above max of 100
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];
      
      // Ensure no validation error contains 'received' (user data)
      expect(eventBody.validationErrors).toBeDefined();
      expect(eventBody.validationErrors.length).toBeGreaterThan(0);
      
      for (const error of eventBody.validationErrors) {
        expect(error).not.toHaveProperty("received");
      }
      
      // But 'expected' should still be present (from spec, not user data)
      const maxError = eventBody.validationErrors.find((e: any) => e.code === "ValueAboveMax");
      expect(maxError).toBeDefined();
      expect(maxError.expected).toBe(100);
    });

    test("should NOT include 'received' for type mismatch errors", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      ).mockImplementation((...args: any[]) => { args[1](null); });

      // Track event with wrong type (string instead of number)
      await inspector.trackSchemaFromEvent("test_event", {
        required_prop: "test",
        optional_prop: "not_a_number"  // Should be number
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];
      const typeError = eventBody.validationErrors?.find((e: any) => e.code === "TypeMismatch");
      
      if (typeError) {
        expect(typeError).not.toHaveProperty("received");
        expect(typeError.expected).toBe("number");
      }
    });
  });

  describe("Property name correlation with encrypted values", () => {
    beforeEach(() => {
      (EventSpecCache as jest.Mock).mockImplementation(() => ({
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));
    });

    test("should allow correlation between validation errors and eventProperties via propertyName", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      ).mockImplementation((...args: any[]) => { args[1](null); });

      // Track event with validation error
      await inspector.trackSchemaFromEvent("test_event", {
        required_prop: "secret_value",
        optional_prop: 150  // Above max - will trigger validation error
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];
      
      // Find the validation error for optional_prop
      const validationError = eventBody.validationErrors?.find(
        (e: any) => e.propertyName === "optional_prop"
      );
      expect(validationError).toBeDefined();
      
      // Find the same property in eventProperties
      const eventProperty = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "optional_prop"
      );
      expect(eventProperty).toBeDefined();
      
      // Both should have the same propertyName for backend correlation
      expect(validationError.propertyName).toBe(eventProperty.propertyName);
    });

    test("should include propertyId in validation errors for precise correlation", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      ).mockImplementation((...args: any[]) => { args[1](null); });

      // Track event with missing required prop
      await inspector.trackSchemaFromEvent("test_event", {
        optional_prop: 50
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];
      const requiredError = eventBody.validationErrors?.find(
        (e: any) => e.code === "RequiredMissing"
      );
      
      expect(requiredError).toBeDefined();
      expect(requiredError.propertyId).toBe("prop_required");
      expect(requiredError.propertyName).toBe("required_prop");
    });
  });

  describe("Sampling behavior for validated events", () => {
    beforeEach(() => {
      (EventSpecCache as jest.Mock).mockImplementation(() => ({
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));
    });

    test("should NOT drop validated events due to sampling", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      // Spy on the actual callInspectorApi to verify it's called
      const callInspectorApiSpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler as any,
        "callInspectorApi"
      ).mockImplementation((...args: any[]) => { args[1](null); });

      // Force sampling to drop everything (random > samplingRate)
      const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.99);

      await inspector.trackSchemaFromEvent("test_event", {
        required_prop: "test"
      });

      // Validated events should ALWAYS be sent (not dropped by sampling)
      // callInspectorImmediately does not check sampling
      expect(callInspectorApiSpy).toHaveBeenCalledTimes(1);

      randomSpy.mockRestore();
    });
  });

  describe("Avo Functions validation", () => {
    beforeEach(() => {
      (EventSpecCache as jest.Mock).mockImplementation(() => ({
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));
    });

    test("should validate events from Avo Functions (_avoFunctionTrackSchemaFromEvent)", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      ).mockImplementation((...args: any[]) => { args[1](null); });

      // Use the Avo Function tracking method (internal API)
      await (inspector as any)._avoFunctionTrackSchemaFromEvent(
        "test_event",
        { required_prop: "test", optional_prop: 150 },  // Above max
        "event_id_123",
        "event_hash_456"
      );

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];
      
      // Should have validation errors
      expect(eventBody.validationErrors).toBeDefined();
      expect(eventBody.validationErrors.some((e: any) => e.code === "ValueAboveMax")).toBe(true);
      
      // Should also have Avo Function metadata
      expect(eventBody.avoFunction).toBe(true);
      expect(eventBody.eventId).toBe("event_id_123");
      expect(eventBody.eventHash).toBe("event_hash_456");
    });

    test("should send Avo Function events immediately when validation is available", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      ).mockImplementation((...args: any[]) => { args[1](null); });

      batcherHandleTrackSchemaSpy = jest.spyOn(
        inspector.avoBatcher,
        "handleTrackSchema"
      );

      await (inspector as any)._avoFunctionTrackSchemaFromEvent(
        "test_event",
        { required_prop: "valid_value", optional_prop: 50 },
        "event_id_123",
        "event_hash_456"
      );

      // Should send immediately, not batch
      expect(callInspectorImmediatelySpy).toHaveBeenCalledTimes(1);
      expect(batcherHandleTrackSchemaSpy).not.toHaveBeenCalled();
    });
  });
});

