import * as zlib from "zlib";

import { AvoNetworkCallsHandler } from "../AvoNetworkCallsHandler";
import { AvoNetworkCallsHandlerLite } from "../lite/AvoNetworkCallsHandlerLite";
import { AvoStreamId } from "../AvoStreamId";

import xhrMock from "../__mocks__/xhr";

import {
  defaultOptions,
  trackingEndpoint,
  trackingEndpointV2
} from "./constants";

// Real web-standard CompressionStream implementation from Node, installed
// into the jsdom test environment so tests exercise real gzip compression.
const {
  CompressionStream: NodeCompressionStream
} = require("node:stream/web");

const inspectorVersion = process.env.npm_package_version || "";

const { apiKey, env, version } = defaultOptions;

let streamIdSpy: jest.SpyInstance;

beforeAll(() => {
  streamIdSpy = jest
    .spyOn(AvoStreamId as any, "streamId", "get")
    .mockImplementation(() => "stream-id");
});

afterAll(() => {
  streamIdSpy.mockRestore();
});

// Gzip applies to both transports, as it did to v1 in 3.2.0. Handlers default to
// no client (v1); pass one to get v2.
function newHandler(client?: string): AvoNetworkCallsHandler {
  return new AvoNetworkCallsHandler(
    apiKey,
    env,
    "",
    version,
    inspectorVersion,
    undefined, // publicEncryptionKey
    client
  );
}

function newLiteHandler(client?: string): AvoNetworkCallsHandlerLite {
  return new AvoNetworkCallsHandlerLite(
    apiKey,
    env,
    "",
    version,
    inspectorVersion,
    client
  );
}

// Builds a batch whose JSON body is comfortably above the gzip size threshold.
function largeEvents(handler: {
  bodyForEventSchemaCall: (
    name: string,
    props: Array<{ propertyName: string; propertyType: string }>,
    eventId: string | null,
    eventHash: string | null
  ) => any;
}): any[] {
  const eventProperties = Array.from({ length: 30 }, (_, i) => ({
    propertyName: `property number ${i}`,
    propertyType: "string"
  }));
  return Array.from({ length: 5 }, (_, i) =>
    handler.bodyForEventSchemaCall(`event ${i}`, eventProperties, null, null)
  );
}

// Builds a batch whose JSON body is below the gzip size threshold (1024 bytes).
function smallEvents(handler: {
  bodyForSessionStartedCall: () => any;
}): any[] {
  return [handler.bodyForSessionStartedCall()];
}

async function waitFor(
  condition: () => boolean,
  timeoutMs: number = 1000
): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

function sentBody(): any {
  expect(xhrMock.send).toHaveBeenCalledTimes(1);
  return xhrMock.send.mock.calls[0][0];
}

function sentHeaders(): { [name: string]: string } {
  const headers: { [name: string]: string } = {};
  xhrMock.setRequestHeader.mock.calls.forEach(
    ([name, value]: [string, string]) => {
      headers[name] = value;
    }
  );
  return headers;
}

function gunzipToString(body: Uint8Array): string {
  return zlib.gunzipSync(Buffer.from(body)).toString("utf-8");
}

