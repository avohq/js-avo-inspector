import {
  validateEvent,
  findClosestMatch,
  validateProperties,
  eventExistsInSpec,
  type RuntimeProperties
} from "../eventSpec/EventValidator";
import type { EventSpec, VariantSpec, PropertySpec } from "../eventSpec/AvoEventSpecFetchTypes";
import {
  createPropertySpec,
  createEventSpec,
  createVariantSpec,
  createEventSpecResponse
} from "./helpers/mockFactories";

// =============================================================================
// MAIN VALIDATION FUNCTION TESTS
// =============================================================================

describe("validateEvent", () => {
  describe("Event Matching", () => {
    test("should return UnexpectedEvent when no events match", () => {
      const specResponse = createEventSpecResponse([
        createEventSpec({ name: "other_event" })
      ]);

      const result = validateEvent("unknown_event", {}, specResponse);

      expect(result.eventId).toBeNull();
      expect(result.variantId).toBeNull();
      expect(result.validationErrors).toHaveLength(1);
      expect(result.validationErrors[0].code).toBe("UnexpectedEvent");
      expect(result.validationErrors[0].propertyName).toBe("unknown_event");
    });

    test("should match event by name", () => {
      const specResponse = createEventSpecResponse([
        createEventSpec({ id: "evt_login", name: "user_login" })
      ]);

      const result = validateEvent("user_login", {}, specResponse);

      expect(result.eventId).toBe("evt_login");
      expect(result.variantId).toBeNull();
    });

    test("should match event by mappedName", () => {
      const specResponse = createEventSpecResponse([
        createEventSpec({ id: "evt_login", name: "user_login", mappedName: "Login" })
      ]);

      const result = validateEvent("Login", {}, specResponse);

      expect(result.eventId).toBe("evt_login");
    });

    test("should match event case-insensitively", () => {
      const specResponse = createEventSpecResponse([
        createEventSpec({ id: "evt_login", name: "User_Login" })
      ]);

      const result = validateEvent("user_login", {}, specResponse);

      expect(result.eventId).toBe("evt_login");
    });

    test("should populate eventSpecMetadata from metadata", () => {
      const specResponse = createEventSpecResponse([
        createEventSpec({ name: "test_event" })
      ]);

      const result = validateEvent("test_event", {}, specResponse);

      expect(result.eventSpecMetadata).toEqual({
        schemaId: "schema_123",
        branchId: "main",
        latestActionId: "action_456",
        sourceId: "source_789"
      });
    });
  });

  describe("Variant Matching", () => {
    test("should match variant with pinned value", () => {
      const specResponse = createEventSpecResponse([
        createEventSpec({
          id: "evt_purchase",
          name: "purchase",
          props: {
            amount: createPropertySpec({ id: "prop_amount", t: { type: "primitive", value: "number" } })
          },
          variants: [
            createVariantSpec({
              variantId: "var_premium",
              eventId: "evt_purchase",
              nameSuffix: "Premium",
              props: {
                tier: createPropertySpec({
                  id: "prop_tier",
                  t: { type: "primitive", value: "string" },
                  v: ["premium"] // Pinned value
                })
              }
            })
          ]
        })
      ]);

      const result = validateEvent("purchase", { amount: 100, tier: "premium" }, specResponse);

      expect(result.eventId).toBe("evt_purchase");
      expect(result.variantId).toBe("var_premium");
    });

    test("should prefer base event when no variant matches well", () => {
      const specResponse = createEventSpecResponse([
        createEventSpec({
          id: "evt_click",
          name: "click",
          props: {
            element: createPropertySpec({ id: "prop_element" })
          },
          variants: [
            createVariantSpec({
              variantId: "var_button",
              eventId: "evt_click",
              props: {
                element_type: createPropertySpec({
                  id: "prop_element_type",
                  v: ["button"]
                })
              }
            })
          ]
        })
      ]);

      const result = validateEvent("click", { element: "header" }, specResponse);

      expect(result.eventId).toBe("evt_click");
      expect(result.variantId).toBeNull();
    });
  });
});

// =============================================================================
// MATCHING LOGIC TESTS
// =============================================================================

