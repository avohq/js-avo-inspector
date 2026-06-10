import * as zlib from "zlib";

import { AvoNetworkCallsHandler } from "../AvoNetworkCallsHandler";
import { AvoNetworkCallsHandlerLite } from "../lite/AvoNetworkCallsHandlerLite";
import { AvoStreamId } from "../AvoStreamId";

import xhrMock from "../__mocks__/xhr";

import { defaultOptions } from "./constants";

// Real web-standard CompressionStream implementation from Node, installed
// into the jsdom test environment so tests exercise real gzip compression.
const {
  CompressionStream: NodeCompressionStream
} = require("node:stream/web");

const inspectorVersion = process.env.npm_package_version || "";

const { apiKey, env, version } = defaultOptions;

beforeAll(() => {
  jest
    .spyOn(AvoStreamId as any, "streamId", "get")
    .mockImplementation(() => "stream-id");
});

function newHandler(): AvoNetworkCallsHandler {
  return new AvoNetworkCallsHandler(apiKey, env, "", version, inspectorVersion);
}

function newLiteHandler(): AvoNetworkCallsHandlerLite {
  return new AvoNetworkCallsHandlerLite(
    apiKey,
    env,
    "",
    version,
    inspectorVersion
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

      const headers = sentHeaders();
      expect(headers["Content-Type"]).toBe("text/plain");
      expect(headers["Content-Encoding"]).toBe("gzip");

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

    const headers = sentHeaders();
    expect(headers["Content-Type"]).toBe("text/plain");
    expect(headers["Content-Encoding"]).toBe("gzip");

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