describe("NetworkCallsHandler gzip compression", () => {
  const customCallback = jest.fn();

  beforeEach(() => {
    (globalThis as any).CompressionStream = NodeCompressionStream;
  });

  afterEach(() => {
    delete (globalThis as any).CompressionStream;
    jest.clearAllMocks();
  });

  describe("when CompressionStream is available", () => {
    test("large payloads are gzipped and sent with Content-Encoding: gzip", async () => {
      const handler = newHandler();
      const events = largeEvents(handler);
      const expectedJson = JSON.stringify(events);
      expect(expectedJson.length).toBeGreaterThan(1024);

      handler.callInspectorWithBatchBody(events, customCallback);

      await waitFor(() => xhrMock.send.mock.calls.length > 0);

      // No client: v1, whose compressed request is 3.2.0's.
      expect(xhrMock.open).toHaveBeenCalledWith("POST", trackingEndpoint, true);
      expect(xhrMock.setRequestHeader.mock.calls).toEqual([
        ["Content-Type", "text/plain"],
        ["Content-Encoding", "gzip"]
      ]);

      const body = sentBody();
      expect(typeof body).not.toBe("string");
      expect(gunzipToString(body)).toBe(expectedJson);
      expect(body.length).toBeLessThan(expectedJson.length);
    });

    test("response handling still works after a gzipped send", async () => {
      const handler = newHandler();

      handler.callInspectorWithBatchBody(largeEvents(handler), customCallback);

      await waitFor(() => xhrMock.send.mock.calls.length > 0);

      xhrMock.onload();

      expect(customCallback).toHaveBeenCalledTimes(1);
      expect(customCallback).toHaveBeenCalledWith(null);
    });

    test("small payloads below the threshold are sent uncompressed", () => {
      const handler = newHandler();
      const events = smallEvents(handler);
      const expectedJson = JSON.stringify(events);
      expect(expectedJson.length).toBeLessThan(1024);

      handler.callInspectorWithBatchBody(events, customCallback);

      expect(xhrMock.send).toHaveBeenCalledTimes(1);
      expect(xhrMock.send).toHaveBeenCalledWith(expectedJson);
      expect(sentHeaders()["Content-Encoding"]).toBeUndefined();
    });

    test("falls back to uncompressed when compression fails", async () => {
      (globalThis as any).CompressionStream = function () {
        throw new Error("compression broken");
      };

      const handler = newHandler();
      const events = largeEvents(handler);

      handler.callInspectorWithBatchBody(events, customCallback);

      await waitFor(() => xhrMock.send.mock.calls.length > 0);

      expect(xhrMock.send).toHaveBeenCalledWith(JSON.stringify(events));
      expect(sentHeaders()["Content-Encoding"]).toBeUndefined();

      xhrMock.onload();
      expect(customCallback).toHaveBeenCalledWith(null);
    });

    test("gzipped sends happen asynchronously (not synchronously)", async () => {
      const handler = newHandler();

      handler.callInspectorWithBatchBody(largeEvents(handler), customCallback);

      // The gzip branch awaits CompressionStream, so nothing is sent on the
      // synchronous tick — the mirror of the unavailable-branch sync send.
      expect(xhrMock.send).not.toHaveBeenCalled();

      // Drain the pending async send so it can't leak into the next test.
      await waitFor(() => xhrMock.send.mock.calls.length > 0);
    });

    test("callInspectorImmediately gzips a large event body", async () => {
      const handler = newHandler();
      const eventBody = handler.bodyForEventSchemaCall(
        "big immediate event",
        Array.from({ length: 40 }, (_, i) => ({
          propertyName: `property number ${i}`,
          propertyType: "string"
        })),
        null,
        null
      );
      const expectedJson = JSON.stringify([eventBody]);
      expect(expectedJson.length).toBeGreaterThan(1024);

      handler.callInspectorImmediately(eventBody, customCallback);

      await waitFor(() => xhrMock.send.mock.calls.length > 0);

      expect(sentHeaders()["Content-Encoding"]).toBe("gzip");
      expect(gunzipToString(sentBody())).toBe(expectedJson);

      xhrMock.onload();
      expect(customCallback).toHaveBeenCalledWith(null);
    });

    test("adopts samplingRate from the response after a gzipped send", async () => {
      const randomSpy = jest.spyOn(Math, "random").mockReturnValue(0.5);
      const originalResponse = xhrMock.response;
      try {
        const handler = newHandler();

        // samplingRate starts at 1.0, so 0.5 > 1.0 is false — first batch sends.
        handler.callInspectorWithBatchBody(largeEvents(handler), customCallback);
        await waitFor(() => xhrMock.send.mock.calls.length > 0);

        xhrMock.response = JSON.stringify({ samplingRate: 0 });
        xhrMock.onload();
        expect(customCallback).toHaveBeenCalledWith(null);

        // samplingRate is now 0, so 0.5 > 0 is true — the next batch is dropped
        // before reaching the network (synchronous drop, no new send).
        const sendsBefore = xhrMock.send.mock.calls.length;
        handler.callInspectorWithBatchBody(largeEvents(handler), customCallback);
        expect(xhrMock.send.mock.calls.length).toBe(sendsBefore);
      } finally {
        xhrMock.response = originalResponse;
        randomSpy.mockRestore();
      }
    });

    test("invokes the callback with an error on network error after a gzipped send", async () => {
      const handler = newHandler();

      handler.callInspectorWithBatchBody(largeEvents(handler), customCallback);
      await waitFor(() => xhrMock.send.mock.calls.length > 0);

      xhrMock.onerror();

      expect(customCallback).toHaveBeenCalledTimes(1);
      expect(customCallback).toHaveBeenCalledWith(new Error("Request failed"));
    });

    test("invokes the callback with an error on timeout after a gzipped send", async () => {
      const handler = newHandler();

      handler.callInspectorWithBatchBody(largeEvents(handler), customCallback);
      await waitFor(() => xhrMock.send.mock.calls.length > 0);

      xhrMock.ontimeout();

      expect(customCallback).toHaveBeenCalledTimes(1);
      expect(customCallback).toHaveBeenCalledWith(new Error("Request timed out"));
    });

    test("a rejected header on the compressed path still reports through onCompleted", async () => {
      // The compressed send runs inside gzip(...).then(...), which has no
      // rejection handler. A synchronous failure there has to come back through
      // onCompleted anyway, or the `sending` guard latches and the batcher stops
      // for the rest of the page — the same deadlock as on the sync path, but
      // arriving as an unhandled rejection instead of a thrown error.
      const handler = newHandler();
      const onCompleted = jest.fn();

      xhrMock.setRequestHeader.mockImplementationOnce(() => {
        throw new SyntaxError("Failed to execute 'setRequestHeader'");
      });

      handler.callInspectorWithBatchBody(largeEvents(handler), onCompleted);
      await waitFor(() => onCompleted.mock.calls.length > 0);

      expect(onCompleted.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(xhrMock.send).not.toHaveBeenCalled();

      // The guard was cleared, so the next batch still goes out.
      handler.callInspectorWithBatchBody(smallEvents(handler), jest.fn());
      expect(xhrMock.send).toHaveBeenCalledTimes(1);
    });

    test("the lite handler behaves the same on the compressed path", async () => {
      const handler = newLiteHandler();
      const onCompleted = jest.fn();

      xhrMock.setRequestHeader.mockImplementationOnce(() => {
        throw new SyntaxError("Failed to execute 'setRequestHeader'");
      });

      handler.callInspectorWithBatchBody(largeEvents(handler), onCompleted);
      await waitFor(() => onCompleted.mock.calls.length > 0);

      expect(onCompleted.mock.calls[0][0]).toBeInstanceOf(Error);

      handler.callInspectorWithBatchBody(smallEvents(handler), jest.fn());
      expect(xhrMock.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("with a client (v2)", () => {
    test("large payloads are gzipped and sent to v2 with the v2 headers plus Content-Encoding: gzip", async () => {
      const handler = newHandler("gtm-web");
      const events = largeEvents(handler);
      const expectedJson = JSON.stringify(events);
      expect(expectedJson.length).toBeGreaterThan(1024);

      handler.callInspectorWithBatchBody(events, customCallback);

      await waitFor(() => xhrMock.send.mock.calls.length > 0);

      expect(xhrMock.open).toHaveBeenCalledWith(
        "POST",
        trackingEndpointV2,
        true
      );
      expect(xhrMock.setRequestHeader.mock.calls).toEqual([
        ["Content-Type", "application/json"],
        ["api-key", apiKey],
        ["env", env],
        ["X-Avo-Client", "gtm-web"],
        ["Content-Encoding", "gzip"]
      ]);
      expect(gunzipToString(sentBody())).toBe(expectedJson);
    });

    test("the same events gunzip to the same body on v1 and v2", async () => {
      // Positive control for the pair: gzip compresses whatever body the
      // transport built, and with no options the two bodies are identical.
      const v1 = newHandler();
      const v2 = newHandler("gtm-web");

      // messageId and createdAt are per body, so they are blanked.
      const comparable = (json: string) =>
        JSON.parse(json).map((event: any) => ({
          ...event,
          messageId: "",
          createdAt: ""
        }));

      v1.callInspectorWithBatchBody(largeEvents(v1), customCallback);
      await waitFor(() => xhrMock.send.mock.calls.length > 0);
      const v1Events = comparable(gunzipToString(xhrMock.send.mock.calls[0][0]));
      xhrMock.onload();
      jest.clearAllMocks();

      v2.callInspectorWithBatchBody(largeEvents(v2), customCallback);
      await waitFor(() => xhrMock.send.mock.calls.length > 0);

      expect(comparable(gunzipToString(sentBody()))).toEqual(v1Events);
    });

    test("a rejected v2 header on the compressed path still reports through onCompleted", async () => {
      const handler = newHandler("gtm-web");
      const onCompleted = jest.fn();

      // The X-Avo-Client call is the fourth setRequestHeader on v2.
      xhrMock.setRequestHeader
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {})
        .mockImplementationOnce(() => {
          throw new SyntaxError("Failed to execute 'setRequestHeader'");
        });

      handler.callInspectorWithBatchBody(largeEvents(handler), onCompleted);
      await waitFor(() => onCompleted.mock.calls.length > 0);

      expect(onCompleted.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(xhrMock.send).not.toHaveBeenCalled();

      handler.callInspectorWithBatchBody(smallEvents(handler), jest.fn());
      expect(xhrMock.send).toHaveBeenCalledTimes(1);
    });
  });

  describe("when CompressionStream is unavailable", () => {
    test("large payloads are sent uncompressed synchronously without Content-Encoding", () => {
      delete (globalThis as any).CompressionStream;

      const handler = newHandler();
      const events = largeEvents(handler);

      handler.callInspectorWithBatchBody(events, customCallback);

      // Synchronous send — no await needed, preserving pre-gzip behavior.
      expect(xhrMock.send).toHaveBeenCalledTimes(1);
      expect(xhrMock.send).toHaveBeenCalledWith(JSON.stringify(events));
      expect(sentHeaders()["Content-Encoding"]).toBeUndefined();

      xhrMock.onload();
      expect(customCallback).toHaveBeenCalledWith(null);
    });
  });
});

describe("NetworkCallsHandlerLite gzip compression", () => {
  const customCallback = jest.fn();

  beforeEach(() => {
    (globalThis as any).CompressionStream = NodeCompressionStream;
  });

  afterEach(() => {
    delete (globalThis as any).CompressionStream;
    jest.clearAllMocks();
  });

  test("large payloads are gzipped and sent with Content-Encoding: gzip", async () => {
    const handler = newLiteHandler();
    const events = largeEvents(handler);
    const expectedJson = JSON.stringify(events);
    expect(expectedJson.length).toBeGreaterThan(1024);

    handler.callInspectorWithBatchBody(events, customCallback);

    await waitFor(() => xhrMock.send.mock.calls.length > 0);

    // No client: v1, whose compressed request is 3.2.0's.
    expect(xhrMock.open).toHaveBeenCalledWith("POST", trackingEndpoint, true);
    expect(xhrMock.setRequestHeader.mock.calls).toEqual([
      ["Content-Type", "text/plain"],
      ["Content-Encoding", "gzip"]
    ]);

    expect(gunzipToString(sentBody())).toBe(expectedJson);
  });

  test("with a client, large payloads are gzipped and sent to v2 with the v2 headers", async () => {
    const handler = newLiteHandler("gtm-web");
    const events = largeEvents(handler);
    const expectedJson = JSON.stringify(events);

    handler.callInspectorWithBatchBody(events, customCallback);

    await waitFor(() => xhrMock.send.mock.calls.length > 0);

    expect(xhrMock.open).toHaveBeenCalledWith("POST", trackingEndpointV2, true);
    expect(xhrMock.setRequestHeader.mock.calls).toEqual([
      ["Content-Type", "application/json"],
      ["api-key", apiKey],
      ["env", env],
      ["X-Avo-Client", "gtm-web"],
      ["Content-Encoding", "gzip"]
    ]);
    expect(gunzipToString(sentBody())).toBe(expectedJson);
  });

  test("sends uncompressed without Content-Encoding when CompressionStream is unavailable", () => {
    delete (globalThis as any).CompressionStream;

    const handler = newLiteHandler();
    const events = largeEvents(handler);

    handler.callInspectorWithBatchBody(events, customCallback);

    expect(xhrMock.send).toHaveBeenCalledTimes(1);
    expect(xhrMock.send).toHaveBeenCalledWith(JSON.stringify(events));
    expect(sentHeaders()["Content-Encoding"]).toBeUndefined();
  });
});