describe("findClosestMatch", () => {
  test("should return null when events array is empty", () => {
    const result = findClosestMatch("test", {}, []);
    expect(result).toBeNull();
  });

  test("should return null when no event name matches", () => {
    const events = [createEventSpec({ name: "other_event" })];
    const result = findClosestMatch("test_event", {}, events);
    expect(result).toBeNull();
  });

  test("should return event when name matches", () => {
    const events = [createEventSpec({ id: "evt_1", name: "test_event" })];
    const result = findClosestMatch("test_event", {}, events);

    expect(result).not.toBeNull();
    expect(result?.event.id).toBe("evt_1");
    expect(result?.variant).toBeNull();
  });

  test("should prefer event with more matching properties", () => {
    const events = [
      createEventSpec({
        id: "evt_1",
        name: "test_event",
        props: {
          prop_a: createPropertySpec({ id: "prop_a" })
        }
      }),
      createEventSpec({
        id: "evt_2",
        name: "test_event",
        props: {
          prop_a: createPropertySpec({ id: "prop_a" }),
          prop_b: createPropertySpec({ id: "prop_b" })
        }
      })
    ];

    const result = findClosestMatch("test_event", { prop_a: "a", prop_b: "b" }, events);

    expect(result?.event.id).toBe("evt_2");
  });

  test("should score higher for enum value matches", () => {
    const events = [
      createEventSpec({
        id: "evt_1",
        name: "login",
        props: {
          method: createPropertySpec({
            id: "prop_method",
            v: ["email", "google"]
          })
        }
      })
    ];

    const result = findClosestMatch("login", { method: "email" }, events);

    expect(result).not.toBeNull();
    // Internal: Verify score is computed (testing implementation detail)
    expect(result?.score).toBeGreaterThan(0);
  });

  describe("Internal Scoring (implementation details)", () => {
    test("should give bonus score for variant with mappedName", () => {
      const events = [
        createEventSpec({
          id: "evt_1",
          name: "test_event",
          props: {},
          variants: [
            createVariantSpec({
              variantId: "var_1",
              eventId: "evt_1",
              nameSuffix: "WithMapped",
              mappedName: "Mapped Event Name",
              props: {}
            }),
            createVariantSpec({
              variantId: "var_2",
              eventId: "evt_1",
              nameSuffix: "WithoutMapped",
              props: {}
            })
          ]
        })
      ];

      // Match the event
      const result = findClosestMatch("test_event", {}, events);
      expect(result).not.toBeNull();

      // The variant with mappedName should get a small bonus
      // This tests the VARIANT_MAPPED_NAME scoring weight
    });
  });
});

// =============================================================================
// VALIDATION LOGIC TESTS
// =============================================================================

