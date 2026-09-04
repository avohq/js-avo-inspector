/**
 * The script-tag bootstrap, `src/browser.js`.
 *
 * The web GTM tag template never makes the HTTP call itself — it forwards to
 * this SDK — so it cannot set `X-Avo-Client` directly. Instead it writes
 * `window.inspector.__CLIENT__ = "gtm-web"` before the bundle loads, alongside
 * the `__API_KEY__` / `__ENV__` / `__VERSION__` / `__APP_NAME__` values it
 * already passes the same way. The bootstrap below is the only place that value
 * is ever read.
 *
 * That makes it a cross-repo handshake with nothing to fail loudly if it
 * breaks: drop the read and every GTM-originated browser event silently
 * reports as plain `"web"`, and the traffic can no longer be told apart at the
 * edge. These tests pin the read, its default, and the header it produces.
 */
import xhrMock from "../__mocks__/xhr";

import { defaultAvoClient } from "./constants";

/** The `__`-prefixed values the script-tag snippet hangs off `window.inspector`. */
type QueueProps = Partial<{
  __API_KEY__: string;
  __ENV__: string;
  __VERSION__: string;
  __APP_NAME__: string;
  __CLIENT__: string;
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

/** Header name → value, collapsed from the mock's setRequestHeader calls. */
const sentHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  xhrMock.setRequestHeader.mock.calls.forEach(
    ([name, value]: [string, string]) => {
      headers[name] = value;
    }
  );
  return headers;
};

/**
 * Bootstraps, then sends one session-started body through the inspector the
 * bootstrap built, and returns the headers that went out. Asserting on the wire
 * rather than on a field is deliberate: `X-Avo-Client` is what the edge reads.
 */
const headersAfterBootstrap = (
  props: QueueProps = {}
): Record<string, string> => {
  const handler = bootstrap(props).avoNetworkCallsHandler;
  const events = [handler.bodyForSessionStartedCall()];

  jest.clearAllMocks();
  handler.callInspectorWithBatchBody(events, jest.fn());

  return sentHeaders();
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

  test("forwards the api key and env the snippet carries", () => {
    const headers = headersAfterBootstrap();

    expect(headers["api-key"]).toBe(baseQueueProps.__API_KEY__);
    expect(headers.env).toBe(baseQueueProps.__ENV__);
  });
});

describe("__CLIENT__ handshake with the web GTM tag template", () => {
  test("sends X-Avo-Client: gtm-web when the template declared it", () => {
    // The exact value the web GTM tag template writes via setInWindow. If this
    // assertion ever fails, GTM traffic has stopped being attributable.
    expect(headersAfterBootstrap({ __CLIENT__: "gtm-web" })["X-Avo-Client"]).toBe(
      "gtm-web"
    );
  });

  test("defaults to web for a direct script-tag install", () => {
    // No __CLIENT__ at all: the ordinary case, a page that installed the SDK
    // itself rather than through a tag manager.
    expect(headersAfterBootstrap()["X-Avo-Client"]).toBe(defaultAvoClient);
    expect(headersAfterBootstrap()["X-Avo-Client"]).toBe("web");
  });

  test("an empty or absent __CLIENT__ is not an override", () => {
    expect(headersAfterBootstrap({ __CLIENT__: "" })["X-Avo-Client"]).toBe(
      "web"
    );
    expect(
      headersAfterBootstrap({ __CLIENT__: undefined })["X-Avo-Client"]
    ).toBe("web");
  });

  test("passes any token through verbatim, not just the GTM one", () => {
    // The bootstrap must not special-case "gtm-web": other Avo integrations
    // that embed this bundle get their own token the same way.
    expect(
      headersAfterBootstrap({ __CLIENT__: "some-other-embed" })["X-Avo-Client"]
    ).toBe("some-other-embed");
  });
});
