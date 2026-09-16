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
    ["a lone newline", "\n"]
  ])("a %s __CLIENT__ is not a client, so v1", (_description, client) => {
    const sent = requestAfterBootstrap({ __CLIENT__: client });

    expect(sent.url).toBe(trackingEndpoint);
    expect(sent.headerCalls).toEqual([["Content-Type", "text/plain"]]);
  });

  test("passes any token through verbatim, not just the GTM one", () => {
    // The bootstrap must not special-case "gtm-web": other Avo integrations
    // that embed this bundle get v2 and their own token the same way.
    const sent = requestAfterBootstrap({ __CLIENT__: "some-other-embed" });

    expect(sent.url).toBe(trackingEndpointV2);
    expect(sent.headers["X-Avo-Client"]).toBe("some-other-embed");
  });
});