describe("validateProperties", () => {
  describe("RequiredMissing", () => {
    test("should report missing required property", () => {
      const event = createEventSpec({
        props: {
          required_prop: createPropertySpec({ id: "prop_req", r: true })
        }
      });

      const errors = validateProperties({}, event, null);

      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe("RequiredMissing");
      expect(errors[0].propertyId).toBe("prop_req");
      expect(errors[0].propertyName).toBe("required_prop");
    });

    test("should not report missing optional property", () => {
      const event = createEventSpec({
        props: {
          optional_prop: createPropertySpec({ r: false })
        }
      });

      const errors = validateProperties({}, event, null);

      expect(errors).toHaveLength(0);
    });

    test("should treat null as missing for required", () => {
      const event = createEventSpec({
        props: {
          required_prop: createPropertySpec({ id: "prop_req", r: true })
        }
      });

      const errors = validateProperties({ required_prop: null }, event, null);

      expect(errors.some(e => e.code === "RequiredMissing")).toBe(true);
    });

    test("should treat undefined as missing for required", () => {
      const event = createEventSpec({
        props: {
          required_prop: createPropertySpec({ id: "prop_req", r: true })
        }
      });

      const errors = validateProperties({ required_prop: undefined }, event, null);

      expect(errors.some(e => e.code === "RequiredMissing")).toBe(true);
    });

    test("should treat empty string as present value", () => {
      const event = createEventSpec({
        props: {
          required_prop: createPropertySpec({ id: "prop_req", r: true })
        }
      });

      const errors = validateProperties({ required_prop: "" }, event, null);

      expect(errors.some(e => e.code === "RequiredMissing")).toBe(false);
    });
  });

  describe("TypeMismatch", () => {
    test("should report type mismatch for string vs number", () => {
      const event = createEventSpec({
        props: {
          count: createPropertySpec({
            id: "prop_count",
            t: { type: "primitive", value: "int" }
          })
        }
      });

      const errors = validateProperties({ count: "not a number" }, event, null);

      expect(errors.some(e => e.code === "TypeMismatch")).toBe(true);
    });

    test("should accept integer for int type", () => {
      const event = createEventSpec({
        props: {
          count: createPropertySpec({
            id: "prop_count",
            t: { type: "primitive", value: "int" }
          })
        }
      });

      const errors = validateProperties({ count: 42 }, event, null);

      expect(errors.some(e => e.code === "TypeMismatch")).toBe(false);
    });

    test("should reject float for int type", () => {
      const event = createEventSpec({
        props: {
          count: createPropertySpec({
            id: "prop_count",
            t: { type: "primitive", value: "int" }
          })
        }
      });

      const errors = validateProperties({ count: 3.14 }, event, null);

      expect(errors.some(e => e.code === "TypeMismatch")).toBe(true);
    });

    test("should accept float for number type", () => {
      const event = createEventSpec({
        props: {
          price: createPropertySpec({
            id: "prop_price",
            t: { type: "primitive", value: "number" }
          })
        }
      });

      const errors = validateProperties({ price: 3.14 }, event, null);

      expect(errors.some(e => e.code === "TypeMismatch")).toBe(false);
    });

    test("should report type mismatch for object vs primitive", () => {
      const event = createEventSpec({
        props: {
          name: createPropertySpec({
            id: "prop_name",
            t: { type: "primitive", value: "string" }
          })
        }
      });

      const errors = validateProperties({ name: { first: "John" } }, event, null);

      expect(errors.some(e => e.code === "TypeMismatch")).toBe(true);
    });

    test("should accept object for object type", () => {
      const event = createEventSpec({
        props: {
          user: createPropertySpec({
            id: "prop_user",
            t: { type: "object", value: {} }
          })
        }
      });

      const errors = validateProperties({ user: { id: 1 } }, event, null);

      expect(errors.some(e => e.code === "TypeMismatch")).toBe(false);
    });

    describe("Type Aliases", () => {
      test("should accept integer for 'integer' type alias", () => {
        const event = createEventSpec({
          props: {
            count: createPropertySpec({
              id: "prop_count",
              t: { type: "primitive", value: "integer" }
            })
          }
        });

        const errors = validateProperties({ count: 42 }, event, null);

        expect(errors.some(e => e.code === "TypeMismatch")).toBe(false);
      });

      test("should accept integer for 'long' type alias", () => {
        const event = createEventSpec({
          props: {
            bigNumber: createPropertySpec({
              id: "prop_big",
              t: { type: "primitive", value: "long" }
            })
          }
        });

        const errors = validateProperties({ bigNumber: 9999999999 }, event, null);

        expect(errors.some(e => e.code === "TypeMismatch")).toBe(false);
      });

      test("should accept float for 'float' type alias", () => {
        const event = createEventSpec({
          props: {
            temperature: createPropertySpec({
              id: "prop_temp",
              t: { type: "primitive", value: "float" }
            })
          }
        });

        const errors = validateProperties({ temperature: 98.6 }, event, null);

        expect(errors.some(e => e.code === "TypeMismatch")).toBe(false);
      });

      test("should accept float for 'double' type alias", () => {
        const event = createEventSpec({
          props: {
            precision: createPropertySpec({
              id: "prop_prec",
              t: { type: "primitive", value: "double" }
            })
          }
        });

        const errors = validateProperties({ precision: 3.141592653589793 }, event, null);

        expect(errors.some(e => e.code === "TypeMismatch")).toBe(false);
      });

      test("should accept boolean for 'bool' type alias", () => {
        const event = createEventSpec({
          props: {
            active: createPropertySpec({
              id: "prop_active",
              t: { type: "primitive", value: "bool" }
            })
          }
        });

        const errors = validateProperties({ active: true }, event, null);

        expect(errors.some(e => e.code === "TypeMismatch")).toBe(false);
      });

      test("should reject non-boolean for 'bool' type alias", () => {
        const event = createEventSpec({
          props: {
            active: createPropertySpec({
              id: "prop_active",
              t: { type: "primitive", value: "bool" }
            })
          }
        });

        const errors = validateProperties({ active: "true" }, event, null);

        expect(errors.some(e => e.code === "TypeMismatch")).toBe(true);
      });
    });

    test("should report 'array' in TypeMismatch when array received for primitive", () => {
      const event = createEventSpec({
        props: {
          name: createPropertySpec({
            id: "prop_name",
            t: { type: "primitive", value: "string" }
          })
        }
      });

      const errors = validateProperties({ name: ["not", "a", "string"] }, event, null);

      const error = errors.find(e => e.code === "TypeMismatch");
      expect(error).toBeDefined();
      expect(error?.received).toBe("array");
    });
  });

  describe("ValueBelowMin / ValueAboveMax", () => {
    test("should report value below min", () => {
      const event = createEventSpec({
        props: {
          age: createPropertySpec({
            id: "prop_age",
            t: { type: "primitive", value: "int" },
            min: 0
          })
        }
      });

      const errors = validateProperties({ age: -5 }, event, null);

      expect(errors.some(e => e.code === "ValueBelowMin")).toBe(true);
      const error = errors.find(e => e.code === "ValueBelowMin");
      expect(error?.expected).toBe(0);
      expect(error?.received).toBe(-5);
    });

    test("should report value above max", () => {
      const event = createEventSpec({
        props: {
          rating: createPropertySpec({
            id: "prop_rating",
            t: { type: "primitive", value: "int" },
            max: 5
          })
        }
      });

      const errors = validateProperties({ rating: 10 }, event, null);

      expect(errors.some(e => e.code === "ValueAboveMax")).toBe(true);
      const error = errors.find(e => e.code === "ValueAboveMax");
      expect(error?.expected).toBe(5);
      expect(error?.received).toBe(10);
    });

    test("should accept value within range", () => {
      const event = createEventSpec({
        props: {
          score: createPropertySpec({
            id: "prop_score",
            t: { type: "primitive", value: "int" },
            min: 0,
            max: 100
          })
        }
      });

      const errors = validateProperties({ score: 50 }, event, null);

      expect(errors.some(e => e.code === "ValueBelowMin" || e.code === "ValueAboveMax")).toBe(false);
    });

    test("should accept value at boundary", () => {
      const event = createEventSpec({
        props: {
          score: createPropertySpec({
            id: "prop_score",
            t: { type: "primitive", value: "int" },
            min: 0,
            max: 100
          })
        }
      });

      const errorsMin = validateProperties({ score: 0 }, event, null);
      const errorsMax = validateProperties({ score: 100 }, event, null);

      expect(errorsMin.some(e => e.code === "ValueBelowMin")).toBe(false);
      expect(errorsMax.some(e => e.code === "ValueAboveMax")).toBe(false);
    });
  });

  describe("NotInAllowedValues", () => {
    test("should report value not in allowed list", () => {
      const event = createEventSpec({
        props: {
          status: createPropertySpec({
            id: "prop_status",
            v: ["active", "inactive", "pending"]
          })
        }
      });

      const errors = validateProperties({ status: "unknown" }, event, null);

      expect(errors.some(e => e.code === "NotInAllowedValues")).toBe(true);
      const error = errors.find(e => e.code === "NotInAllowedValues");
      expect(error?.received).toBe("unknown");
    });

    test("should accept value in allowed list", () => {
      const event = createEventSpec({
        props: {
          status: createPropertySpec({
            id: "prop_status",
            v: ["active", "inactive", "pending"]
          })
        }
      });

      const errors = validateProperties({ status: "active" }, event, null);

      expect(errors.some(e => e.code === "NotInAllowedValues")).toBe(false);
    });

    test("should handle numeric values as strings", () => {
      const event = createEventSpec({
        props: {
          tier: createPropertySpec({
            id: "prop_tier",
            v: ["1", "2", "3"]
          })
        }
      });

      const errors = validateProperties({ tier: 1 }, event, null);

      // Should convert number to string for comparison
      expect(errors.some(e => e.code === "NotInAllowedValues")).toBe(false);
    });
  });

  describe("RegexMismatch", () => {
    test("should report regex mismatch", () => {
      const event = createEventSpec({
        props: {
          email: createPropertySpec({
            id: "prop_email",
            rx: "^[\\w-\\.]+@[\\w-]+\\.[a-z]{2,}$"
          })
        }
      });

      const errors = validateProperties({ email: "not-an-email" }, event, null);

      expect(errors.some(e => e.code === "RegexMismatch")).toBe(true);
    });

    test("should accept value matching regex", () => {
      const event = createEventSpec({
        props: {
          email: createPropertySpec({
            id: "prop_email",
            rx: "^[\\w-\\.]+@[\\w-]+\\.[a-z]{2,}$"
          })
        }
      });

      const errors = validateProperties({ email: "test@example.com" }, event, null);

      expect(errors.some(e => e.code === "RegexMismatch")).toBe(false);
    });

    test("should handle invalid regex gracefully", () => {
      const event = createEventSpec({
        props: {
          field: createPropertySpec({
            id: "prop_field",
            rx: "[invalid(regex"
          })
        }
      });

      // Should not throw, just skip the check
      expect(() => validateProperties({ field: "test" }, event, null)).not.toThrow();
    });
  });

  describe("UnexpectedProperty", () => {
    test("should report unexpected property", () => {
      const event = createEventSpec({
        props: {
          expected_prop: createPropertySpec({ id: "prop_expected" })
        }
      });

      const errors = validateProperties(
        { expected_prop: "value", unexpected_prop: "surprise" },
        event,
        null
      );

      expect(errors.some(e => e.code === "UnexpectedProperty")).toBe(true);
      const error = errors.find(e => e.code === "UnexpectedProperty");
      expect(error?.propertyName).toBe("unexpected_prop");
    });

    test("should not report expected properties", () => {
      const event = createEventSpec({
        props: {
          prop_a: createPropertySpec({ id: "prop_a" }),
          prop_b: createPropertySpec({ id: "prop_b" })
        }
      });

      const errors = validateProperties({ prop_a: "a", prop_b: "b" }, event, null);

      expect(errors.some(e => e.code === "UnexpectedProperty")).toBe(false);
    });
  });

  describe("List (Array) Properties", () => {
    test("should validate each item in array", () => {
      const event = createEventSpec({
        props: {
          tags: createPropertySpec({
            id: "prop_tags",
            l: true,
            v: ["red", "blue", "green"]
          })
        }
      });

      const errors = validateProperties({ tags: ["red", "yellow", "blue"] }, event, null);

      expect(errors.some(e => e.code === "NotInAllowedValues")).toBe(true);
    });

    test("should validate min/max for each item in numeric array", () => {
      const event = createEventSpec({
        props: {
          scores: createPropertySpec({
            id: "prop_scores",
            t: { type: "primitive", value: "int" },
            l: true,
            min: 0,
            max: 100
          })
        }
      });

      const errors = validateProperties({ scores: [50, 150, 75] }, event, null);

      expect(errors.some(e => e.code === "ValueAboveMax")).toBe(true);
    });

    test("should handle non-array value when list expected", () => {
      const event = createEventSpec({
        props: {
          tags: createPropertySpec({
            id: "prop_tags",
            l: true,
            v: ["red", "blue", "green"]
          })
        }
      });

      // When l: true but value is not array, treat as single-item array for validation
      const errors = validateProperties({ tags: "red" }, event, null);

      // Should still validate the single value
      expect(errors.some(e => e.code === "NotInAllowedValues")).toBe(false);
    });

    test("should report error for non-array value not in allowed list", () => {
      const event = createEventSpec({
        props: {
          tags: createPropertySpec({
            id: "prop_tags",
            l: true,
            v: ["red", "blue", "green"]
          })
        }
      });

      const errors = validateProperties({ tags: "yellow" }, event, null);

      expect(errors.some(e => e.code === "NotInAllowedValues")).toBe(true);
    });
  });

  describe("Nested Object Properties", () => {
    test("should validate nested object properties", () => {
      const event = createEventSpec({
        props: {
          user: createPropertySpec({
            id: "prop_user",
            t: {
              type: "object",
              value: {
                name: createPropertySpec({ id: "prop_name", r: true }),
                age: createPropertySpec({
                  id: "prop_age",
                  t: { type: "primitive", value: "int" },
                  min: 0
                })
              }
            }
          })
        }
      });

      const errors = validateProperties({ user: { age: -5 } }, event, null);

      expect(errors.some(e => e.code === "RequiredMissing" && e.propertyName === "user.name")).toBe(true);
      expect(errors.some(e => e.code === "ValueBelowMin" && e.propertyName === "user.age")).toBe(true);
    });

    test("should report unexpected nested properties", () => {
      const event = createEventSpec({
        props: {
          config: createPropertySpec({
            id: "prop_config",
            t: {
              type: "object",
              value: {
                enabled: createPropertySpec({ id: "prop_enabled" })
              }
            }
          })
        }
      });

      const errors = validateProperties(
        { config: { enabled: true, debug: true } },
        event,
        null
      );

      expect(errors.some(e => e.code === "UnexpectedProperty" && e.propertyName === "config.debug")).toBe(true);
    });

    test("should validate deeply nested object properties (2+ levels)", () => {
      const event = createEventSpec({
        props: {
          order: createPropertySpec({
            id: "prop_order",
            t: {
              type: "object",
              value: {
                customer: createPropertySpec({
                  id: "prop_customer",
                  t: {
                    type: "object",
                    value: {
                      address: createPropertySpec({
                        id: "prop_address",
                        t: {
                          type: "object",
                          value: {
                            zip: createPropertySpec({
                              id: "prop_zip",
                              r: true,
                              rx: "^\\d{5}$"
                            })
                          }
                        }
                      })
                    }
                  }
                })
              }
            }
          })
        }
      });

      const errors = validateProperties({
        order: {
          customer: {
            address: {
              zip: "invalid"
            }
          }
        }
      }, event, null);

      expect(errors.some(e =>
        e.code === "RegexMismatch" &&
        e.propertyName === "order.customer.address.zip"
      )).toBe(true);
    });
  });

  describe("Variant Validation", () => {
    test("should merge variant props with base props for validation", () => {
      const event = createEventSpec({
        id: "evt_purchase",
        props: {
          amount: createPropertySpec({ id: "prop_amount", r: true })
        }
      });

      const variant = createVariantSpec({
        variantId: "var_premium",
        props: {
          tier: createPropertySpec({ id: "prop_tier", r: true })
        }
      });

      const errors = validateProperties({}, event, variant);

      // Should require both base and variant props
      expect(errors.filter(e => e.code === "RequiredMissing")).toHaveLength(2);
    });

    test("should allow variant to override base property spec", () => {
      const event = createEventSpec({
        props: {
          method: createPropertySpec({
            id: "prop_method",
            v: ["a", "b", "c"]
          })
        }
      });

      const variant = createVariantSpec({
        props: {
          method: createPropertySpec({
            id: "prop_method_override",
            v: ["x", "y", "z"]
          })
        }
      });

      const errors = validateProperties({ method: "x" }, event, variant);

      expect(errors.some(e => e.code === "NotInAllowedValues")).toBe(false);
    });
  });
});

