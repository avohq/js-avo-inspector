/**
 * The v2 wire contract: one unified endpoint, the api key and env moved into
 * request headers, and an X-Avo-Client header so the edge can attribute traffic
 * without decoding a body.
 */
import { AvoInspector } from "../AvoInspector";
import { AvoInspectorLite } from "../lite/AvoInspectorLite";
import { AvoNetworkCallsHandler } from "../AvoNetworkCallsHandler";
import { AvoNetworkCallsHandlerLite } from "../lite/AvoNetworkCallsHandlerLite";
import { AvoStreamId } from "../AvoStreamId";

import xhrMock from "../__mocks__/xhr";

import {
  defaultAvoClient,
  defaultOptions,
  trackingEndpoint
} from "./constants";

const inspectorVersion = process.env.npm_package_version || "";

const { apiKey, env, version } = defaultOptions;

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

/** Sends one session-started body through `handler` and returns the headers. */
const headersFromOneSend = (handler: {
  bodyForSessionStartedCall: () => any;
  callInspectorWithBatchBody: (
    events: any[],
    onCompleted: (error: Error | null) => any
  ) => void;
}): Record<string, string> => {
  const events = [handler.bodyForSessionStartedCall()];
  jest.clearAllMocks();
  handler.callInspectorWithBatchBody(events, jest.fn());
  return sentHeaders();
};

beforeAll(() => {
  jest
    .spyOn(AvoStreamId as any, "streamId", "get")
    .mockImplementation(() => "stream-id");
});

afterEach(() => {
  jest.clearAllMocks();
});

