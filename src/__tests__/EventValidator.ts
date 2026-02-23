import { validateEvent } from "../eventSpec/EventValidator";
import type {
  EventSpecResponse,
  EventSpecEntry,
} from "../eventSpec/AvoEventSpecFetchTypes";

function makeSpecResponse(
  events: EventSpecEntry[],
  branchId: string = "branch1"
): EventSpecResponse {
  return {
    events,
    metadata: {
      schemaId: "schema1",
      branchId,
      latestActionId: "action1",
    },
  };
}

function makeEvent(
  id: string,
  props: Record<string, any>,
  variantIds: string[] = []
): EventSpecEntry {
  return {
    branchId: "branch1",
    baseEventId: id,
    variantIds,
    props,
  };
}

describe("EventValidator", () => {
  describe("pinned values", () => {
    test("passes when value matches pinned value", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          method: {
            type: "string",
            required: true,
            pinnedValues: { email: ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ method: "email" }, spec);
      expect(result.propertyResults.method.failedEventIds).toBeUndefined();
      expect(result.propertyResults.method.passedEventIds).toBeUndefined();
    });

    test("fails when value does not match pinned value", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          method: {
            type: "string",
            required: true,
            pinnedValues: { email: ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ method: "phone" }, spec);
      expect(result.propertyResults.method.failedEventIds).toContain("evt_1");
    });
  });

  describe("allowed values", () => {
    test("passes when value is in allowed list", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          status: {
            type: "string",
            required: true,
            allowedValues: { '["active","inactive"]': ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ status: "active" }, spec);
      expect(result.propertyResults.status.failedEventIds).toBeUndefined();
    });

    test("fails when value is not in allowed list", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          status: {
            type: "string",
            required: true,
            allowedValues: { '["active","inactive"]': ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ status: "deleted" }, spec);
      expect(result.propertyResults.status.failedEventIds).toContain("evt_1");
    });
  });

  describe("regex patterns", () => {
    test("passes when value matches regex", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          email: {
            type: "string",
            required: true,
            regexPatterns: { "^[^@]+@[^@]+$": ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ email: "user@example.com" }, spec);
      expect(result.propertyResults.email.failedEventIds).toBeUndefined();
    });

    test("fails when value does not match regex", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          email: {
            type: "string",
            required: true,
            regexPatterns: { "^[^@]+@[^@]+$": ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ email: "invalid" }, spec);
      expect(result.propertyResults.email.failedEventIds).toContain("evt_1");
    });

    test("safe-regex2: unsafe regex patterns are skipped with warning", async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation();

      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          input: {
            type: "string",
            required: true,
            regexPatterns: { "(a+)+$": ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ input: "aaaaaa" }, spec);

      // Unsafe pattern should be skipped, not cause failure
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[Avo Inspector] Warning: unsafe regex pattern skipped")
      );

      warnSpy.mockRestore();
    });

    test("non-string values fail all regex constraints", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          code: {
            type: "string",
            required: true,
            regexPatterns: { "^[0-9]+$": ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ code: 12345 }, spec);
      expect(result.propertyResults.code.failedEventIds).toContain("evt_1");
    });
  });

  describe("min/max ranges", () => {
    test("passes when value is within range", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          age: {
            type: "int",
            required: true,
            minMaxRanges: { "0,120": ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ age: 25 }, spec);
      expect(result.propertyResults.age.failedEventIds).toBeUndefined();
    });

    test("fails when value is below minimum", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          age: {
            type: "int",
            required: true,
            minMaxRanges: { "0,120": ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ age: -1 }, spec);
      expect(result.propertyResults.age.failedEventIds).toContain("evt_1");
    });

    test("fails when value is above maximum", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          age: {
            type: "int",
            required: true,
            minMaxRanges: { "0,120": ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ age: 150 }, spec);
      expect(result.propertyResults.age.failedEventIds).toContain("evt_1");
    });

    test("handles open-ended ranges (min only)", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          score: {
            type: "int",
            required: true,
            minMaxRanges: { "0,": ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ score: 999999 }, spec);
      expect(result.propertyResults.score.failedEventIds).toBeUndefined();
    });

    test("non-numeric values fail all min/max constraints", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          count: {
            type: "int",
            required: true,
            minMaxRanges: { "0,100": ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ count: "fifty" }, spec);
      expect(result.propertyResults.count.failedEventIds).toContain("evt_1");
    });
  });

  describe("bandwidth optimization", () => {
    test("returns passedEventIds when strictly smaller than failedEventIds", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          method: {
            type: "string",
            required: true,
            pinnedValues: {
              email: ["evt_1"],
              phone: ["evt_2"],
              sms: ["evt_3"],
            },
          },
        }, ["evt_2", "evt_3"]),
      ]);

      // value is "email" - matches evt_1's pinned, fails evt_2 and evt_3
      const result = await validateEvent({ method: "email" }, spec);
      const propResult = result.propertyResults.method;

      // evt_1 passes, evt_2 and evt_3 fail
      // passedEventIds=[evt_1] (len 1) < failedEventIds=[evt_2, evt_3] (len 2)
      // So passedEventIds should be returned
      expect(propResult.passedEventIds).toEqual(["evt_1"]);
      expect(propResult.failedEventIds).toBeUndefined();
    });
  });

  describe("property not in spec", () => {
    test("returns empty result for unknown properties", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          method: { type: "string", required: true },
        }),
      ]);

      const result = await validateEvent(
        { method: "email", extraProp: "value" },
        spec
      );
      expect(result.propertyResults.extraProp).toEqual({});
    });
  });

  describe("null/undefined on non-required properties", () => {
    test("skips validation for null on non-required primitive property", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          nickname: {
            type: "string",
            required: false,
            pinnedValues: { "some-name": ["evt_1"] },
          },
        }),
      ]);

      const result = await validateEvent({ nickname: null }, spec);
      expect(result.propertyResults.nickname.failedEventIds).toBeUndefined();
    });
  });

  describe("nested object properties", () => {
    test("validates children of object properties", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          address: {
            type: "object",
            required: true,
            children: {
              country: {
                type: "string",
                required: true,
                pinnedValues: { US: ["evt_1"] },
              },
            },
          },
        }),
      ]);

      const result = await validateEvent(
        { address: { country: "UK" } },
        spec
      );
      expect(
        result.propertyResults.address.children?.country.failedEventIds
      ).toContain("evt_1");
    });
  });

  describe("list properties", () => {
    test("validates each item in a list against constraints", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          tags: {
            type: "string",
            required: true,
            isList: true,
            allowedValues: { '["red","green","blue"]': ["evt_1"] },
          },
        }),
      ]);

      // One invalid item should fail
      const result = await validateEvent(
        { tags: ["red", "yellow"] },
        spec
      );
      expect(result.propertyResults.tags.failedEventIds).toContain("evt_1");
    });
  });

  describe("metadata", () => {
    test("returns metadata from the spec response", async () => {
      const spec = makeSpecResponse(
        [makeEvent("evt_1", {})],
        "my-branch"
      );

      const result = await validateEvent({ anything: "value" }, spec);
      expect(result.metadata).toEqual({
        schemaId: "schema1",
        branchId: "my-branch",
        latestActionId: "action1",
      });
    });
  });

  describe("multiple events", () => {
    test("aggregates constraints from multiple events", async () => {
      const spec = makeSpecResponse([
        makeEvent("evt_1", {
          method: {
            type: "string",
            required: true,
            pinnedValues: { email: ["evt_1"] },
          },
        }),
        makeEvent("evt_2", {
          method: {
            type: "string",
            required: true,
            pinnedValues: { phone: ["evt_2"] },
          },
        }),
      ]);

      // "email" matches evt_1 but not evt_2
      const result = await validateEvent({ method: "email" }, spec);
      expect(result.propertyResults.method.failedEventIds).toContain("evt_2");
    });
  });
});