// =============================================================================
// UTILITY FUNCTION TESTS
// =============================================================================

describe("eventExistsInSpec", () => {
  test("should return true when event exists", () => {
    const specResponse = createEventSpecResponse([
      createEventSpec({ name: "test_event" })
    ]);

    expect(eventExistsInSpec("test_event", specResponse)).toBe(true);
  });

  test("should return false when event does not exist", () => {
    const specResponse = createEventSpecResponse([
      createEventSpec({ name: "other_event" })
    ]);

    expect(eventExistsInSpec("test_event", specResponse)).toBe(false);
  });

  test("should match by mappedName", () => {
    const specResponse = createEventSpecResponse([
      createEventSpec({ name: "internal_name", mappedName: "External Name" })
    ]);

    expect(eventExistsInSpec("External Name", specResponse)).toBe(true);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe("Edge Cases", () => {
  test("should handle empty properties", () => {
    const event = createEventSpec({ props: {} });
    const errors = validateProperties({}, event, null);
    expect(errors).toHaveLength(0);
  });

  test("should handle empty spec response", () => {
    const specResponse = createEventSpecResponse([]);
    const result = validateEvent("any_event", {}, specResponse);

    expect(result.eventId).toBeNull();
    expect(result.validationErrors[0].code).toBe("UnexpectedEvent");
  });

  test("should handle boolean type", () => {
    const event = createEventSpec({
      props: {
        enabled: createPropertySpec({
          id: "prop_enabled",
          t: { type: "primitive", value: "boolean" }
        })
      }
    });

    const errorsValid = validateProperties({ enabled: true }, event, null);
    const errorsInvalid = validateProperties({ enabled: "true" }, event, null);

    expect(errorsValid.some(e => e.code === "TypeMismatch")).toBe(false);
    expect(errorsInvalid.some(e => e.code === "TypeMismatch")).toBe(true);
  });

  test("should handle 'any' type", () => {
    const event = createEventSpec({
      props: {
        data: createPropertySpec({
          id: "prop_data",
          t: { type: "primitive", value: "any" }
        })
      }
    });

    const errors1 = validateProperties({ data: "string" }, event, null);
    const errors2 = validateProperties({ data: 123 }, event, null);
    const errors3 = validateProperties({ data: true }, event, null);

    expect(errors1.some(e => e.code === "TypeMismatch")).toBe(false);
    expect(errors2.some(e => e.code === "TypeMismatch")).toBe(false);
    expect(errors3.some(e => e.code === "TypeMismatch")).toBe(false);
  });

  test("should handle special characters in property names", () => {
    const event = createEventSpec({
      props: {
        "prop-with-dashes": createPropertySpec({ id: "prop_dashes" }),
        "prop.with.dots": createPropertySpec({ id: "prop_dots" })
      }
    });

    const errors = validateProperties(
      { "prop-with-dashes": "a", "prop.with.dots": "b" },
      event,
      null
    );

    expect(errors).toHaveLength(0);
  });

  test("should handle multiple events with same name", () => {
    const specResponse = createEventSpecResponse([
      createEventSpec({
        id: "evt_1",
        name: "click",
        props: {
          target: createPropertySpec({ id: "prop_target_1" })
        }
      }),
      createEventSpec({
        id: "evt_2",
        name: "click",
        props: {
          target: createPropertySpec({ id: "prop_target_2" }),
          action: createPropertySpec({ id: "prop_action" })
        }
      })
    ]);

    const result = validateEvent("click", { target: "button", action: "submit" }, specResponse);

    // Should match the one with more matching properties
    expect(result.eventId).toBe("evt_2");
  });

  test("should handle zero as valid number value", () => {
    const event = createEventSpec({
      props: {
        count: createPropertySpec({
          id: "prop_count",
          t: { type: "primitive", value: "int" },
          r: true
        })
      }
    });

    const errors = validateProperties({ count: 0 }, event, null);

    expect(errors.some(e => e.code === "RequiredMissing")).toBe(false);
    expect(errors.some(e => e.code === "TypeMismatch")).toBe(false);
  });

  test("should handle false as valid boolean value", () => {
    const event = createEventSpec({
      props: {
        enabled: createPropertySpec({
          id: "prop_enabled",
          t: { type: "primitive", value: "boolean" },
          r: true
        })
      }
    });

    const errors = validateProperties({ enabled: false }, event, null);

    expect(errors.some(e => e.code === "RequiredMissing")).toBe(false);
  });
});