describe.each([
  [
    "full build",
    (client?: string) =>
      new AvoNetworkCallsHandler(
        apiKey,
        env,
        "",
        version,
        inspectorVersion,
        undefined, // publicEncryptionKey
        client
      )
  ],
  [
    "lite build",
    (client?: string) =>
      new AvoNetworkCallsHandlerLite(
        apiKey,
        env,
        "",
        version,
        inspectorVersion,
        client
      )
  ]
])("v2 tracking request (%s)", (_name, newHandler) => {
  test("posts to the unified v2 endpoint", () => {
    const handler = newHandler();
    const events = [handler.bodyForSessionStartedCall()];

    jest.clearAllMocks();
    handler.callInspectorWithBatchBody(events, jest.fn());

    expect(xhrMock.open).toHaveBeenCalledTimes(1);
    expect(xhrMock.open).toHaveBeenCalledWith("POST", trackingEndpoint, true);
    expect(trackingEndpoint).toBe("https://api.avo.app/inspector/v2/track");
  });

  test("sends api-key, env and X-Avo-Client alongside a JSON content type", () => {
    const headers = headersFromOneSend(newHandler());

    expect(headers["api-key"]).toBe(apiKey);
    expect(headers.env).toBe(env);
    expect(headers["X-Avo-Client"]).toBe(defaultAvoClient);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("X-Avo-Client defaults to web when no client is given", () => {
    expect(headersFromOneSend(newHandler())["X-Avo-Client"]).toBe("web");
    expect(headersFromOneSend(newHandler(undefined))["X-Avo-Client"]).toBe(
      "web"
    );
    // An empty override is not an override.
    expect(headersFromOneSend(newHandler(""))["X-Avo-Client"]).toBe("web");
  });

  test("X-Avo-Client carries the override the embedding integration passes", () => {
    expect(headersFromOneSend(newHandler("gtm-web"))["X-Avo-Client"]).toBe(
      "gtm-web"
    );
  });

  test("the body still carries apiKey and env, which v2 takes from the headers", () => {
    const handler = newHandler();
    const events = [handler.bodyForSessionStartedCall()];

    jest.clearAllMocks();
    handler.callInspectorWithBatchBody(events, jest.fn());

    // One body shape across endpoint versions: v2 ignores these copies rather
    // than rejecting them, and keeping them keeps the JSON schema unchanged.
    const body = JSON.parse(xhrMock.send.mock.calls[0][0]);
    expect(body[0].apiKey).toBe(apiKey);
    expect(body[0].env).toBe(env);
  });

  test("no Content-Encoding header on an uncompressed send", () => {
    expect(headersFromOneSend(newHandler())["Content-Encoding"]).toBeUndefined();
  });

  test("every platform token in the contract survives normalization", () => {
    // The normalizer must not be so strict that it rejects real senders. These
    // are the X-Avo-Client values the other Avo SDKs and templates send.
    [
      "web",
      "gtm-web",
      "gtm-server",
      "ios",
      "android",
      "node",
      "csharp",
      "ruby",
      "go"
    ].forEach((token) => {
      expect(headersFromOneSend(newHandler(token))["X-Avo-Client"]).toBe(token);
    });
  });

  test("X-Avo-Client recovers a token with surrounding whitespace", () => {
    // A value copied out of a config file keeps its trailing newline. Trimming
    // it preserves the attribution rather than silently downgrading to "web".
    expect(headersFromOneSend(newHandler("gtm-web\n"))["X-Avo-Client"]).toBe(
      "gtm-web"
    );
    expect(headersFromOneSend(newHandler("  gtm-web  "))["X-Avo-Client"]).toBe(
      "gtm-web"
    );
  });

  test("X-Avo-Client falls back to web for a value that cannot be a header", () => {
    // setRequestHeader throws on these, which would take the whole batcher down
    // (see the wedge test below). Losing the label beats losing every event.
    // The last two are the WebIDL ByteString case: any code unit above U+00FF
    // throws a TypeError before the request is ever sent.
    [
      "gtm\nweb",
      "gtm web",
      "gtm:web",
      "x".repeat(65),
      "gtm-wéb",
      "gtm-web🚀"
    ].forEach((bad) => {
      expect(headersFromOneSend(newHandler(bad))["X-Avo-Client"]).toBe("web");
    });
  });

  test("a rejected header reports through onCompleted instead of throwing", () => {
    const handler = newHandler();
    const onCompleted = jest.fn();

    jest.clearAllMocks();
    xhrMock.setRequestHeader.mockImplementationOnce(() => {
      throw new SyntaxError("Failed to execute 'setRequestHeader'");
    });

    expect(() => {
      handler.callInspectorWithBatchBody(
        [handler.bodyForSessionStartedCall()],
        onCompleted
      );
    }).not.toThrow();

    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCompleted.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(xhrMock.send).not.toHaveBeenCalled();
  });

  test("a rejected header does not latch the sending guard", () => {
    // The regression that matters. `sending` is cleared only from the completion
    // callback, so an exception escaping the synchronous setup would leave it
    // true and make every later batch return the "another batch sending is in
    // progress" error for the rest of the page.
    const handler = newHandler();

    jest.clearAllMocks();
    xhrMock.setRequestHeader.mockImplementationOnce(() => {
      throw new SyntaxError("Failed to execute 'setRequestHeader'");
    });
    handler.callInspectorWithBatchBody(
      [handler.bodyForSessionStartedCall()],
      jest.fn()
    );

    const secondBatch = jest.fn();
    handler.callInspectorWithBatchBody(
      [handler.bodyForSessionStartedCall()],
      secondBatch
    );

    expect(xhrMock.send).toHaveBeenCalledTimes(1);
    expect(secondBatch).not.toHaveBeenCalled();
  });
});

describe("client option wiring", () => {
  /** The handler an inspector instance actually sends through. */
  const handlerOf = (inspector: any): any => inspector.avoNetworkCallsHandler;

  test("AvoInspector defaults X-Avo-Client to web", () => {
    const headers = headersFromOneSend(
      handlerOf(new AvoInspector(defaultOptions))
    );

    expect(headers["X-Avo-Client"]).toBe("web");
    expect(headers["api-key"]).toBe(apiKey);
  });

  test("AvoInspector forwards a client option to the header", () => {
    const headers = headersFromOneSend(
      handlerOf(new AvoInspector({ ...defaultOptions, client: "gtm-web" }))
    );

    expect(headers["X-Avo-Client"]).toBe("gtm-web");
  });

  test("AvoInspectorLite defaults X-Avo-Client to web", () => {
    const headers = headersFromOneSend(
      handlerOf(new AvoInspectorLite(defaultOptions))
    );

    expect(headers["X-Avo-Client"]).toBe("web");
  });

  test("AvoInspectorLite forwards a client option to the header", () => {
    const headers = headersFromOneSend(
      handlerOf(new AvoInspectorLite({ ...defaultOptions, client: "gtm-web" }))
    );

    expect(headers["X-Avo-Client"]).toBe("gtm-web");
  });
});
