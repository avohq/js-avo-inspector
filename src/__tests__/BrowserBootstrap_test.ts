/**
 * The script-tag bootstrap, `src/browser.js`.
 *
 * The web GTM tag template never makes the HTTP call itself — it forwards to
 * this SDK — so it cannot pick the transport or set `X-Avo-Client` directly.
 * Instead it writes `window.inspector.__CLIENT__ = "gtm-web"` before the bundle
 * loads, alongside the `__API_KEY__` / `__ENV__` / `__VERSION__` /
 * `__APP_NAME__` values it already passes the same way. The bootstrap below is
 * the only place that value is ever read.
 *
 * `__CLIENT__` does two things. It is the only way a script-tag page reaches
 * the v2 transport, and it is the attribution v2 sends. A page that does not
 * set it — every direct script-tag install — stays on v1 exactly as 3.2.0 sent
 * it. That makes it a cross-repo handshake with nothing to fail loudly if it
 * breaks: drop the read and every GTM-originated browser event silently goes
 * back to v1 and loses its gateway hints. These tests pin the read, the v1
 * default, and the request each produces.
 */
import xhrMock from "../__mocks__/xhr";

import { trackingEndpoint, trackingEndpointV2 } from "./constants";

/** The `__`-prefixed values the script-tag snippet hangs off `window.inspector`. */
type QueueProps = Partial<{
  __API_KEY__: string;
  __ENV__: string;
  __VERSION__: string;
  __APP_NAME__: string;
  __CLIENT__: unknown;
}>;

/** What a page sets before loading the bundle, minus the client override. */
const baseQueueProps = {
  __API_KEY__: "api-key-xxx",
  __ENV__: "prod",
  __VERSION__: "1",
  __APP_NAME__: "test-app"
};

/**
 * Installs the pre-load `window.inspector` call queue, runs the bootstrap, and
 * returns whatever it left on the window — an `AvoInspector` when it worked.
 *
 * `jest.resetModules()` is what lets the bootstrap run more than once: it is a
 * side-effecting module body, so without a fresh registry the second `require`
 * would be a no-op cache hit. The module the bootstrap pulls in is therefore
 * also fresh, which is why the assertions below read the class back out of the
 * same registry rather than from a top-level import.
 */
const bootstrap = (props: QueueProps = {}): any => {
  const callQueue: any[] = [];
  Object.assign(callQueue, baseQueueProps, props);
  (window as any).inspector = callQueue;

  jest.resetModules();
  require("../browser");

  return (window as any).inspector;
};

interface SentRequest {
  url: string;
  headers: Record<string, string>;
  headerCalls: Array<[string, string]>;
  body: any;
}

/**
 * Bootstraps, then sends one session-started body through the inspector the
 * bootstrap built, and returns the request that went out. Asserting on the wire
 * rather than on a field is deliberate: the URL and `X-Avo-Client` are what the
 * edge reads.
 */
const requestAfterBootstrap = (props: QueueProps = {}): SentRequest => {
  const handler = bootstrap(props).avoNetworkCallsHandler;
  const events = [handler.bodyForSessionStartedCall()];

  jest.clearAllMocks();
  handler.callInspectorWithBatchBody(events, jest.fn());

  const headerCalls = xhrMock.setRequestHeader.mock.calls.map(
    ([name, value]: [string, string]) => [name, value] as [string, string]
  );
  return {
    url: xhrMock.open.mock.calls[0][1],
    headers: Object.fromEntries(headerCalls),
    headerCalls,
    body: JSON.parse(xhrMock.send.mock.calls[0][0])
  };
};

afterEach(() => {
  jest.clearAllMocks();
  delete (window as any).inspector;
});

