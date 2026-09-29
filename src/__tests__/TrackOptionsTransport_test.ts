/**
 * Internal web GTM template support, end to end, on each transport.
 *
 * Gateway options reach the SDK only through the private `_…WithOptions`
 * methods (the script-tag bootstrap routes the template's third argument
 * there), and a client only through the untyped `_client` option. They matter
 * only on v2, which only the client "gtm-web" selects: with it, the hints reach
 * the wire; without it, the options are ignored entirely — the appVersion
 * override included — so the request is 3.2.0's. Avo Codegen calls never carry
 * the hints on either transport and keep eventId/eventHash/avoFunction.
 *
 * Everything here asserts on the request that actually went out.
 */
import { AvoInspector } from "../AvoInspector";
import { AvoInspectorLite } from "../lite/AvoInspectorLite";

import xhrMock from "../__mocks__/xhr";

import {
  defaultOptions,
  trackingEndpoint,
  trackingEndpointV2
} from "./constants";
import {
  type GatewayOptions,
  trackSchemaFromEventWithOptions,
  trackSchemaWithOptions,
  withClient
} from "./helpers/internalGateway";

interface Sent {
  url: string;
  events: any[];
  raw: string;
}

/** The single request the flush produced. */
const theRequest = (): Sent => {
  expect(xhrMock.send).toHaveBeenCalledTimes(1);
  return {
    url: xhrMock.open.mock.calls[0][1],
    events: JSON.parse(xhrMock.send.mock.calls[0][0]),
    raw: xhrMock.send.mock.calls[0][0]
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

/** messageId and createdAt are per event; everything else must match. */
const comparable = (event: any) => ({ ...event, messageId: "", createdAt: "" });

beforeEach(() => {
  jest.clearAllMocks();
});

describe.each([
  [
    "AvoInspector",
    (client?: string) => {
      clearEventCache();
      const inspector = new AvoInspector(withClient(defaultOptions, client));
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
      const inspector = new AvoInspectorLite(withClient(defaultOptions, client));
      inspector.enableLogging(false);
      AvoInspectorLite.batchSize = 1;
      return inspector;
    }
  ]
])("%s", (_name, newInspector) => {
  describe.each([
    [
      "trackSchemaFromEvent",
      (inspector: any, opts?: GatewayOptions) =>
        trackSchemaFromEventWithOptions(
          inspector,
          "Purchase Completed",
          { amount: 99 },
          opts
        ),
      (inspector: any) =>
        inspector.trackSchemaFromEvent("Purchase Completed", { amount: 99 })
    ],
    [
      "trackSchema",
      (inspector: any, opts?: GatewayOptions) =>
        trackSchemaWithOptions(
          inspector,
          "Purchase Completed",
          [{ propertyName: "amount", propertyType: "int" }],
          opts
        ),
      (inspector: any) =>
        inspector.trackSchema("Purchase Completed", [
          { propertyName: "amount", propertyType: "int" }
        ])
    ]
  ])("internal %s", (_method, trackWithOptions, trackPublic) => {
    test("without a client: v1, and the options are ignored entirely, appVersion included", async () => {
      const withOptions = newInspector();
      jest.clearAllMocks();
      await trackWithOptions(withOptions, options);
      const sentWithOptions = theRequest();

      const publicCall = newInspector();
      jest.clearAllMocks();
      await trackPublic(publicCall);
      const sentPublic = theRequest();

      expect(sentWithOptions.url).toBe(trackingEndpoint);
      expect(has(sentWithOptions.events[0], "outputReference")).toBe(false);
      expect(has(sentWithOptions.events[0], "originHint")).toBe(false);
      expect(sentWithOptions.events[0].appVersion).toBe(defaultOptions.version);
      expect(sentWithOptions.raw).not.toContain("5.1.0");
      // The same body as the plain public call.
      expect(sentWithOptions.events.map(comparable)).toEqual(
        sentPublic.events.map(comparable)
      );
    });

    test("with gtm-web: v2, and both hints and the appVersion are on the wire (control)", async () => {
      const inspector = newInspector("gtm-web");
      jest.clearAllMocks();

      await trackWithOptions(inspector, options);

      const { url, events } = theRequest();
      expect(url).toBe(trackingEndpointV2);
      expect(events.length).toBe(1);
      expect(events[0].outputReference).toBe("meta-x7k2q");
      expect(events[0].originHint).toBe("web");
      expect(events[0].appVersion).toBe("5.1.0");
    });

    test("with any other client (web): v1, options ignored", async () => {
      const inspector = newInspector("web");
      jest.clearAllMocks();

      await trackWithOptions(inspector, options);

      const { url, events } = theRequest();
      expect(url).toBe(trackingEndpoint);
      expect(has(events[0], "outputReference")).toBe(false);
      expect(events[0].appVersion).toBe(defaultOptions.version);
    });

    test("originHint without appVersion: v2 sends null, v1 the configured version", async () => {
      const v2 = newInspector("gtm-web");
      jest.clearAllMocks();
      await trackWithOptions(v2, { originHint: "ios" });
      expect(theRequest().events[0].appVersion).toBeNull();

      const v1 = newInspector();
      jest.clearAllMocks();
      await trackWithOptions(v1, { originHint: "ios" });
      const v1Request = theRequest();
      expect(v1Request.events[0].appVersion).toBe(defaultOptions.version);
      expect(v1Request.raw).not.toContain('"appVersion":null');
    });

    test("no warnings about options on either transport", async () => {
      const warn = console.warn as jest.Mock;
      const shouldLog = (on: boolean) => {
        AvoInspector.shouldLog = on;
        AvoInspectorLite.shouldLog = on;
      };
      try {
        for (const client of [undefined, "gtm-web"]) {
          const inspector = newInspector(client);
          shouldLog(true);
          warn.mockClear();

          await trackWithOptions(inspector, { originHint: "ios" });
          await trackWithOptions(inspector, { outputReference: "meta-x7k2q" });

          expect(warn).not.toHaveBeenCalled();
        }

        // Positive control that console.warn is observed with logging on: the
        // full build's extractSchema warns on a Codegen-duplicate payload.
        const inspector = new AvoInspector(defaultOptions);
        shouldLog(true);
        warn.mockClear();
        await (inspector as any)._avoFunctionTrackSchemaFromEvent(
          "Dup",
          { x: 1 },
          "id",
          "hash"
        );
        await inspector.extractSchema({ x: 1 });
        expect(warn).toHaveBeenCalled();
      } finally {
        shouldLog(false);
      }
    });
  });
});

describe("Avo Codegen (_avoFunctionTrackSchemaFromEvent) on each transport", () => {
  test.each([
    ["no client (v1)", undefined, trackingEndpoint],
    ["gtm-web (v2)", "gtm-web", trackingEndpointV2]
  ])(
    "with %s: follows the transport selection, keeps eventId/eventHash/avoFunction, carries no hints",
    async (_description, client, endpoint) => {
      clearEventCache();
      const inspector = new AvoInspector(withClient(defaultOptions, client));
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
