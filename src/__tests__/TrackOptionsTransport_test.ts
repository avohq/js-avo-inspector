/**
 * TrackOptions end to end, on each transport.
 *
 * `outputReference` and `originHint` are v2 fields. With a client configured
 * they reach the wire; without one the SDK is on v1, which has no such fields,
 * so they are left out of the request entirely. Avo Codegen calls never carry
 * them on either transport, and on v1 they keep the eventId/eventHash/
 * avoFunction tagging 3.2.0 sent.
 *
 * Everything here goes through the public constructors and track methods and
 * asserts on the request that actually went out.
 */
import { AvoInspector } from "../AvoInspector";
import { AvoInspectorLite } from "../lite/AvoInspectorLite";

import xhrMock from "../__mocks__/xhr";

import {
  defaultOptions,
  trackingEndpoint,
  trackingEndpointV2
} from "./constants";

interface Sent {
  url: string;
  events: any[];
}

/** The single request the flush produced. */
const theRequest = (): Sent => {
  expect(xhrMock.send).toHaveBeenCalledTimes(1);
  return {
    url: xhrMock.open.mock.calls[0][1],
    events: JSON.parse(xhrMock.send.mock.calls[0][0])
  };
};

const has = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key);

const options = {
  outputReference: "meta-x7k2q",
  originHint: "web",
  appVersion: "5.1.0"
};

/**
 * Empties the event cache. Must run BEFORE an inspector is constructed: the
 * batcher reads the cache during construction and would otherwise re-send an
 * earlier inspector's unacknowledged events in the same flush.
 */
const clearEventCache = (): void => {
  (global as any).__localStorageMock.clear();
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe.each([
  [
    "AvoInspector",
    (client?: string) => {
      clearEventCache();
      const inspector = new AvoInspector({ ...defaultOptions, client });
      inspector.enableLogging(false);
      // The constructor sets the static from the env, so override it after.
      AvoInspector.batchSize = 1;
      return inspector;
    }
  ],
  [
    "AvoInspectorLite",
    (client?: string) => {
      clearEventCache();
      const inspector = new AvoInspectorLite({ ...defaultOptions, client });
      inspector.enableLogging(false);
      AvoInspectorLite.batchSize = 1;
      return inspector;
    }
  ]
])("%s", (_name, newInspector) => {
  describe.each([
    ["trackSchemaFromEvent", (inspector: any, opts?: object) =>
      inspector.trackSchemaFromEvent("Purchase Completed", { amount: 99 }, opts)],
    ["trackSchema", (inspector: any, opts?: object) =>
      inspector.trackSchema(
        "Purchase Completed",
        [{ propertyName: "amount", propertyType: "int" }],
        opts
      )]
  ])("%s", (_method, track) => {
    test("without a client: v1, and outputReference/originHint never reach the wire", async () => {
      const inspector = newInspector();
      jest.clearAllMocks();

      await track(inspector, options);

      const { url, events } = theRequest();
      expect(url).toBe(trackingEndpoint);
      expect(events.length).toBe(1);
      expect(has(events[0], "outputReference")).toBe(false);
      expect(has(events[0], "originHint")).toBe(false);
      // appVersion is a v1 field and is still honored.
      expect(events[0].appVersion).toBe("5.1.0");
      expect(xhrMock.send.mock.calls[0][0]).not.toContain("meta-x7k2q");
    });

    test("with a client: v2, and both hints are on the wire", async () => {
      const inspector = newInspector("gtm-web");
      jest.clearAllMocks();

      await track(inspector, options);

      const { url, events } = theRequest();
      expect(url).toBe(trackingEndpointV2);
      expect(events.length).toBe(1);
      expect(events[0].outputReference).toBe("meta-x7k2q");
      expect(events[0].originHint).toBe("web");
      expect(events[0].appVersion).toBe("5.1.0");
    });

    test("originHint without appVersion: v1 sends the configured version, v2 sends null", async () => {
      const v1 = newInspector();
      jest.clearAllMocks();
      await track(v1, { originHint: "ios" });
      const v1Request = theRequest();
      expect(v1Request.url).toBe(trackingEndpoint);
      expect(v1Request.events[0].appVersion).toBe(defaultOptions.version);
      expect(xhrMock.send.mock.calls[0][0]).not.toContain('"appVersion":null');

      // Positive control: the same call over v2 does put a null on the wire.
      const v2 = newInspector("gtm-web");
      jest.clearAllMocks();
      await track(v2, { originHint: "ios" });
      const v2Request = theRequest();
      expect(v2Request.url).toBe(trackingEndpointV2);
      expect(v2Request.events[0].appVersion).toBeNull();
    });

    test("without options, v1 and v2 send the same event body", async () => {
      const v1 = newInspector();
      jest.clearAllMocks();
      await track(v1);
      const v1Event = theRequest().events[0];

      const v2 = newInspector("gtm-web");
      jest.clearAllMocks();
      await track(v2);
      const v2Event = theRequest().events[0];

      // messageId and createdAt are per event; everything else must match.
      expect({ ...v2Event, messageId: "", createdAt: "" }).toEqual({
        ...v1Event,
        messageId: "",
        createdAt: ""
      });
      expect(has(v1Event, "outputReference")).toBe(false);
      expect(has(v1Event, "originHint")).toBe(false);
    });
  });
});

describe("Avo Codegen (_avoFunctionTrackSchemaFromEvent) on each transport", () => {
  test.each([
    ["no client (v1)", undefined, trackingEndpoint],
    ["a client (v2)", "gtm-web", trackingEndpointV2]
  ])(
    "with %s: follows the transport selection, keeps eventId/eventHash/avoFunction, carries no hints",
    async (_description, client, endpoint) => {
      clearEventCache();
      const inspector = new AvoInspector({ ...defaultOptions, client });
      inspector.enableLogging(false);
      AvoInspector.batchSize = 1;
      jest.clearAllMocks();

      await (inspector as any)._avoFunctionTrackSchemaFromEvent(
        "Purchase Completed",
        { amount: 99 },
        "event id",
        "event hash"
      );

      const { url, events } = theRequest();
      expect(url).toBe(endpoint);
      expect(events.length).toBe(1);
      expect(events[0].avoFunction).toBe(true);
      expect(events[0].eventId).toBe("event id");
      expect(events[0].eventHash).toBe("event hash");
      expect(has(events[0], "outputReference")).toBe(false);
      expect(has(events[0], "originHint")).toBe(false);
      expect(events[0].appVersion).toBe(defaultOptions.version);
    }
  );
});
