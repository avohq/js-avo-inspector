import { AvoBatcher } from "../AvoBatcher";
import { AvoDeduplicator } from "../AvoDeduplicator";
import { AvoInspector } from "../AvoInspector";
import type {
  EventProperty,
  EventSchemaBody,
  SessionStartedBody
} from "../AvoNetworkCallsHandler";

import { defaultOptions } from "./constants";

/** Type extracted for a property, or undefined when the property is absent. */
const typeOf = (
  properties: EventProperty[],
  propertyName: string
): string | undefined =>
  properties
    .filter((property) => property.propertyName === propertyName)
    .map((property) => property.propertyType)[0];

const storedEvents = (): EventSchemaBody[] => {
  const events: Array<SessionStartedBody | EventSchemaBody> | null =
    AvoInspector.avoStorage.getItem(AvoBatcher.cacheKey);

  expect(events).not.toBeNull();

  return (events ?? []).filter(
    (event) => event.type === "event"
  ) as EventSchemaBody[];
};

describe("TrackOptions - property-name collision", () => {
  test("event properties literally named outputReference/originHint/appVersion stay in eventProperties with their extracted types, while the top-level fields come from options", async () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);
    // avoStorage is a static set by the constructor, so clear it only after one exists.
    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);

    await inspector.trackSchemaFromEvent(
      "Gateway Event",
      {
        // Customer properties that happen to share the option names. These carry
        // unrelated business meaning and must be reported as ordinary properties.
        outputReference: "a property, not an option",
        originHint: 42,
        appVersion: true
      },
      { outputReference: "meta-x7k2q", originHint: "web" }
    );

    const events = storedEvents();
    expect(events.length).toEqual(1);

    const body = events[0];

    // The schema keeps all three properties, with the types extracted from the values.
    expect(body.eventProperties.length).toEqual(3);
    expect(typeOf(body.eventProperties, "outputReference")).toEqual("string");
    expect(typeOf(body.eventProperties, "originHint")).toEqual("int");
    expect(typeOf(body.eventProperties, "appVersion")).toEqual("boolean");

    // The top-level fields come from options only — never from the event data.
    expect(body.outputReference).toEqual("meta-x7k2q");
    expect(body.originHint).toEqual("web");

    // originHint present without an options.appVersion, so the body's appVersion
    // is a literal null rather than the SDK's configured version ("1").
    expect(body.appVersion).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(body, "appVersion")).toEqual(
      true
    );
  });

  test("options do not leak into eventProperties when the event has no colliding properties", async () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);
    // avoStorage is a static set by the constructor, so clear it only after one exists.
    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);

    await inspector.trackSchemaFromEvent(
      "Gateway Event",
      { amount: 99 },
      { outputReference: "meta-x7k2q", originHint: "web", appVersion: "5.1.0" }
    );

    const events = storedEvents();
    expect(events.length).toEqual(1);

    expect(events[0].eventProperties).toEqual([
      { propertyName: "amount", propertyType: "int" }
    ]);
    expect(events[0].appVersion).toEqual("5.1.0");
  });
});

