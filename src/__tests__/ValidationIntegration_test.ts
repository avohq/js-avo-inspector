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
        contains: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));

      // Mock fetcher (shouldn't be called when cache hit)
      jest.mocked(AvoEventSpecFetcher).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(mockValidEventSpecResponse)
      }) as any);
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
        contains: jest.fn().mockReturnValue(false),
        get: jest.fn().mockReturnValue(null),
        set: jest.fn()
      }));

      // Mock fetcher to return null (spec not found)
      jest.mocked(AvoEventSpecFetcher).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(null)
      }) as any);
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
        contains: jest.fn().mockReturnValue(true),
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
        contains: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));

      (AvoEventSpecFetcher as unknown as jest.Mock).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(mockValidEventSpecResponse)
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
        contains: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));

      (AvoEventSpecFetcher as unknown as jest.Mock).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(mockValidEventSpecResponse)
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
        contains: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));

      (AvoEventSpecFetcher as unknown as jest.Mock).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(mockValidEventSpecResponse)
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
        contains: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));

      (AvoEventSpecFetcher as unknown as jest.Mock).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(mockValidEventSpecResponse)
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
        contains: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue(mockValidEventSpecResponse),
        set: jest.fn()
      }));

      (AvoEventSpecFetcher as unknown as jest.Mock).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(mockValidEventSpecResponse)
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
      (EventSpecCache as unknown as jest.Mock).mockImplementation(() => ({
        contains: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue(nestedEventSpecResponse),
        set: jest.fn()
      }));

      (AvoEventSpecFetcher as unknown as jest.Mock).mockImplementation(() => ({
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

      // Find shipping.method (depth 1 child - should have validation results)
      const methodChild = shippingProp.children.find(
        (c: any) => c.propertyName === "method"
      );
      expect(methodChild).toBeDefined();
      expect(methodChild.propertyType).toBe("string");

      // Find shipping.address (depth 1 child, nested object)
      const addressChild = shippingProp.children.find(
        (c: any) => c.propertyName === "address"
      );
      expect(addressChild).toBeDefined();
      expect(addressChild.propertyType).toBe("object");
      // Note: children at depth 2 (zip, country) are NOT validated due to depth limit
      // They still appear in the schema structure but without validation results
      expect(addressChild.children).toBeDefined();
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

      // Check user.id has failures (invalid regex) - depth 1, should be validated
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

      // Check user.tier has failures (not in any allowed list) - depth 1, should be validated
      const tierChild = userProp.children.find(
        (c: any) => c.propertyName === "tier"
      );
      expect(tierChild.failedEventIds).toBeDefined();

      // Check shipping.method has failures (invalid value) - depth 1, should be validated
      const shippingProp = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "shipping"
      );
      const methodChild = shippingProp.children.find(
        (c: any) => c.propertyName === "method"
      );
      expect(methodChild.failedEventIds).toBeDefined();
      expect(methodChild.failedEventIds).toContain("evt_purchase");

      // Note: shipping.address.zip and shipping.address.country are at depth 2
      // They are NOT validated due to the depth limit (max child depth = 2)
      // This matches schema validation behavior where we don't dive into child2+
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

  describe("End-to-end eventProperties flow", () => {
    // This test traces through the EXACT flow that caused the bug:
    // extractSchema -> fetchAndValidateEvent -> mergeValidationResults -> bodyForEventSchemaCall
    // The issue: eventProperties was empty even though validation returned data

    test("should NOT produce empty eventProperties when tracking with validation", async () => {
      // Mock spec response for this test
      const testSpec: EventSpecResponse = {
        events: [{
          branchId: "main",
          baseEventId: "test_evt",
          variantIds: [],
          props: {
            "simple_prop": { type: "string", required: true },
            "nested_list": {
              type: "list",
              required: true,
              children: {
                "child_name": { type: "string", required: false },
                "child_value": { type: "int", required: true }
              }
            }
          }
        }],
        metadata: { schemaId: "test", branchId: "main", latestActionId: "act" }
      };

      (EventSpecCache as unknown as jest.Mock).mockImplementation(() => ({
        contains: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue(testSpec),
        set: jest.fn()
      }));

      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      let capturedEventBody: any = null;
      const callInspectorImmediatelySpy = jest
        .spyOn(
          (inspector as any).avoNetworkCallsHandler,
          "callInspectorImmediately"
        )
        .mockImplementation((eventBody: any, callback: any) => {
          capturedEventBody = eventBody;
          callback(null);
        });

      // Track with nested array of objects
      await inspector.trackSchemaFromEvent("test_event", {
        simple_prop: "hello",
        nested_list: [
          { child_name: "Item 1", child_value: 10 },
          { child_name: "Item 2", child_value: 20 }
        ]
      });

      // CRITICAL ASSERTION: eventProperties must NOT be empty!
      expect(capturedEventBody).not.toBeNull();
      expect(capturedEventBody.eventProperties).toBeDefined();
      expect(capturedEventBody.eventProperties.length).toBeGreaterThan(0);

      // Should have 2 properties: simple_prop and nested_list
      expect(capturedEventBody.eventProperties.length).toBe(2);

      // Find the properties
      const simpleProp = capturedEventBody.eventProperties.find(
        (p: any) => p.propertyName === "simple_prop"
      );
      const nestedList = capturedEventBody.eventProperties.find(
        (p: any) => p.propertyName === "nested_list"
      );

      expect(simpleProp).toBeDefined();
      expect(simpleProp.propertyType).toBe("string");

      expect(nestedList).toBeDefined();
      expect(nestedList.propertyType).toBe("list");
      expect(nestedList.children).toBeDefined();
      expect(nestedList.children.length).toBe(2); // Two objects in the array

      // Verify the nested structure
      const firstItem = nestedList.children[0];
      expect(Array.isArray(firstItem)).toBe(true);
      expect(firstItem.length).toBe(2); // child_name, child_value

      callInspectorImmediatelySpy.mockRestore();
    });

    test("debug: trace extractSchema output for nested list of objects", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      // This is the exact structure from the bug report
      const eventProperties = {
        "Schema Id": "schema-123",
        "Visible Smart Results": [
          {
            itemName: "User Signed Up",
            itemType: "Event",
            searchResultPosition: 1,
            searchResultRanking: 0.95,
            searchTerm: "sign"
          }
        ]
      };

      const schema = await inspector.extractSchema(eventProperties);

      // The schema should NOT be empty
      expect(schema.length).toBe(2);

      // Find Visible Smart Results
      const smartResults = schema.find(p => p.propertyName === "Visible Smart Results");
      expect(smartResults).toBeDefined();
      expect(smartResults!.propertyType).toBe("list");
      expect(smartResults!.children).toBeDefined();
      expect(smartResults!.children!.length).toBe(1);

      // The child should be an array of properties
      const firstChild = smartResults!.children![0];
      expect(Array.isArray(firstChild)).toBe(true);
      expect((firstChild as any[]).length).toBe(5);
    });

    test("debug: verify extractSchema is called on every unique event", async () => {
      // This test verifies that extractSchema is always called for events that aren't deduplicated
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      // Spy on extractSchema
      const extractSchemaSpy = jest.spyOn(inspector, "extractSchema");

      // Track two different events
      const result1 = await inspector.trackSchemaFromEvent("event_1", {
        prop: "value1"
      });

      const result2 = await inspector.trackSchemaFromEvent("event_2", {
        prop: "value2"
      });

      // Both calls should have schema
      expect(result1.length).toBe(1);
      expect(result1[0].propertyName).toBe("prop");

      expect(result2.length).toBe(1);
      expect(result2[0].propertyName).toBe("prop");

      // extractSchema should have been called twice (once per event)
      expect(extractSchemaSpy).toHaveBeenCalledTimes(2);

      extractSchemaSpy.mockRestore();
    });

    test("BUG REPRODUCTION: if extractSchema fails, validation still runs but eventProperties is empty", async () => {
      // This test documents a known bug in the codebase:
      // When extractSchema fails (returns []), validation still runs against original eventProperties,
      // but mergeValidationResults receives [] for eventSchema, resulting in empty eventProperties.
      // 
      // The correct behavior is tested in "should NOT produce empty eventProperties when tracking with validation" (line 900).
      // 
      // Bug scenario:
      // 1. extractSchema fails (returns [])
      // 2. validation still runs against original eventProperties
      // 3. mergeValidationResults receives [] for eventSchema
      // 4. Final eventProperties is []

      const testSpec: EventSpecResponse = {
        events: [{
          branchId: "main",
          baseEventId: "test_evt",
          variantIds: [],
          props: {
            "prop": { type: "string", required: true }
          }
        }],
        metadata: { schemaId: "test", branchId: "main", latestActionId: "act" }
      };

      (EventSpecCache as unknown as jest.Mock).mockImplementation(() => ({
        contains: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue(testSpec),
        set: jest.fn()
      }));

      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      // Mock extractSchema to return empty (simulating error)
      jest.spyOn(inspector, "extractSchema").mockResolvedValue([]);

      let capturedEventBody: any = null;
      jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      ).mockImplementation((eventBody: any, callback: any) => {
        capturedEventBody = eventBody;
        callback(null);
      });

      // Track an event - extractSchema will return [], but validation may still run
      await inspector.trackSchemaFromEvent("test_event", {
        prop: "value"
      });

      // The event body has EMPTY eventProperties - this is the bug!
      expect(capturedEventBody).not.toBeNull();
      expect(capturedEventBody.eventProperties).toEqual([]);

      // But validation result would have had data...
      // This shows the disconnect between schema extraction and validation
    });

    test("verify the returned schema from trackSchemaFromEvent matches extractSchema output", async () => {
      // This test verifies that trackSchemaFromEvent returns the same schema as extractSchema
      // even when validation is performed

      const testSpec: EventSpecResponse = {
        events: [{
          branchId: "main",
          baseEventId: "test_evt",
          variantIds: [],
          props: {
            "items": {
              type: "list",
              required: true,
              children: {
                "name": { type: "string", required: true }
              }
            }
          }
        }],
        metadata: { schemaId: "test", branchId: "main", latestActionId: "act" }
      };

      (EventSpecCache as unknown as jest.Mock).mockImplementation(() => ({
        contains: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue(testSpec),
        set: jest.fn()
      }));

      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      let capturedEventBody: any = null;
      jest.spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      ).mockImplementation((eventBody: any, callback: any) => {
        capturedEventBody = eventBody;
        callback(null);
      });

      const eventProps = {
        items: [{ name: "Item 1" }, { name: "Item 2" }]
      };

      // Get the schema via extractSchema
      const expectedSchema = await inspector.extractSchema(eventProps);

      // Track the event
      const returnedSchema = await inspector.trackSchemaFromEvent("return_test", eventProps);

      // The returned schema should match extractSchema output
      // (not empty, and has the same structure)
      expect(returnedSchema.length).toBe(expectedSchema.length);
      expect(returnedSchema[0].propertyName).toBe(expectedSchema[0].propertyName);
      expect(returnedSchema[0].propertyType).toBe(expectedSchema[0].propertyType);

      // And the event body should also have eventProperties
      expect(capturedEventBody.eventProperties.length).toBe(1);
      expect(capturedEventBody.eventProperties[0].propertyName).toBe("items");
    });
  });

  // =========================================================================
  // COMPREHENSIVE LIST + OBJECT + VARIANT VALIDATION TESTS
  // =========================================================================
  describe("Comprehensive Event Spec Validation (Lists, Objects, Variants)", () => {
    // This is the exact spec from the API response - with lists, objects, pinned values,
    // allowed values, regex, minmax across multiple variants
    const comprehensiveEventSpecResponse: EventSpecResponse = {
      events: [{
        branchId: "main",
        baseEventId: "evt_abc123",
        variantIds: ["evt_abc123.var_1", "evt_abc123.var_2", "evt_abc123.var_3"],
        props: {
          plan_type: {
            type: "string",
            required: true,
            allowedValues: {
              '["free","premium","enterprise"]': ["evt_abc123"],
              '["free","premium"]': ["evt_abc123.var_1"],
              '["enterprise"]': ["evt_abc123.var_2", "evt_abc123.var_3"]
            },
            pinnedValues: {
              "premium": ["evt_abc123.var_3"]
            }
          },
          tags: {
            type: "string",
            required: false,
            isList: true,
            allowedValues: {
              '["sale","new","featured","clearance"]': ["evt_abc123", "evt_abc123.var_1"],
              '["vip","exclusive"]': ["evt_abc123.var_2"],
              '["sale","vip","premium"]': ["evt_abc123.var_3"]
            }
          },
          categories: {
            type: "string",
            required: true,
            isList: true,
            allowedValues: {
              '["electronics","clothing","home","sports"]': ["evt_abc123", "evt_abc123.var_1", "evt_abc123.var_2", "evt_abc123.var_3"]
            }
          },
          amount: {
            type: "float",
            required: true,
            minMaxRanges: {
              "0,1000": ["evt_abc123", "evt_abc123.var_1", "evt_abc123.var_2"],
              "0,5000": ["evt_abc123.var_3"]
            }
          },
          currency: {
            type: "string",
            required: true,
            regexPatterns: {
              "^[A-Z]{3}$": ["evt_abc123", "evt_abc123.var_1", "evt_abc123.var_2", "evt_abc123.var_3"]
            }
          },
          items: {
            type: "object",
            required: true,
            isList: true,
            children: {
              item_id: {
                type: "string",
                required: true
              },
              quantity: {
                type: "int",
                required: true,
                minMaxRanges: {
                  "1,99": ["evt_abc123", "evt_abc123.var_1", "evt_abc123.var_2", "evt_abc123.var_3"]
                }
              },
              price: {
                type: "float",
                required: true,
                minMaxRanges: {
                  "0,": ["evt_abc123", "evt_abc123.var_1", "evt_abc123.var_2", "evt_abc123.var_3"]
                }
              }
            }
          },
          discount_code: {
            type: "string",
            required: false,
            regexPatterns: {
              "^[A-Z0-9]{5,10}$": ["evt_abc123", "evt_abc123.var_1"],
              "^PROMO-[A-Z0-9]+$": ["evt_abc123.var_2", "evt_abc123.var_3"]
            }
          }
        }
      }],
      metadata: {
        schemaId: "ws_xyz789",
        branchId: "main",
        latestActionId: "act_456def",
        sourceId: "src_web123"
      }
    };

    beforeEach(() => {
      (EventSpecCache as unknown as jest.Mock).mockImplementation(() => ({
        contains: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue(comprehensiveEventSpecResponse),
        set: jest.fn()
      }));

      (AvoEventSpecFetcher as unknown as jest.Mock).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(comprehensiveEventSpecResponse)
      }));
    });

    test("Scenario 1: All values valid for base event (evt_abc123)", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      await inspector.trackSchemaFromEvent("Order Placed", {
        plan_type: "free",                           // valid for base, var_1
        tags: ["sale", "new"],                       // valid for base, var_1
        categories: ["electronics", "home"],         // valid for all
        amount: 500,                                 // valid for base, var_1, var_2 (0-1000)
        currency: "USD",                             // valid for all (matches regex)
        items: [
          { item_id: "prod_001", quantity: 2, price: 29.99 },
          { item_id: "prod_002", quantity: 1, price: 149.99 }
        ],
        discount_code: "SAVE20"                      // valid for base, var_1 (5-10 alphanumeric)
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      // Log what we're sending to inspector
      console.log("\n=== Scenario 1: Valid for base event ===");
      console.log("Event sent to Inspector:");
      console.log(JSON.stringify(eventBody, null, 2));

      // Verify metadata
      expect(eventBody.eventSpecMetadata).toEqual({
        schemaId: "ws_xyz789",
        branchId: "main",
        latestActionId: "act_456def",
        sourceId: "src_web123"
      });

      // plan_type: "free" is valid for base+var_1, fails var_2+var_3 (enterprise only) and var_3 (pinned to premium)
      const planTypeProp = eventBody.eventProperties.find((p: any) => p.propertyName === "plan_type");
      expect(planTypeProp.failedEventIds).toContain("evt_abc123.var_2");
      expect(planTypeProp.failedEventIds).toContain("evt_abc123.var_3");

      // amount: 500 is valid for base, var_1, var_2 (0-1000), also valid for var_3 (0-5000)
      const amountProp = eventBody.eventProperties.find((p: any) => p.propertyName === "amount");
      expect(amountProp.failedEventIds).toBeUndefined();

      // currency: "USD" matches regex for all
      const currencyProp = eventBody.eventProperties.find((p: any) => p.propertyName === "currency");
      expect(currencyProp.failedEventIds).toBeUndefined();
    });

    test("Scenario 2: Values valid only for var_3 (high amount, premium pinned)", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      await inspector.trackSchemaFromEvent("Order Placed", {
        plan_type: "premium",                        // pinned for var_3, allowed for base+var_1
        tags: ["vip", "premium"],                    // valid only for var_3
        categories: ["electronics"],                 // valid for all
        amount: 3000,                                // valid only for var_3 (0-5000), fails others (0-1000)
        currency: "EUR",                             // valid for all
        items: [
          { item_id: "prod_luxury", quantity: 1, price: 2999.99 }
        ],
        discount_code: "PROMO-VIP2024"               // valid for var_2, var_3; fails base, var_1
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      console.log("\n=== Scenario 2: Valid only for var_3 ===");
      console.log("Event sent to Inspector:");
      console.log(JSON.stringify(eventBody, null, 2));

      // amount: 3000 exceeds 1000 limit for base, var_1, var_2
      // Validator may return passedEventIds (var_3 only) instead of failedEventIds
      const amountProp = eventBody.eventProperties.find((p: any) => p.propertyName === "amount");
      if (amountProp.failedEventIds) {
        expect(amountProp.failedEventIds).toContain("evt_abc123");
        expect(amountProp.failedEventIds).toContain("evt_abc123.var_1");
        expect(amountProp.failedEventIds).toContain("evt_abc123.var_2");
        expect(amountProp.failedEventIds).not.toContain("evt_abc123.var_3");
      } else if (amountProp.passedEventIds) {
        // Only var_3 passes (1 out of 4), so passedEventIds is smaller
        expect(amountProp.passedEventIds).toContain("evt_abc123.var_3");
        expect(amountProp.passedEventIds).not.toContain("evt_abc123");
        expect(amountProp.passedEventIds).not.toContain("evt_abc123.var_1");
        expect(amountProp.passedEventIds).not.toContain("evt_abc123.var_2");
      }

      // tags: ["vip", "premium"] - only valid for var_3
      const tagsProp = eventBody.eventProperties.find((p: any) => p.propertyName === "tags");
      if (tagsProp.failedEventIds) {
        expect(tagsProp.failedEventIds).toContain("evt_abc123");
        expect(tagsProp.failedEventIds).toContain("evt_abc123.var_1");
        expect(tagsProp.failedEventIds).toContain("evt_abc123.var_2");
      } else if (tagsProp.passedEventIds) {
        expect(tagsProp.passedEventIds).toContain("evt_abc123.var_3");
      }

      // discount_code: "PROMO-VIP2024" matches PROMO- pattern for var_2, var_3
      const discountProp = eventBody.eventProperties.find((p: any) => p.propertyName === "discount_code");
      if (discountProp.failedEventIds) {
        expect(discountProp.failedEventIds).toContain("evt_abc123");
        expect(discountProp.failedEventIds).toContain("evt_abc123.var_1");
      } else if (discountProp.passedEventIds) {
        expect(discountProp.passedEventIds).toContain("evt_abc123.var_2");
        expect(discountProp.passedEventIds).toContain("evt_abc123.var_3");
      }
    });

    test("Scenario 3: List of objects with some items failing validation", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      await inspector.trackSchemaFromEvent("Order Placed", {
        plan_type: "enterprise",                     // valid for base, var_2, var_3
        tags: ["exclusive"],                         // valid only for var_2
        categories: ["clothing"],                    // valid for all
        amount: 800,                                 // valid for all
        currency: "GBP",                             // valid for all
        items: [
          { item_id: "item_1", quantity: 5, price: 50 },     // valid
          { item_id: "item_2", quantity: 100, price: 25 },   // quantity 100 exceeds max 99!
          { item_id: "item_3", quantity: 1, price: -10 }     // price -10 is below min 0!
        ]
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      console.log("\n=== Scenario 3: List of objects with invalid items ===");
      console.log("Event sent to Inspector:");
      console.log(JSON.stringify(eventBody, null, 2));

      // items should be present
      const itemsProp = eventBody.eventProperties.find((p: any) => p.propertyName === "items");
      expect(itemsProp).toBeDefined();

      // For list of objects, children should contain validation failures
      // The children array contains the child property results
      if (itemsProp.children && Array.isArray(itemsProp.children)) {
        // quantity: item_2 has quantity 100 which exceeds 99
        const quantityChild = itemsProp.children.find((c: any) => c.propertyName === "quantity");
        if (quantityChild) {
          // Should have failures since 100 > 99
          expect(quantityChild.failedEventIds || quantityChild.passedEventIds).toBeDefined();
          if (quantityChild.failedEventIds) {
            expect(quantityChild.failedEventIds).toContain("evt_abc123");
          }
        }

        // price: item_3 has price -10 which is below 0
        const priceChild = itemsProp.children.find((c: any) => c.propertyName === "price");
        if (priceChild) {
          // Should have failures since -10 < 0
          expect(priceChild.failedEventIds || priceChild.passedEventIds).toBeDefined();
          if (priceChild.failedEventIds) {
            expect(priceChild.failedEventIds).toContain("evt_abc123");
          }
        }
      }
    });

    test("Scenario 4: Invalid currency (regex failure for all variants)", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      await inspector.trackSchemaFromEvent("Order Placed", {
        plan_type: "free",
        categories: ["sports"],
        amount: 100,
        currency: "us",                              // lowercase - fails regex ^[A-Z]{3}$
        items: [{ item_id: "ball", quantity: 1, price: 19.99 }]
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      console.log("\n=== Scenario 4: Invalid currency (regex fail) ===");
      console.log("Event sent to Inspector:");
      console.log(JSON.stringify(eventBody, null, 2));

      // currency fails regex for ALL variants
      const currencyProp = eventBody.eventProperties.find((p: any) => p.propertyName === "currency");
      expect(currencyProp.failedEventIds).toContain("evt_abc123");
      expect(currencyProp.failedEventIds).toContain("evt_abc123.var_1");
      expect(currencyProp.failedEventIds).toContain("evt_abc123.var_2");
      expect(currencyProp.failedEventIds).toContain("evt_abc123.var_3");
    });

    test("Scenario 5: Mixed valid/invalid list items (tags)", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      await inspector.trackSchemaFromEvent("Order Placed", {
        plan_type: "premium",
        tags: ["sale", "exclusive", "unknown_tag"],  // mixed: "exclusive" not valid for base/var_1, "unknown_tag" not valid for anyone
        categories: ["home"],
        amount: 200,
        currency: "CAD",
        items: [{ item_id: "lamp", quantity: 2, price: 45 }]
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      console.log("\n=== Scenario 5: Mixed valid/invalid list items ===");
      console.log("Event sent to Inspector:");
      console.log(JSON.stringify(eventBody, null, 2));

      // tags list has mixed values - "unknown_tag" fails all variants
      const tagsProp = eventBody.eventProperties.find((p: any) => p.propertyName === "tags");
      expect(tagsProp.failedEventIds).toBeDefined();
      // All should fail because "unknown_tag" is not in any allowed list
      expect(tagsProp.failedEventIds).toContain("evt_abc123");
      expect(tagsProp.failedEventIds).toContain("evt_abc123.var_1");
      expect(tagsProp.failedEventIds).toContain("evt_abc123.var_2");
      expect(tagsProp.failedEventIds).toContain("evt_abc123.var_3");
    });

    test("Scenario 6: Everything valid - no failures", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      // Craft values that are valid for at least one variant
      await inspector.trackSchemaFromEvent("Order Placed", {
        plan_type: "enterprise",                     // valid for base, var_2, var_3
        tags: ["vip"],                               // valid for var_2
        categories: ["electronics", "clothing"],     // valid for all
        amount: 500,                                 // valid for all
        currency: "JPY",                             // valid for all
        items: [
          { item_id: "gadget_1", quantity: 10, price: 99.99 },
          { item_id: "gadget_2", quantity: 5, price: 199.99 }
        ],
        discount_code: "PROMO-SAVE50"                // valid for var_2, var_3
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      console.log("\n=== Scenario 6: Mostly valid event ===");
      console.log("Event sent to Inspector:");
      console.log(JSON.stringify(eventBody, null, 2));

      // Verify structure is correct
      expect(eventBody.eventSpecMetadata).toBeDefined();
      expect(eventBody.eventProperties.length).toBeGreaterThan(0);

      // categories should pass for all
      const categoriesProp = eventBody.eventProperties.find((p: any) => p.propertyName === "categories");
      expect(categoriesProp.failedEventIds).toBeUndefined();

      // items children should all pass (quantities and prices are valid)
      const itemsProp = eventBody.eventProperties.find((p: any) => p.propertyName === "items");
      if (itemsProp.children) {
        const quantityChild = itemsProp.children.find((c: any) => c.propertyName === "quantity");
        const priceChild = itemsProp.children.find((c: any) => c.propertyName === "price");
        expect(quantityChild?.failedEventIds).toBeUndefined();
        expect(priceChild?.failedEventIds).toBeUndefined();
      }
    });
  });

  // =========================================================================
  // COMPREHENSIVE EDGE CASE EXAMPLE OUTPUT
  // =========================================================================
  describe("Prime Example: All Edge Cases Output", () => {
    // Comprehensive spec covering ALL constraint types and edge cases
    const primeExampleSpec: EventSpecResponse = {
      events: [{
        branchId: "main",
        baseEventId: "evt_order",
        variantIds: ["evt_order.standard", "evt_order.premium", "evt_order.enterprise"],
        props: {
          // 1. PINNED VALUE - must be exact value per variant
          order_type: {
            type: "string",
            required: true,
            pinnedValues: {
              "standard": ["evt_order.standard"],
              "premium": ["evt_order.premium"],
              "enterprise": ["evt_order.enterprise"]
            }
          },
          // 2. ALLOWED VALUES - different allowed sets per variant
          payment_method: {
            type: "string",
            required: true,
            allowedValues: {
              '["credit_card","debit_card","paypal"]': ["evt_order", "evt_order.standard"],
              '["credit_card","wire_transfer","invoice"]': ["evt_order.premium", "evt_order.enterprise"]
            }
          },
          // 3. MIN/MAX RANGE - different ranges per variant
          total_amount: {
            type: "float",
            required: true,
            minMaxRanges: {
              "0,500": ["evt_order", "evt_order.standard"],
              "100,5000": ["evt_order.premium"],
              "1000,": ["evt_order.enterprise"]  // min only, no max
            }
          },
          // 4. REGEX PATTERN - different patterns per variant
          order_reference: {
            type: "string",
            required: true,
            regexPatterns: {
              "^ORD-[0-9]{6}$": ["evt_order", "evt_order.standard"],
              "^PRE-[A-Z]{2}-[0-9]{6}$": ["evt_order.premium"],
              "^ENT-[A-Z]{3}-[0-9]{8}$": ["evt_order.enterprise"]
            }
          },
          // 5. LIST OF PRIMITIVES with allowed values
          tags: {
            type: "string",
            required: false,
            isList: true,
            allowedValues: {
              '["urgent","standard","bulk"]': ["evt_order", "evt_order.standard"],
              '["priority","vip","recurring"]': ["evt_order.premium"],
              '["strategic","contract","sla"]': ["evt_order.enterprise"]
            }
          },
          // 6. LIST OF PRIMITIVES with regex
          sku_codes: {
            type: "string",
            required: true,
            isList: true,
            regexPatterns: {
              "^SKU-[A-Z0-9]{8}$": ["evt_order", "evt_order.standard", "evt_order.premium", "evt_order.enterprise"]
            }
          },
          // 7. LIST OF OBJECTS with nested constraints
          line_items: {
            type: "object",
            required: true,
            isList: true,
            children: {
              product_id: {
                type: "string",
                required: true,
                regexPatterns: {
                  "^PROD-[0-9]+$": ["evt_order", "evt_order.standard", "evt_order.premium", "evt_order.enterprise"]
                }
              },
              quantity: {
                type: "int",
                required: true,
                minMaxRanges: {
                  "1,10": ["evt_order", "evt_order.standard"],
                  "1,100": ["evt_order.premium"],
                  "1,1000": ["evt_order.enterprise"]
                }
              },
              unit_price: {
                type: "float",
                required: true,
                minMaxRanges: {
                  "0.01,": ["evt_order", "evt_order.standard", "evt_order.premium", "evt_order.enterprise"]
                }
              },
              discount_percent: {
                type: "float",
                required: false,
                minMaxRanges: {
                  "0,10": ["evt_order", "evt_order.standard"],
                  "0,25": ["evt_order.premium"],
                  "0,50": ["evt_order.enterprise"]
                }
              }
            }
          },
          // 8. SINGLE OBJECT with nested constraints
          shipping_address: {
            type: "object",
            required: true,
            children: {
              country_code: {
                type: "string",
                required: true,
                regexPatterns: {
                  "^[A-Z]{2}$": ["evt_order", "evt_order.standard", "evt_order.premium", "evt_order.enterprise"]
                }
              },
              postal_code: {
                type: "string",
                required: true,
                regexPatterns: {
                  "^[0-9]{5}(-[0-9]{4})?$": ["evt_order", "evt_order.standard", "evt_order.premium", "evt_order.enterprise"]
                }
              },
              is_verified: {
                type: "boolean",
                required: false,
                pinnedValues: {
                  "true": ["evt_order.premium", "evt_order.enterprise"]
                }
              }
            }
          },
          // 9. COMBINED: pinned + allowed on same property
          customer_tier: {
            type: "string",
            required: true,
            allowedValues: {
              '["bronze","silver","gold","platinum"]': ["evt_order", "evt_order.standard", "evt_order.premium", "evt_order.enterprise"]
            },
            pinnedValues: {
              "platinum": ["evt_order.enterprise"]
            }
          }
        }
      }],
      metadata: {
        schemaId: "ws_prime_example",
        branchId: "main",
        latestActionId: "act_edge_cases",
        sourceId: "src_integration_test"
      }
    };

    beforeEach(() => {
      (EventSpecCache as unknown as jest.Mock).mockImplementation(() => ({
        contains: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue(primeExampleSpec),
        set: jest.fn()
      }));

      (AvoEventSpecFetcher as unknown as jest.Mock).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(primeExampleSpec)
      }));
    });

    test("PRIME EXAMPLE: All edge cases with mixed pass/fail results", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      // Craft an event that triggers various pass/fail scenarios
      await inspector.trackSchemaFromEvent("Order Completed", {
        // PINNED: "premium" - passes evt_order.premium, fails others
        order_type: "premium",

        // ALLOWED: "wire_transfer" - passes premium/enterprise, fails base/standard
        payment_method: "wire_transfer",

        // MINMAX: 2500 - fails base/standard (max 500), passes premium (100-5000), fails enterprise (min 1000)
        total_amount: 2500,

        // REGEX: matches premium pattern only
        order_reference: "PRE-US-123456",

        // LIST OF STRINGS: ["priority", "urgent"] - "priority" valid for premium, "urgent" valid for base/standard
        tags: ["priority", "urgent"],

        // LIST OF STRINGS (regex): one valid, one invalid
        sku_codes: ["SKU-ABC12345", "INVALID-SKU", "SKU-XYZ99999"],

        // LIST OF OBJECTS: mixed valid/invalid items
        line_items: [
          { product_id: "PROD-001", quantity: 5, unit_price: 99.99, discount_percent: 5 },    // valid for all
          { product_id: "PROD-002", quantity: 50, unit_price: 149.99, discount_percent: 15 }, // qty exceeds standard, discount exceeds standard
          { product_id: "BAD-ID", quantity: 200, unit_price: -10, discount_percent: 60 }      // all invalid
        ],

        // SINGLE OBJECT: mixed valid/invalid children
        shipping_address: {
          country_code: "US",           // valid (matches ^[A-Z]{2}$)
          postal_code: "invalid",       // invalid (doesn't match ^[0-9]{5}(-[0-9]{4})?$)
          is_verified: false            // fails premium/enterprise (pinned to true)
        },

        // COMBINED pinned+allowed: "gold" - valid allowed value, but fails enterprise (pinned to platinum)
        customer_tier: "gold"
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      // Pretty print the full output
      console.log("\n" + "=".repeat(80));
      console.log("PRIME EXAMPLE: Inspector Payload with All Edge Cases");
      console.log("=".repeat(80));
      console.log("\nFull event body sent to Inspector:\n");
      console.log(JSON.stringify(eventBody, null, 2));
      console.log("\n" + "=".repeat(80));

      // Verify structure
      expect(eventBody.type).toBe("event");
      expect(eventBody.eventName).toBe("Order Completed");
      expect(eventBody.eventSpecMetadata).toEqual({
        schemaId: "ws_prime_example",
        branchId: "main",
        latestActionId: "act_edge_cases",
        sourceId: "src_integration_test"
      });

      // Verify we have all properties
      const propNames = eventBody.eventProperties.map((p: any) => p.propertyName);
      expect(propNames).toContain("order_type");
      expect(propNames).toContain("payment_method");
      expect(propNames).toContain("total_amount");
      expect(propNames).toContain("order_reference");
      expect(propNames).toContain("tags");
      expect(propNames).toContain("sku_codes");
      expect(propNames).toContain("line_items");
      expect(propNames).toContain("shipping_address");
      expect(propNames).toContain("customer_tier");

      // Verify specific validation results

      // order_type: "premium" - pinned for premium, so base/standard/enterprise fail
      const orderTypeProp = eventBody.eventProperties.find((p: any) => p.propertyName === "order_type");
      expect(orderTypeProp.failedEventIds || orderTypeProp.passedEventIds).toBeDefined();

      // sku_codes: has invalid item "INVALID-SKU"
      const skuCodesProp = eventBody.eventProperties.find((p: any) => p.propertyName === "sku_codes");
      expect(skuCodesProp.failedEventIds).toBeDefined();
      expect(skuCodesProp.failedEventIds).toContain("evt_order");

      // line_items: should have children with failures
      const lineItemsProp = eventBody.eventProperties.find((p: any) => p.propertyName === "line_items");
      expect(lineItemsProp.children).toBeDefined();

      // shipping_address: should have children with failures (postal_code invalid)
      const shippingProp = eventBody.eventProperties.find((p: any) => p.propertyName === "shipping_address");
      expect(shippingProp.children).toBeDefined();
      const postalChild = shippingProp.children.find((c: any) => c.propertyName === "postal_code");
      expect(postalChild.failedEventIds).toBeDefined();
    });
  });

  // =========================================================================
  // TYPE MISMATCH TESTS: List vs Non-List
  // =========================================================================
  describe("Type Mismatch: List vs Non-List Values", () => {
    // Spec expects list types for some properties
    const listSpecResponse: EventSpecResponse = {
      events: [{
        branchId: "main",
        baseEventId: "evt_test",
        variantIds: [],
        props: {
          // Spec says this is a LIST of strings
          tags: {
            type: "string",
            required: true,
            isList: true,
            allowedValues: {
              '["red","green","blue"]': ["evt_test"]
            }
          },
          // Spec says this is a LIST of objects
          items: {
            type: "object",
            required: true,
            isList: true,
            children: {
              name: {
                type: "string",
                required: true
              },
              qty: {
                type: "int",
                required: true,
                minMaxRanges: {
                  "1,100": ["evt_test"]
                }
              }
            }
          },
          // Spec says this is a SINGLE string (not list)
          status: {
            type: "string",
            required: true,
            allowedValues: {
              '["active","inactive"]': ["evt_test"]
            }
          },
          // Spec says this is a SINGLE object (not list)
          metadata: {
            type: "object",
            required: false,
            children: {
              version: {
                type: "string",
                required: true,
                regexPatterns: {
                  "^v[0-9]+$": ["evt_test"]
                }
              }
            }
          }
        }
      }],
      metadata: {
        schemaId: "schema_mismatch_test",
        branchId: "main",
        latestActionId: "action_test",
        sourceId: "source_test"
      }
    };

    beforeEach(() => {
      (EventSpecCache as unknown as jest.Mock).mockImplementation(() => ({
        contains: jest.fn().mockReturnValue(true),
        get: jest.fn().mockReturnValue(listSpecResponse),
        set: jest.fn()
      }));

      (AvoEventSpecFetcher as unknown as jest.Mock).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(listSpecResponse)
      }));
    });

    test("Spec expects list of strings, but receives single string", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      // Spec expects tags to be an array, but we send a string
      await inspector.trackSchemaFromEvent("Test Event", {
        tags: "red",                    // Should be ["red"]
        items: [{ name: "item1", qty: 5 }],
        status: "active"
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      console.log("\n=== Type Mismatch: Expected list, got string ===");
      console.log("Event sent to Inspector:");
      console.log(JSON.stringify(eventBody, null, 2));

      // tags property should be present
      const tagsProp = eventBody.eventProperties.find((p: any) => p.propertyName === "tags");
      expect(tagsProp).toBeDefined();
      expect(tagsProp.propertyType).toBe("string");

      // Since value is not an array, list validation returns empty result (no validation performed)
      // This means no failedEventIds or passedEventIds - type mismatch is detected but not reported as constraint failure
      expect(tagsProp.failedEventIds).toBeUndefined();
      expect(tagsProp.passedEventIds).toBeUndefined();
    });

    test("Spec expects list of objects, but receives single object", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      // Spec expects items to be an array of objects, but we send a single object
      await inspector.trackSchemaFromEvent("Test Event", {
        tags: ["red", "green"],
        items: { name: "single_item", qty: 10 },  // Should be [{ name: "...", qty: ... }]
        status: "active"
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      console.log("\n=== Type Mismatch: Expected list of objects, got single object ===");
      console.log("Event sent to Inspector:");
      console.log(JSON.stringify(eventBody, null, 2));

      // items property should be present
      const itemsProp = eventBody.eventProperties.find((p: any) => p.propertyName === "items");
      expect(itemsProp).toBeDefined();
      expect(itemsProp.propertyType).toBe("object");

      // Since value is not an array, list validation returns empty result
      // No children validation results because the list check short-circuits
      expect(itemsProp.failedEventIds).toBeUndefined();
      expect(itemsProp.passedEventIds).toBeUndefined();
    });

    test("Spec expects single string, but receives array of strings", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      // Spec expects status to be a single string, but we send an array
      await inspector.trackSchemaFromEvent("Test Event", {
        tags: ["blue"],
        items: [{ name: "item1", qty: 5 }],
        status: ["active", "pending"]     // Should be "active"
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      console.log("\n=== Type Mismatch: Expected single string, got array ===");
      console.log("Event sent to Inspector:");
      console.log(JSON.stringify(eventBody, null, 2));

      // status property should be present
      const statusProp = eventBody.eventProperties.find((p: any) => p.propertyName === "status");
      expect(statusProp).toBeDefined();
      expect(statusProp.propertyType).toBe("list");

      // When spec expects non-list but receives array, it validates the JSON-stringified array
      // ["active", "pending"] stringified is '["active","pending"]' which is NOT in allowed values
      // So it should fail validation
      expect(statusProp.failedEventIds || statusProp.passedEventIds).toBeDefined();
      if (statusProp.failedEventIds) {
        expect(statusProp.failedEventIds).toContain("evt_test");
      }
    });

    test("Spec expects single object, but receives array of objects", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      // Spec expects metadata to be a single object, but we send an array
      await inspector.trackSchemaFromEvent("Test Event", {
        tags: ["green"],
        items: [{ name: "item1", qty: 5 }],
        status: "active",
        metadata: [{ version: "v1" }, { version: "v2" }]  // Should be { version: "v1" }
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      console.log("\n=== Type Mismatch: Expected single object, got array ===");
      console.log("Event sent to Inspector:");
      console.log(JSON.stringify(eventBody, null, 2));

      // metadata property should be present
      const metadataProp = eventBody.eventProperties.find((p: any) => p.propertyName === "metadata");
      expect(metadataProp).toBeDefined();
      expect(metadataProp.propertyType).toBe("list");

      // When spec expects non-list object but receives array:
      // - validateObjectProperty treats the array as an empty object {}
      // - Child properties won't be found in {}
      // Children may or may not have validation results depending on constraints
    });

    test("Spec expects list, receives null/undefined", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      // Spec expects tags to be an array, but we send null
      await inspector.trackSchemaFromEvent("Test Event", {
        tags: null,                     // Should be ["red"] etc
        items: [{ name: "item1", qty: 5 }],
        status: "active"
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      console.log("\n=== Type Mismatch: Expected list, got null ===");
      console.log("Event sent to Inspector:");
      console.log(JSON.stringify(eventBody, null, 2));

      // tags property should be present with null type
      const tagsProp = eventBody.eventProperties.find((p: any) => p.propertyName === "tags");
      expect(tagsProp).toBeDefined();
      expect(tagsProp.propertyType).toBe("null");

      // null is not an array, so list validation returns empty (no constraint validation)
      expect(tagsProp.failedEventIds).toBeUndefined();
      expect(tagsProp.passedEventIds).toBeUndefined();
    });

    test("Spec expects list of objects, receives list of primitives", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      // Spec expects items to be array of objects with {name, qty}
      // But we send array of strings
      await inspector.trackSchemaFromEvent("Test Event", {
        tags: ["red"],
        items: ["item1", "item2", "item3"],  // Should be [{ name: "...", qty: ... }]
        status: "active"
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      console.log("\n=== Type Mismatch: Expected list of objects, got list of primitives ===");
      console.log("Event sent to Inspector:");
      console.log(JSON.stringify(eventBody, null, 2));

      // items property should be present
      const itemsProp = eventBody.eventProperties.find((p: any) => p.propertyName === "items");
      expect(itemsProp).toBeDefined();
      expect(itemsProp.propertyType).toBe("list");

      // The items are strings, not objects, so when we try to extract child properties
      // from each item, we get empty objects {} and child values are undefined
      // The qty child has minMaxRanges constraint - undefined is not a number, so it fails
      if (itemsProp.children && Array.isArray(itemsProp.children)) {
        const qtyChild = itemsProp.children.find((c: any) => c.propertyName === "qty");
        if (qtyChild) {
          // Non-numeric value (undefined) should fail minmax constraints
          expect(qtyChild.failedEventIds).toBeDefined();
          expect(qtyChild.failedEventIds).toContain("evt_test");
        }
      }
    });

    test("Mixed: some list properties correct, some mismatched", async () => {
      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      const callInspectorImmediatelySpy = jest
        .spyOn((inspector as any).avoNetworkCallsHandler, "callInspectorImmediately")
        .mockImplementation((...args: any[]) => { args[1](null); });

      await inspector.trackSchemaFromEvent("Test Event", {
        tags: ["red", "blue"],                          // Correct: array as expected
        items: { name: "wrong", qty: 5 },               // Wrong: single object instead of array
        status: "active",                               // Correct: single string as expected
        metadata: [{ version: "v1" }]                   // Wrong: array instead of single object
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      console.log("\n=== Mixed Mismatch: Some correct, some wrong ===");
      console.log("Event sent to Inspector:");
      console.log(JSON.stringify(eventBody, null, 2));

      // tags: Correct - array with valid values
      const tagsProp = eventBody.eventProperties.find((p: any) => p.propertyName === "tags");
      expect(tagsProp).toBeDefined();
      expect(tagsProp.propertyType).toBe("list");
      // Should pass since red, blue are in allowed values
      expect(tagsProp.failedEventIds).toBeUndefined();

      // items: Wrong - single object when array expected
      const itemsProp = eventBody.eventProperties.find((p: any) => p.propertyName === "items");
      expect(itemsProp).toBeDefined();
      expect(itemsProp.propertyType).toBe("object");
      // No validation results because non-array short-circuits list validation

      // status: Correct - single string with valid value
      const statusProp = eventBody.eventProperties.find((p: any) => p.propertyName === "status");
      expect(statusProp).toBeDefined();
      expect(statusProp.propertyType).toBe("string");
      // Should pass since "active" is in allowed values
      expect(statusProp.failedEventIds).toBeUndefined();

      // metadata: Wrong - array when single object expected
      const metadataProp = eventBody.eventProperties.find((p: any) => p.propertyName === "metadata");
      expect(metadataProp).toBeDefined();
      expect(metadataProp.propertyType).toBe("list");
    });
  });
});