describe("script-tag bootstrap", () => {
  test("replaces the call queue on the window with a live inspector", () => {
    const inspector = bootstrap();

    expect(Array.isArray(inspector)).toBe(false);
    expect(typeof inspector.trackSchemaFromEvent).toBe("function");
    expect(typeof inspector.trackSchema).toBe("function");
  });

  test("replays the calls the page queued before the bundle loaded", () => {
    (window as any).inspector = undefined;

    const callQueue: any[] = [["setBatchSize", 11]];
    Object.assign(callQueue, baseQueueProps);
    (window as any).inspector = callQueue;

    jest.resetModules();
    require("../browser");

    // setBatchSize writes the static, so reading it back proves the queued call
    // reached the instance. It must come from the registry the bootstrap used.
    const { AvoInspector } = require("../AvoInspector");
    expect(AvoInspector.batchSize).toBe(11);
  });

  test("forwards the api key and env the snippet carries, in the body on v1", () => {
    const { body } = requestAfterBootstrap();

    expect(body[0].apiKey).toBe(baseQueueProps.__API_KEY__);
    expect(body[0].env).toBe(baseQueueProps.__ENV__);
  });

  test("forwards the api key and env the snippet carries, in headers on v2", () => {
    const { headers } = requestAfterBootstrap({ __CLIENT__: "gtm-web" });

    expect(headers["api-key"]).toBe(baseQueueProps.__API_KEY__);
    expect(headers.env).toBe(baseQueueProps.__ENV__);
  });
});

describe("__CLIENT__ handshake with the web GTM tag template", () => {
  test("gtm-web selects v2 and sends X-Avo-Client: gtm-web", () => {
    // The exact value the web GTM tag template writes via setInWindow. If this
    // assertion ever fails, GTM traffic has stopped reaching v2.
    const sent = requestAfterBootstrap({ __CLIENT__: "gtm-web" });

    expect(sent.url).toBe(trackingEndpointV2);
    expect(sent.headerCalls).toEqual([
      ["Content-Type", "application/json"],
      ["api-key", baseQueueProps.__API_KEY__],
      ["env", baseQueueProps.__ENV__],
      ["X-Avo-Client", "gtm-web"]
    ]);
  });

  test("a direct script-tag install without __CLIENT__ stays on v1", () => {
    // The ordinary case: a page that installed the SDK itself rather than
    // through a tag manager. The byte-level pin is in V1WireBaseline_test.ts.
    const sent = requestAfterBootstrap();

    expect(sent.url).toBe(trackingEndpoint);
    expect(sent.headerCalls).toEqual([["Content-Type", "text/plain"]]);
  });

  test.each([
    ["empty", ""],
    ["absent", undefined],
    ["whitespace only", "   "],
    ["a lone newline", "\n"],
    ["web", "web"],
    ["gtm-server", "gtm-server"],
    ["GTM-WEB", "GTM-WEB"],
    ["some other embed's token", "some-other-embed"],
    ["the number 42", 42]
  ])("a %s __CLIENT__ is not the web GTM template, so v1", (_description, client) => {
    const sent = requestAfterBootstrap({ __CLIENT__: client });

    expect(sent.url).toBe(trackingEndpoint);
    expect(sent.headerCalls).toEqual([["Content-Type", "text/plain"]]);
  });

  test("gtm-web with surrounding whitespace is trimmed and selects v2", () => {
    const sent = requestAfterBootstrap({ __CLIENT__: " gtm-web " });

    expect(sent.url).toBe(trackingEndpointV2);
    expect(sent.headers["X-Avo-Client"]).toBe("gtm-web");
  });
});

/**
 * The web GTM tag template's call: `callInWindow('inspector.trackSchemaFromEvent',
 * event, props, hints)`, with hints only when the tag has any. It reaches either
 * the live instance or, before the bundle has loaded, the loader stub, whose
 * queue the bootstrap replays.
 */