describe("TrackOptions - primary use case: several outputReferences for the same event", () => {
  test("two trackSchemaFromEvent calls in the same tick, same event and deep-equal properties, different outputReference, produce two bodies with identical eventProperties and their own outputReference", async () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);
    // avoStorage is a static set by the constructor, so clear it only after one exists.
    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);

    // Same tick on purpose: this is the shape of a gateway fanning one event out
    // to several outputs behind a single Inspector API key.
    const first = inspector.trackSchemaFromEvent(
      "Purchase Completed",
      { amount: 99, currency: "USD" },
      { outputReference: "meta-x7k2q" }
    );
    const second = inspector.trackSchemaFromEvent(
      "Purchase Completed",
      { amount: 99, currency: "USD" },
      { outputReference: "tiktok-9f3q2" }
    );

    await Promise.all([first, second]);

    const events = storedEvents();

    // Neither call may be swallowed by deduplication — see the pin below.
    expect(events.length).toEqual(2);
    expect(events[0].eventName).toEqual("Purchase Completed");
    expect(events[1].eventName).toEqual("Purchase Completed");
    expect(events[0].eventProperties).toEqual(events[1].eventProperties);
    expect(events[0].eventProperties).toEqual([
      { propertyName: "amount", propertyType: "int" },
      { propertyName: "currency", propertyType: "string" }
    ]);

    expect(
      events.map((event) => event.outputReference).sort()
    ).toEqual(["meta-x7k2q", "tiktok-9f3q2"]);
  });

  test("the same holds for trackSchema", async () => {
    const inspector = new AvoInspector(defaultOptions);
    inspector.enableLogging(false);
    // avoStorage is a static set by the constructor, so clear it only after one exists.
    AvoInspector.avoStorage.removeItem(AvoBatcher.cacheKey);

    const schema = [{ propertyName: "amount", propertyType: "int" }];

    await Promise.all([
      inspector.trackSchema("Purchase Completed", schema, {
        outputReference: "meta-x7k2q"
      }),
      inspector.trackSchema("Purchase Completed", schema, {
        outputReference: "tiktok-9f3q2"
      })
    ]);

    const events = storedEvents();

    expect(events.length).toEqual(2);
    expect(events[0].eventProperties).toEqual(events[1].eventProperties);
    expect(
      events.map((event) => event.outputReference).sort()
    ).toEqual(["meta-x7k2q", "tiktok-9f3q2"]);
  });
});

describe("AvoDeduplicator - manual calls are only compared against Avo Codegen calls", () => {
  // The multi-output use case above depends on this asymmetry, so pin it here:
  // deduplication exists to drop a manual duplicate of a Codegen event, not to
  // collapse deliberate repeat calls the caller makes with different options.
  const params = { amount: 99, currency: "USD" };

  test("two identical manual calls both register", () => {
    const deduplicator = new AvoDeduplicator();

    expect(
      deduplicator.shouldRegisterEvent("Purchase Completed", { ...params }, false)
    ).toEqual(true);
    expect(
      deduplicator.shouldRegisterEvent("Purchase Completed", { ...params }, false)
    ).toEqual(true);
  });

  test("a manual call matching a preceding Avo Codegen call is still deduplicated", () => {
    const deduplicator = new AvoDeduplicator();

    expect(
      deduplicator.shouldRegisterEvent("Purchase Completed", { ...params }, true)
    ).toEqual(true);
    expect(
      deduplicator.shouldRegisterEvent("Purchase Completed", { ...params }, false)
    ).toEqual(false);
  });

  // CHARACTERIZATION TEST — pins behavior that is arguably wrong, so that the
  // fix has something to trip over rather than a paragraph in a PR thread.
  //
  // Owned by AVO-3560: "Inspector JS SDK: Codegen deduplication silently drops a
  // gateway-hinted manual call" — https://linear.app/avo/issue/AVO-3560
  //
  // `shouldRegisterEvent` takes only (eventName, params, fromAvoFunction). Gateway
  // options are not part of the identity it compares, so a hinted manual call that
  // deep-equals a Codegen call from the last 300 ms is dropped, and the observation
  // loses its outputReference/originHint with it.
  //
  // This is pre-existing: the same drop happened before TrackOptions existed, and
  // nothing in this PR made it more likely. What TrackOptions changes is the cost,
  // because the dropped call now carries gateway attribution the Codegen call
  // cannot. Fixing it means changing deduplication identity for every user, which
  // belongs in its own PR with its own ticket rather than riding along here.
  test("KNOWN GAP (AVO-3560): gateway options do not save a manual call from Codegen dedup", () => {
    const deduplicator = new AvoDeduplicator();

    expect(
      deduplicator.shouldRegisterEvent("Purchase Completed", { ...params }, true)
    ).toEqual(true);

    // Same name, deep-equal params, but bound for a specific gateway output. The
    // options never reach the deduplicator, so this is dropped anyway. When
    // AVO-3560 is fixed, this expectation flips to true and this test should be
    // rewritten as a positive assertion rather than deleted.
    expect(
      deduplicator.shouldRegisterEvent("Purchase Completed", { ...params }, false)
    ).toEqual(false);
  });
});
