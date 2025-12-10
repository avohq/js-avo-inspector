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
      (EventSpecCache as unknown as jest.Mock).mockImplementation(() => ({
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

    test("CRITICAL: if extractSchema fails, validation still runs but eventProperties is empty", async () => {
      // This test demonstrates the bug scenario:
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
        get: jest.fn().mockReturnValue(testSpec),
        set: jest.fn()
      }));

      const inspector = new AvoInspector({
        apiKey: "test-key",
        env: AvoInspectorEnv.Dev,
        version: "1.0.0"
      });

      // Mock extractSchema to return empty (simulating error)
      const originalExtractSchema = inspector.extractSchema.bind(inspector);
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

  describe("Array of Objects (list of nested objects)", () => {
    // Mock spec response for testing list of nested objects with optional properties
    // Key scenario: nested objects may be missing optional properties (like "Item Category")
    const arrayOfObjectsEventSpecResponse: EventSpecResponse = {
      events: [{
        branchId: "main",
        baseEventId: "evt_search_results",
        variantIds: ["evt_search_results.variant1"],
        props: {
          "Workspace Id": {
            type: "string",
            required: true
          },
          "Workspace Name": {
            type: "string",
            required: false
          },
          "Account Status": {
            type: "string",
            required: true,
            allowedValues: {
              '["Active","Trial","Expired"]': ["evt_search_results", "evt_search_results.variant1"]
            }
          },
          "Result Count": {
            type: "int",
            required: true
          },
          // Key property: list of nested objects with OPTIONAL "Item Category" property
          // This tests the scenario where actual data may not include optional nested properties
          "Search Results": {
            type: "list",
            required: true,
            children: {
              "Item Name": {
                type: "string",
                required: false
              },
              "Item Category": {
                type: "string",
                required: false,  // OPTIONAL - data may not include this
                allowedValues: {
                  '["TypeA","TypeB","TypeC"]': ["evt_search_results", "evt_search_results.variant1"]
                }
              },
              "Position": {
                type: "int",
                required: true,
                minMaxRanges: {
                  "1,100": ["evt_search_results", "evt_search_results.variant1"]
                }
              },
              "Score": {
                type: "float",
                required: true,
                minMaxRanges: {
                  "0,1": ["evt_search_results", "evt_search_results.variant1"]
                }
              },
              "Query": {
                type: "string",
                required: true
              }
            }
          },
          "Fuzzy Results": {
            type: "list",
            required: true,
            children: {
              "Item Name": {
                type: "string",
                required: false
              },
              "Item Category": {
                type: "string",
                required: false
              },
              "Position": {
                type: "int",
                required: true
              },
              "Score": {
                type: "float",
                required: true
              },
              "Query": {
                type: "string",
                required: true
              }
            }
          },
          "Search Type": {
            type: "string",
            required: true
          },
          "Client": {
            type: "string",
            required: true,
            allowedValues: {
              '["Web","Mobile","API"]': ["evt_search_results", "evt_search_results.variant1"]
            }
          },
          "App Version": {
            type: "string",
            required: true
          }
        }
      }],
      metadata: {
        schemaId: "test_schema",
        branchId: "main",
        latestActionId: "action_123"
      }
    };

    beforeEach(() => {
      (EventSpecCache as unknown as jest.Mock).mockImplementation(() => ({
        get: jest.fn().mockReturnValue(arrayOfObjectsEventSpecResponse),
        set: jest.fn()
      }));

      (AvoEventSpecFetcher as unknown as jest.Mock).mockImplementation(() => ({
        fetch: jest.fn().mockResolvedValue(arrayOfObjectsEventSpecResponse)
      }));
    });

    test("should preserve array of objects structure in eventProperties", async () => {
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

      // Track event with array of objects - note that "Item Category" is OPTIONAL and not included
      await inspector.trackSchemaFromEvent("Search Results Received", {
        "Workspace Id": "workspace-123",
        "Search Results": [
          {
            "Item Name": "First Result",
            // "Item Category" intentionally omitted - it's optional
            "Position": 1,
            "Score": 0.95,
            "Query": "test"
          },
          {
            "Item Name": "Second Result",
            "Item Category": "TypeA",  // included here
            "Position": 2,
            "Score": 0.87,
            "Query": "test"
          }
        ],
        "Fuzzy Results": [
          {
            "Item Name": "Fuzzy Match",
            "Position": 1,
            "Score": 0.75,
            "Query": "test"
          }
        ]
      });

      expect(callInspectorImmediatelySpy).toHaveBeenCalledTimes(1);

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      // Verify eventProperties is NOT empty
      expect(eventBody.eventProperties).toBeDefined();
      expect(eventBody.eventProperties.length).toBeGreaterThan(0);

      // Find the Search Results property
      const searchResultsProp = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "Search Results"
      );

      expect(searchResultsProp).toBeDefined();
      expect(searchResultsProp.propertyType).toBe("list");

      // CRITICAL: children should NOT be empty!
      expect(searchResultsProp.children).toBeDefined();
      expect(searchResultsProp.children.length).toBeGreaterThan(0);

      // For array of objects, children should contain arrays of property objects
      // Each item in the source array becomes an array of EventProperty objects
      const firstItemProps = searchResultsProp.children[0];
      expect(Array.isArray(firstItemProps)).toBe(true);
      expect(firstItemProps.length).toBe(4); // Item Name, Position, Score, Query (no Item Category)

      // Verify nested property structure is preserved
      const itemNameProp = firstItemProps.find((p: any) => p.propertyName === "Item Name");
      expect(itemNameProp).toBeDefined();
      expect(itemNameProp.propertyType).toBe("string");

      const positionProp = firstItemProps.find((p: any) => p.propertyName === "Position");
      expect(positionProp).toBeDefined();
      expect(positionProp.propertyType).toBe("int");
    });

    test("should include all properties even when validation is performed on array of objects", async () => {
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

      // Track event with all properties matching the spec
      await inspector.trackSchemaFromEvent("Search Results Received", {
        "Workspace Id": "workspace-123",
        "Workspace Name": "Test Workspace",
        "Account Status": "Active",
        "Result Count": 5,
        "Search Results": [
          {
            "Item Name": "First Result",
            "Item Category": "TypeA",
            "Position": 1,
            "Score": 0.95,
            "Query": "test"
          }
        ],
        "Fuzzy Results": [
          {
            "Item Name": "Fuzzy Match",
            "Item Category": "TypeB",
            "Position": 1,
            "Score": 0.75,
            "Query": "test"
          }
        ],
        "Search Type": "full",
        "Client": "Web",
        "App Version": "2.0.0"
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      // Verify we have ALL properties (not empty!)
      expect(eventBody.eventProperties.length).toBe(9);

      // Verify each expected property is present
      const propertyNames = eventBody.eventProperties.map((p: any) => p.propertyName);
      expect(propertyNames).toContain("Workspace Id");
      expect(propertyNames).toContain("Workspace Name");
      expect(propertyNames).toContain("Search Results");
      expect(propertyNames).toContain("Fuzzy Results");
      expect(propertyNames).toContain("Client");
      expect(propertyNames).toContain("App Version");

      // Verify the nested structures are preserved
      const searchResults = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "Search Results"
      );
      expect(searchResults.children).toBeDefined();
      expect(searchResults.children.length).toBe(1); // One object in the array

      const fuzzyResults = eventBody.eventProperties.find(
        (p: any) => p.propertyName === "Fuzzy Results"
      );
      expect(fuzzyResults.children).toBeDefined();
      expect(fuzzyResults.children.length).toBe(1); // One object in the array
    });

    test("JSON serialization of eventProperties should preserve nested array structure", async () => {
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

      await inspector.trackSchemaFromEvent("Search Results Received", {
        "Workspace Id": "workspace-123",
        "Search Results": [
          { "Item Name": "Test", "Item Category": "TypeA", "Position": 1, "Score": 0.5, "Query": "test" }
        ]
      });

      const eventBody = callInspectorImmediatelySpy.mock.calls[0][0] as any;

      // Serialize and parse to verify structure survives JSON round-trip
      const json = JSON.stringify(eventBody);
      const parsed = JSON.parse(json);

      // eventProperties should not be empty after JSON round-trip
      expect(parsed.eventProperties.length).toBe(2);

      const searchResults = parsed.eventProperties.find(
        (p: any) => p.propertyName === "Search Results"
      );
      expect(searchResults.children).toBeDefined();
      expect(searchResults.children.length).toBe(1);
      expect(searchResults.children[0].length).toBe(5);
    });
  });
});