describe("gateway options through the window call (web GTM template)", () => {
  const hints = {
    outputReference: "meta-x7k2q",
    originHint: "web",
    appVersion: "5.1.0"
  };

  async function waitFor(condition: () => boolean): Promise<void> {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > 1000) {
        throw new Error("Timed out waiting for condition");
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  /** The URL and event bodies of the one request a flush produced. */
  const theRequest = async (): Promise<{ url: string; events: any[] }> => {
    await waitFor(() => xhrMock.send.mock.calls.length > 0);
    expect(xhrMock.send).toHaveBeenCalledTimes(1);
    return {
      url: xhrMock.open.mock.calls[0][1],
      events: JSON.parse(xhrMock.send.mock.calls[0][0])
    };
  };

  const has = (object: object, key: string): boolean =>
    Object.prototype.hasOwnProperty.call(object, key);

  /** Bootstraps a live instance that flushes every event. */
  const liveInspector = (props: QueueProps): any => {
    const inspector = bootstrap(props);
    inspector.setBatchSize(1);
    jest.clearAllMocks();
    return inspector;
  };

  test("gtm-web + trackSchemaFromEvent with a third argument: v2 with the hints", async () => {
    const inspector = liveInspector({ __CLIENT__: "gtm-web" });

    await inspector.trackSchemaFromEvent("Ev", { a: 1 }, hints);

    const { url, events } = await theRequest();
    expect(url).toBe(trackingEndpointV2);
    expect(events[0].outputReference).toBe("meta-x7k2q");
    expect(events[0].originHint).toBe("web");
    expect(events[0].appVersion).toBe("5.1.0");
  });

  test("gtm-web + trackSchemaFromEvent with two arguments: v2 without them (control for the test above)", async () => {
    const inspector = liveInspector({ __CLIENT__: "gtm-web" });

    await inspector.trackSchemaFromEvent("Ev", { a: 1 });

    const { url, events } = await theRequest();
    expect(url).toBe(trackingEndpointV2);
    expect(has(events[0], "outputReference")).toBe(false);
    expect(has(events[0], "originHint")).toBe(false);
    expect(events[0].appVersion).toBe(baseQueueProps.__VERSION__);
  });

  test("gtm-web + trackSchema with a third argument: v2 with the hints", async () => {
    const inspector = liveInspector({ __CLIENT__: "gtm-web" });

    await inspector.trackSchema(
      "Ev",
      [{ propertyName: "a", propertyType: "int" }],
      hints
    );

    const { url, events } = await theRequest();
    expect(url).toBe(trackingEndpointV2);
    expect(events[0].outputReference).toBe("meta-x7k2q");
    expect(events[0].originHint).toBe("web");
  });

  test("the wrapper does not depend on how it is invoked (detached from the instance)", async () => {
    const inspector = liveInspector({ __CLIENT__: "gtm-web" });
    const detached = inspector.trackSchemaFromEvent;

    await detached("Ev", { a: 1 }, { outputReference: "meta-x7k2q" });

    const { events } = await theRequest();
    expect(events[0].outputReference).toBe("meta-x7k2q");
  });

  test("without __CLIENT__ a third argument is inert: v1, no hints, the configured version", async () => {
    const inspector = liveInspector({});

    await inspector.trackSchemaFromEvent("Ev", { a: 1 }, hints);

    const { url, events } = await theRequest();
    expect(url).toBe(trackingEndpoint);
    expect(has(events[0], "outputReference")).toBe(false);
    expect(has(events[0], "originHint")).toBe(false);
    expect(events[0].appVersion).toBe(baseQueueProps.__VERSION__);
  });

  describe("calls queued on the loader stub before the bundle loaded", () => {
    /**
     * Installs the real loader stub (src/script.js), sets the snippet values on
     * it the way the template does, queues calls through it, then loads the
     * bundle.
     */
    const bootstrapAfterQueuedCalls = (
      props: QueueProps,
      queue: (stub: any) => void
    ): void => {
      delete (window as any).inspector;
      jest.isolateModules(() => {
        require("../script");
      });
      const stub = (window as any).inspector;
      Object.assign(stub, baseQueueProps, props);
      stub.setBatchSize(1);
      queue(stub);

      jest.clearAllMocks();
      jest.resetModules();
      require("../browser");
    };

    test("a queued three-argument trackSchemaFromEvent replays with its hints", async () => {
      bootstrapAfterQueuedCalls({ __CLIENT__: "gtm-web" }, (stub) => {
        stub.trackSchemaFromEvent("Ev", { a: 1 }, hints);
      });

      const { url, events } = await theRequest();
      expect(url).toBe(trackingEndpointV2);
      expect(events[0].eventName).toBe("Ev");
      expect(events[0].outputReference).toBe("meta-x7k2q");
      expect(events[0].originHint).toBe("web");
      expect(events[0].appVersion).toBe("5.1.0");
    });

    test("a queued two-argument trackSchemaFromEvent replays without hints (control)", async () => {
      bootstrapAfterQueuedCalls({ __CLIENT__: "gtm-web" }, (stub) => {
        stub.trackSchemaFromEvent("Ev", { a: 1 });
      });

      const { url, events } = await theRequest();
      expect(url).toBe(trackingEndpointV2);
      expect(events[0].eventName).toBe("Ev");
      expect(has(events[0], "outputReference")).toBe(false);
    });
  });
});
