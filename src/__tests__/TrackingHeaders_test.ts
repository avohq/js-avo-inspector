/**
 * Transport selection, and the request each transport sends.
 *
 * The transport is chosen once, when the handler is constructed: a configured
 * client selects v2 (`/inspector/v2/track`, JSON body, the api key and env in
 * request headers, `X-Avo-Client` for attribution at the edge). Without one the
 * SDK stays on v1 exactly as 3.2.0 sent it. A client counts as configured only
 * when it is a string that is still non-empty after trimming.
 *
 * The byte-level v1 pin against 3.2.0 lives in V1WireBaseline_test.ts; this file
 * covers the selection rule and the v2 request.
 */
import { AvoInspector } from "../AvoInspector";
import { AvoInspectorLite } from "../lite/AvoInspectorLite";
import { AvoNetworkCallsHandler } from "../AvoNetworkCallsHandler";
import { AvoNetworkCallsHandlerLite } from "../lite/AvoNetworkCallsHandlerLite";
import { AvoStreamId } from "../AvoStreamId";

import xhrMock from "../__mocks__/xhr";

import {
  defaultOptions,
  trackingEndpoint,
  trackingEndpointV2
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

interface SentRequest {
  url: string;
  headers: Record<string, string>;
  /** Every setRequestHeader call, in order. */
  headerCalls: Array<[string, string]>;
  body: any;
}

/** Sends one session-started body through `handler` and returns what went out. */
const oneSend = (handler: {
  bodyForSessionStartedCall: () => any;
  callInspectorWithBatchBody: (
    events: any[],
    onCompleted: (error: Error | null) => any
  ) => void;
}): SentRequest => {
  const events = [handler.bodyForSessionStartedCall()];
  jest.clearAllMocks();
  handler.callInspectorWithBatchBody(events, jest.fn());
  expect(xhrMock.open).toHaveBeenCalledTimes(1);
  return {
    url: xhrMock.open.mock.calls[0][1],
    headers: sentHeaders(),
    headerCalls: xhrMock.setRequestHeader.mock.calls.map(
      ([name, value]: [string, string]) => [name, value] as [string, string]
    ),
    body: JSON.parse(xhrMock.send.mock.calls[0][0])
  };
};

const v1HeaderCalls = [["Content-Type", "text/plain"]];

beforeAll(() => {
  jest
    .spyOn(AvoStreamId as any, "streamId", "get")
    .mockImplementation(() => "stream-id");
});

afterEach(() => {
  jest.clearAllMocks();
});

test("the two endpoints are the ones the backend serves", () => {
  expect(trackingEndpoint).toBe("https://api.avo.app/inspector/v1/track");
  expect(trackingEndpointV2).toBe("https://api.avo.app/inspector/v2/track");
});

describe.each([
  [
    "full build",
    (client?: unknown) =>
      new AvoNetworkCallsHandler(
        apiKey,
        env,
        "",
        version,
        inspectorVersion,
        undefined, // publicEncryptionKey
        client as string | undefined
      )
  ],
  [
    "lite build",
    (client?: unknown) =>
      new AvoNetworkCallsHandlerLite(
        apiKey,
        env,
        "",
        version,
        inspectorVersion,
        client as string | undefined
      )
  ]
])("transport selection (%s)", (_name, newHandler) => {
  describe("no client: v1", () => {
    test("no client argument posts to v1 with only Content-Type: text/plain", () => {
      const sent = oneSend(newHandler());

      expect(sent.url).toBe(trackingEndpoint);
      expect(sent.headerCalls).toEqual(v1HeaderCalls);
    });

    test.each([
      ["undefined", undefined],
      ["an empty string", ""],
      ["whitespace only", "   "],
      ["a lone newline", "\n"],
      ["tabs and newlines", "\t\r\n "],
      ["null", null],
      ["a number", 42],
      ["an object", { client: "gtm-web" }]
    ])("a client that is %s is not a client, so v1", (_description, client) => {
      const sent = oneSend(newHandler(client));

      expect(sent.url).toBe(trackingEndpoint);
      expect(sent.headerCalls).toEqual(v1HeaderCalls);
    });

    test("v1 sends no api-key, env or X-Avo-Client header; the body carries apiKey and env", () => {
      const sent = oneSend(newHandler(""));

      expect(sent.headers["api-key"]).toBeUndefined();
      expect(sent.headers.env).toBeUndefined();
      expect(sent.headers["X-Avo-Client"]).toBeUndefined();
      expect(sent.body[0].apiKey).toBe(apiKey);
      expect(sent.body[0].env).toBe(env);
    });

    test("a blank client is not an unusable one: no invalid-client warning", () => {
      AvoInspector.shouldLog = true;
      AvoInspectorLite.shouldLog = true;
      const warn = console.warn as jest.Mock;
      try {
        warn.mockClear();
        newHandler("   ");
        newHandler("");
        expect(warn).not.toHaveBeenCalled();

        // Positive control: a non-blank unusable client does warn.
        newHandler("gtm web");
        expect(warn).toHaveBeenCalledTimes(1);
      } finally {
        AvoInspector.shouldLog = false;
        AvoInspectorLite.shouldLog = false;
      }
    });
  });

  describe("client set: v2", () => {
    test("posts to v2 with Content-Type, api-key, env and X-Avo-Client", () => {
      const sent = oneSend(newHandler("gtm-web"));

      expect(sent.url).toBe(trackingEndpointV2);
      expect(sent.headerCalls).toEqual([
        ["Content-Type", "application/json"],
        ["api-key", apiKey],
        ["env", env],
        ["X-Avo-Client", "gtm-web"]
      ]);
    });

    test("the body still carries apiKey and env, which v2 takes from the headers", () => {
      // One body shape across endpoint versions: v2 ignores these copies rather
      // than rejecting them, and keeping them keeps the JSON schema unchanged.
      const sent = oneSend(newHandler("gtm-web"));

      expect(sent.body[0].apiKey).toBe(apiKey);
      expect(sent.body[0].env).toBe(env);
    });

    test("the v2 body is the same shape as the v1 body", () => {
      // Positive control for the pair: the transports differ on the request,
      // not on the session-started body.
      // messageId and createdAt are per body, so they are blanked.
      const comparable = (body: any[]) =>
        body.map((event) => ({ ...event, messageId: "", createdAt: "" }));

      expect(comparable(oneSend(newHandler("gtm-web")).body)).toEqual(
        comparable(oneSend(newHandler()).body)
      );
    });

    test("no Content-Encoding header on an uncompressed send", () => {
      expect(
        oneSend(newHandler("gtm-web")).headers["Content-Encoding"]
      ).toBeUndefined();
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
        const sent = oneSend(newHandler(token));
        expect(sent.url).toBe(trackingEndpointV2);
        expect(sent.headers["X-Avo-Client"]).toBe(token);
      });
    });

    test("a client with surrounding whitespace is trimmed and still selects v2", () => {
      // A value copied out of a config file keeps its trailing newline. Trimming
      // it preserves the attribution rather than silently downgrading.
      [
        ["gtm-web\n", "gtm-web"],
        ["  gtm-web  ", "gtm-web"]
      ].forEach(([raw, trimmed]) => {
        const sent = oneSend(newHandler(raw));
        expect(sent.url).toBe(trackingEndpointV2);
        expect(sent.headers["X-Avo-Client"]).toBe(trimmed);
      });
    });

    test("a non-blank client that cannot be a header still selects v2, with X-Avo-Client: web", () => {
      // setRequestHeader throws on these, which would take the whole batcher down
      // (see the wedge test below). Losing the label beats losing every event.
      // The emoji is the WebIDL ByteString case: a code unit above U+00FF throws
      // a TypeError before the request is sent. The accented token is not — U+00E9
      // is inside Latin-1 and setRequestHeader accepts it — so it is here to pin
      // that the token pattern is ASCII-only by intent, not by accident.
      [
        "gtm\nweb",
        "gtm web",
        "gtm:web",
        "x".repeat(65),
        "gtm-wéb",
        "gtm-web🚀"
      ].forEach((bad) => {
        const sent = oneSend(newHandler(bad));
        expect(sent.url).toBe(trackingEndpointV2);
        expect(sent.headers["X-Avo-Client"]).toBe("web");
      });
    });

    test("a rejected header reports through onCompleted instead of throwing", () => {
      const handler = newHandler("gtm-web");
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
      const handler = newHandler("gtm-web");

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

  test.each([
    ["no client (v1)", undefined],
    ["a client (v2)", "gtm-web"]
  ])(
    "with %s, a failed XMLHttpRequest construction does not latch the guard",
    (_description, client) => {
      // The construction sits inside the same try on both transports, which is
      // what makes sendTrackingRequest total — and therefore makes the gzip
      // promise chain in callInspectorApi unable to reject.
      const handler = newHandler(client);
      const onCompleted = jest.fn();

      jest.clearAllMocks();
      (window.XMLHttpRequest as unknown as jest.Mock).mockImplementationOnce(
        () => {
          throw new Error("XMLHttpRequest is not available");
        }
      );

      expect(() => {
        handler.callInspectorWithBatchBody(
          [handler.bodyForSessionStartedCall()],
          onCompleted
        );
      }).not.toThrow();
      expect(onCompleted.mock.calls[0][0]).toBeInstanceOf(Error);

      const secondBatch = jest.fn();
      handler.callInspectorWithBatchBody(
        [handler.bodyForSessionStartedCall()],
        secondBatch
      );

      expect(xhrMock.send).toHaveBeenCalledTimes(1);
    }
  );
});

describe("client option wiring through the public constructors", () => {
  /** The handler an inspector instance actually sends through. */
  const handlerOf = (inspector: any): any => inspector.avoNetworkCallsHandler;

  describe.each([
    ["AvoInspector", (options: any) => new AvoInspector(options)],
    ["AvoInspectorLite", (options: any) => new AvoInspectorLite(options)]
  ])("%s", (_name, newInspector) => {
    test("without a client option it stays on v1", () => {
      const sent = oneSend(handlerOf(newInspector(defaultOptions)));

      expect(sent.url).toBe(trackingEndpoint);
      expect(sent.headerCalls).toEqual(v1HeaderCalls);
    });

    test("a blank client option stays on v1", () => {
      const sent = oneSend(
        handlerOf(newInspector({ ...defaultOptions, client: " \n" }))
      );

      expect(sent.url).toBe(trackingEndpoint);
      expect(sent.headerCalls).toEqual(v1HeaderCalls);
    });

    test("a client option selects v2 and becomes X-Avo-Client", () => {
      const sent = oneSend(
        handlerOf(newInspector({ ...defaultOptions, client: "gtm-web" }))
      );

      expect(sent.url).toBe(trackingEndpointV2);
      expect(sent.headers["X-Avo-Client"]).toBe("gtm-web");
      expect(sent.headers["api-key"]).toBe(apiKey);
    });
  });
});
