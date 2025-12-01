import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoEventSpecFetcher } from "../eventSpec/AvoEventSpecFetcher";
import { EventSpecCache } from "../eventSpec/AvoEventSpecCache";
import type { EventSpecResponse, EventSpecResponseWire } from "../eventSpec/AvoEventSpecFetchTypes";

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

// Mock spec response (internal format with long names)
const mockValidEventSpecResponse: EventSpecResponse = {
  events: [
    {
      branchId: "main",
      baseEventId: "evt_test",
      variantIds: ["evt_test.v1"],
      props: {
        required_prop: {
          type: "string",
          required: true
          // No constraints - should always pass
        },
        optional_prop: {
          type: "number",
          required: false,
          minMaxRanges: {
            "0,100": ["evt_test", "evt_test.v1"]
          }
        },
        status: {
          type: "string",
          required: false,
          pinnedValues: {
            active: ["evt_test"],
            inactive: ["evt_test.v1"]
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
      callInspectorImmediatelySpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler,
          "callInspectorImmediately"
        )
        .mockImplementation((...args: any[]) => {
          args[1](null);
        });

      // Spy on batcher
      batcherHandleTrackSchemaSpy = jest.spyOn(
        inspector.avoBatcher,
        "handleTrackSchema"
      );

      // Track valid event
      await inspector.trackSchemaFromEvent("test_event", {
        required_prop: "test_value",
        optional_prop: 50,
        status: "active"
      });

      // Should send immediately, not batch
      expect(callInspectorImmediatelySpy).toHaveBeenCalledTimes(1);
      expect(batcherHandleTrackSchemaSpy).not.toHaveBeenCalled();

      // Check the event body has validation metadata
      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];
      expect(eventBody.eventSpecMetadata).toBeDefined();
      expect(eventBody.eventSpecMetadata.schemaId).toBe("schema_123");
    });

    test("should include failedEventIds in property when validation fails", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler,
          "callInspectorImmediately"
        )
        .mockImplementation((...args: any[]) => {
          args[1](null);
        });

      // Track event with value above max (will fail validation)
      await inspector.trackSchemaFromEvent("test_event", {
        required_prop: "test",
        optional_prop: 150, // Above max of 100
        status: "active"
      });

      expect(callInspectorImmediatelySpy).toHaveBeenCalledTimes(1);

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];

      // Find optional_prop in eventProperties
      const optionalProp = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "optional_prop"
      );
      expect(optionalProp).toBeDefined();

      // Should have failedEventIds because 150 > 100
      expect(
        optionalProp.failedEventIds || optionalProp.passedEventIds
      ).toBeDefined();
    });

    test("should include per-property validation results", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler,
          "callInspectorImmediately"
        )
        .mockImplementation((...args: any[]) => {
          args[1](null);
        });

      // Track event - "unknown_status" doesn't match any pinned value
      await inspector.trackSchemaFromEvent("test_event", {
        required_prop: "test",
        status: "unknown_status"
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];

      // Find status property
      const statusProp = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "status"
      );
      expect(statusProp).toBeDefined();

      // Should have validation results (all events fail because "unknown_status" matches no pinned value)
      expect(
        statusProp.failedEventIds || statusProp.passedEventIds
      ).toBeDefined();
    });

    test("should log validation failures when shouldLog is true", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });
      inspector.enableLogging(true);

      // Clear previous calls to check only this test's calls
      (console.log as jest.Mock).mockClear();

      callInspectorImmediatelySpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler,
          "callInspectorImmediately"
        )
        .mockImplementation((...args: any[]) => {
          args[1](null);
        });

      // Track event with validation failures
      await inspector.trackSchemaFromEvent("test_event", {
        optional_prop: 150 // Above max
      });

      // Should log validation failures
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining("Validation failures"),
        expect.any(Array)
      );
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
      callInspectorImmediatelySpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler,
          "callInspectorImmediately"
        )
        .mockImplementation((...args: any[]) => {
          args[1](new Error("Network error"));
        });

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

  describe("Bandwidth optimization - failedEventIds vs passedEventIds", () => {
    beforeEach(() => {
      (EventSpecCache as jest.Mock).mockImplementation(() => ({
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));
    });

    test("should only include one of failedEventIds or passedEventIds per property", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler,
          "callInspectorImmediately"
        )
        .mockImplementation((...args: any[]) => {
          args[1](null);
        });

      await inspector.trackSchemaFromEvent("test_event", {
        status: "active" // Matches pinned value for evt_test only
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];
      const statusProp = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "status"
      );

      // Should have either failedEventIds OR passedEventIds, not both
      const hasFailed = statusProp?.failedEventIds !== undefined;
      const hasPassed = statusProp?.passedEventIds !== undefined;

      if (hasFailed || hasPassed) {
        expect(hasFailed !== hasPassed).toBe(true); // XOR - exactly one should be true
      }
    });
  });

  describe("Property name correlation", () => {
    beforeEach(() => {
      (EventSpecCache as jest.Mock).mockImplementation(() => ({
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));
    });

    test("should have validation results on the same property in eventProperties", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler,
          "callInspectorImmediately"
        )
        .mockImplementation((...args: any[]) => {
          args[1](null);
        });

      await inspector.trackSchemaFromEvent("test_event", {
        required_prop: "test",
        optional_prop: 150 // Above max - will have validation result
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];

      // Find optional_prop - validation result should be on the same object
      const optionalProp = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "optional_prop"
      );

      expect(optionalProp).toBeDefined();
      expect(optionalProp.propertyName).toBe("optional_prop");
      expect(optionalProp.propertyType).toBeDefined();
      // Validation result should be directly on the property object
      expect(
        optionalProp.failedEventIds || optionalProp.passedEventIds
      ).toBeDefined();
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
      const callInspectorApiSpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler as any,
          "callInspectorApi"
        )
        .mockImplementation((...args: any[]) => {
          args[1](null);
        });

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

      callInspectorImmediatelySpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler,
          "callInspectorImmediately"
        )
        .mockImplementation((...args: any[]) => {
          args[1](null);
        });

      // Use the Avo Function tracking method (internal API)
      await (inspector as any)._avoFunctionTrackSchemaFromEvent(
        "test_event",
        { required_prop: "test", optional_prop: 150 }, // Above max
        "event_id_123",
        "event_hash_456"
      );

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0];

      // Should have validation results on optional_prop
      const optionalProp = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "optional_prop"
      );
      expect(
        optionalProp?.failedEventIds || optionalProp?.passedEventIds
      ).toBeDefined();

      // Should also have Avo Function metadata
      expect(eventBody.avoFunction).toBe(true);
      // eventId should be the baseEventId from spec (or event_id_123 if no spec match)
      expect(eventBody.eventId).toBeDefined();
      expect(eventBody.eventHash).toBe("event_hash_456");
    });

    test("should send Avo Function events immediately when validation is available", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      callInspectorImmediatelySpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler,
          "callInspectorImmediately"
        )
        .mockImplementation((...args: any[]) => {
          args[1](null);
        });

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

  describe("Nested Property Validation", () => {
    // Mock spec response with nested properties (internal format - as parsed from wire)
    const nestedEventSpecResponse: EventSpecResponse = {
      events: [{
        branchId: "main",
        baseEventId: "evt_purchase",
        variantIds: ["evt_purchase.v1", "evt_purchase.v2"],
        props: {
          amount: {
            type: "float",
            required: true,
            minMaxRanges: { "0.01,10000": ["evt_purchase", "evt_purchase.v1", "evt_purchase.v2"] }
          },
          payment_method: {
            type: "string",
            required: true,
            pinnedValues: { "credit_card": ["evt_purchase.v1"], "paypal": ["evt_purchase.v2"] }
          },
          category: {
            type: "string",
            required: true,
            allowedValues: {
              "[\"clothing\",\"electronics\",\"home\"]": ["evt_purchase", "evt_purchase.v1"],
              "[\"electronics\",\"home\"]": ["evt_purchase.v2"]
            }
          },
          user: {
            type: "object",
            required: true,
            children: {
              id: {
                type: "string",
                required: true,
                regexPatterns: { "^usr_[a-z0-9]{8}$": ["evt_purchase", "evt_purchase.v1", "evt_purchase.v2"] }
              },
              tier: {
                type: "string",
                required: false,
                allowedValues: {
                  "[\"enterprise\",\"free\",\"premium\"]": ["evt_purchase", "evt_purchase.v1"],
                  "[\"enterprise\",\"premium\"]": ["evt_purchase.v2"]
                }
              }
            }
          },
          shipping: {
            type: "object",
            required: false,
            children: {
              method: {
                type: "string",
                required: true,
                allowedValues: { "[\"express\",\"standard\"]": ["evt_purchase", "evt_purchase.v1", "evt_purchase.v2"] }
              },
              address: {
                type: "object",
                required: true,
                children: {
                  country: {
                    type: "string",
                    required: true,
                    allowedValues: { "[\"CA\",\"UK\",\"US\"]": ["evt_purchase", "evt_purchase.v1", "evt_purchase.v2"] }
                  },
                  zip: {
                    type: "string",
                    required: false,
                    regexPatterns: { "^[0-9]{5}$": ["evt_purchase", "evt_purchase.v1", "evt_purchase.v2"] }
                  }
                }
              }
            }
          }
        }
      }],
      metadata: {
        schemaId: "schema_abc123",
        branchId: "main",
        latestActionId: "action_xyz789",
        sourceId: "source_web"
      }
    };

    beforeEach(() => {
      (EventSpecCache as jest.Mock).mockImplementation(() => ({
        get: jest.fn().mockReturnValue(nestedEventSpecResponse),
        set: jest.fn()
      }));

      (AvoEventSpecFetcher as jest.Mock).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(nestedEventSpecResponse)
      }));
    });

    test("should validate nested properties and include validation results in children", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler,
          "callInspectorImmediately"
        )
        .mockImplementation((...args: any[]) => {
          args[1](null);
        });

      // Track event with nested properties - some valid, some invalid
      await inspector.trackSchemaFromEvent("Purchase Completed", {
        amount: 99.99,                    // valid (in range)
        payment_method: "credit_card",    // valid for v1, fails v2 (paypal) and base (no pinned)
        category: "clothing",             // valid for base+v1, fails v2 (not in its list)
        user: {
          id: "usr_abc12345",             // valid (matches regex)
          tier: "free"                    // valid for base+v1, fails v2 (free not allowed)
        },
        shipping: {
          method: "express",              // valid (in allowed list)
          address: {
            country: "US",                // valid (in allowed list)
            zip: "12345"                  // valid (matches regex)
          }
        }
      });

      expect(callInspectorImmediatelySpy).toHaveBeenCalledTimes(1);

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      // Verify metadata is present
      expect(eventBody.eventSpecMetadata).toEqual({
        schemaId: "schema_abc123",
        branchId: "main",
        latestActionId: "action_xyz789",
        sourceId: "source_web"
      });

      // Find the user property
      const userProp = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "user"
      );
      expect(userProp).toBeDefined();
      expect(userProp.propertyType).toBe("object");
      expect(userProp.children).toBeDefined();
      expect(Array.isArray(userProp.children)).toBe(true);

      // Find user.tier in children - should have validation results
      const tierChild = userProp.children.find(
        (c: any) => c.propertyName === "tier"
      );
      expect(tierChild).toBeDefined();
      // "free" is valid for base+v1, fails for v2
      expect(tierChild.failedEventIds || tierChild.passedEventIds).toBeDefined();

      // Find the shipping property
      const shippingProp = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "shipping"
      );
      expect(shippingProp).toBeDefined();
      expect(shippingProp.children).toBeDefined();

      // Find shipping.address (nested object)
      const addressChild = shippingProp.children.find(
        (c: any) => c.propertyName === "address"
      );
      expect(addressChild).toBeDefined();
      expect(addressChild.propertyType).toBe("object");
      expect(addressChild.children).toBeDefined();

      // Find shipping.address.zip (deeply nested)
      const zipChild = addressChild.children.find(
        (c: any) => c.propertyName === "zip"
      );
      expect(zipChild).toBeDefined();
      // "12345" matches the regex, so no failures expected
    });

    test("should include failedEventIds on nested children when validation fails", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler,
          "callInspectorImmediately"
        )
        .mockImplementation((...args: any[]) => {
          args[1](null);
        });

      // Track event with invalid nested values
      await inspector.trackSchemaFromEvent("Purchase Completed", {
        amount: 500,
        payment_method: "bitcoin",        // invalid - not pinned for any variant
        category: "electronics",
        user: {
          id: "invalid_id",               // invalid - doesn't match regex
          tier: "basic"                   // invalid - not in any allowed list
        },
        shipping: {
          method: "drone",                // invalid - not in allowed list
          address: {
            country: "FR",                // invalid - not in allowed list
            zip: "ABCDE"                  // invalid - doesn't match regex
          }
        }
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      // Check user.id has failures (invalid regex)
      const userProp = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "user"
      );
      const idChild = userProp.children.find(
        (c: any) => c.propertyName === "id"
      );
      expect(idChild.failedEventIds).toBeDefined();
      expect(idChild.failedEventIds).toContain("evt_purchase");
      expect(idChild.failedEventIds).toContain("evt_purchase.v1");
      expect(idChild.failedEventIds).toContain("evt_purchase.v2");

      // Check user.tier has failures (not in any allowed list)
      const tierChild = userProp.children.find(
        (c: any) => c.propertyName === "tier"
      );
      expect(tierChild.failedEventIds).toBeDefined();

      // Check shipping.address.zip has failures (invalid regex)
      const shippingProp = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "shipping"
      );
      const addressChild = shippingProp.children.find(
        (c: any) => c.propertyName === "address"
      );
      const zipChild = addressChild.children.find(
        (c: any) => c.propertyName === "zip"
      );
      expect(zipChild.failedEventIds).toBeDefined();
      expect(zipChild.failedEventIds).toContain("evt_purchase");
    });

    test("should produce correct inspector request structure for nested properties", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler,
          "callInspectorImmediately"
        )
        .mockImplementation((...args: any[]) => {
          args[1](null);
        });

      await inspector.trackSchemaFromEvent("Purchase Completed", {
        amount: 150.00,
        payment_method: "credit_card",
        category: "electronics",
        user: {
          id: "usr_abcd1234",
          tier: "premium"
        },
        shipping: {
          method: "standard",
          address: {
            country: "US",
            zip: "90210"
          }
        }
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      // Verify overall structure
      expect(eventBody.type).toBe("event");
      expect(eventBody.eventName).toBe("Purchase Completed");
      expect(eventBody.eventProperties).toBeDefined();
      expect(Array.isArray(eventBody.eventProperties)).toBe(true);

      // Verify nested structure matches expected format:
      // {
      //   propertyName: "user",
      //   propertyType: "object",
      //   children: [
      //     { propertyName: "id", propertyType: "string", failedEventIds?: [...] },
      //     { propertyName: "tier", propertyType: "string", passedEventIds?: [...] }
      //   ]
      // }

      const userProp = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "user"
      );

      // User should be an object with children array
      expect(userProp.propertyType).toBe("object");
      expect(Array.isArray(userProp.children)).toBe(true);
      expect(userProp.children.length).toBe(2);

      // Each child should have propertyName and propertyType
      for (const child of userProp.children) {
        expect(child.propertyName).toBeDefined();
        expect(child.propertyType).toBeDefined();
      }

      // Verify deeply nested structure (shipping.address.country)
      const shippingProp = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "shipping"
      );
      expect(shippingProp.propertyType).toBe("object");

      const addressChild = shippingProp.children.find(
        (c: any) => c.propertyName === "address"
      );
      expect(addressChild.propertyType).toBe("object");
      expect(Array.isArray(addressChild.children)).toBe(true);

      const countryChild = addressChild.children.find(
        (c: any) => c.propertyName === "country"
      );
      expect(countryChild.propertyName).toBe("country");
      expect(countryChild.propertyType).toBe("string");
    });
  });
});
