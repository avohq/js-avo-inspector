/**
 * The v1 wire, pinned byte for byte against 3.2.0.
 *
 * A caller that does not configure a client stays on `/inspector/v1/track`
 * exactly as 3.2.0 sent it: same URL, the single `Content-Type: text/plain`
 * header (plus `Content-Encoding: gzip` on a compressed batch), and the same
 * body bytes. v1 is what every existing npm and script-tag install talks to, so
 * a release must not move any of it.
 *
 * This file deliberately uses only APIs that already existed in 3.2.0 and
 * imports nothing added since, so it runs unchanged against that release's
 * source. It was checked there as the positive control for every golden value
 * below: if one of them passes on this branch but fails on 3.2.0, the golden
 * value is wrong, not the code.
 *
 * `libVersion` is the one field that legitimately differs between releases, so
 * handler-level tests pass a fixed value and inspector-level tests read it from
 * package.json.
 */
import * as zlib from "zlib";

import AvoGuid from "../AvoGuid";
import { AvoInspector } from "../AvoInspector";
import { AvoNetworkCallsHandler } from "../AvoNetworkCallsHandler";
import { AvoStreamId } from "../AvoStreamId";
import { AvoInspectorLite } from "../lite/AvoInspectorLite";
import { AvoNetworkCallsHandlerLite } from "../lite/AvoNetworkCallsHandlerLite";

import xhrMock from "../__mocks__/xhr";

const {
  CompressionStream: NodeCompressionStream
} = require("node:stream/web");

const v1Endpoint = "https://api.avo.app/inspector/v1/track";
const createdAt = "2026-01-02T03:04:05.678Z";
const fixedLibVersion = "9.9.9";
const packageVersion: string = require("../../package.json").version;

/** 3.2.0's base envelope, in 3.2.0's key order, as JSON text. */
const baseJson = (libVersion: string, streamId: string): string =>
  `"apiKey":"api-key-xxx","appName":"","appVersion":"1","libVersion":"${libVersion}",` +
  `"env":"prod","libPlatform":"web","messageId":"generated-guid","trackingId":"",` +
  `"createdAt":"${createdAt}","sessionId":"","streamId":"${streamId}","samplingRate":1`;

const sessionStartedJson = (libVersion: string, streamId: string): string =>
  `{${baseJson(libVersion, streamId)},"type":"sessionStarted"}`;

const manualEventJson = (libVersion: string, streamId: string): string =>
  `{${baseJson(libVersion, streamId)},"type":"event","eventName":"event name",` +
  `"eventProperties":[{"propertyName":"prop0","propertyType":"string"}],` +
  `"avoFunction":false,"eventId":null,"eventHash":null}`;

const codegenEventJson = (libVersion: string, streamId: string): string =>
  `{${baseJson(libVersion, streamId)},"type":"event","eventName":"event name",` +
  `"eventProperties":[{"propertyName":"prop0","propertyType":"string"}],` +
  `"avoFunction":true,"eventId":"event id","eventHash":"event hash"}`;

const eventProperties = [{ propertyName: "prop0", propertyType: "string" }];

/** Every setRequestHeader call, in order — not collapsed, so an extra header shows. */
const headerCalls = (): Array<[string, string]> =>
  xhrMock.setRequestHeader.mock.calls.map(
    ([name, value]: [string, string]) => [name, value] as [string, string]
  );

async function waitFor(condition: () => boolean): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > 1000) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

interface Handler {
  bodyForSessionStartedCall: () => any;
  bodyForEventSchemaCall: (
    eventName: string,
    eventProperties: Array<{ propertyName: string; propertyType: string }>,
    eventId: string | null,
    eventHash: string | null
  ) => any;
  callInspectorWithBatchBody: (
    events: any[],
    onCompleted: (error: Error | null) => any
  ) => void;
}

// Restored individually rather than with jest.restoreAllMocks(), which would
// also restore the console spies jest.setup.js installs for the whole file.
let spies: jest.SpyInstance[] = [];

beforeEach(() => {
  spies = [
    jest.spyOn(Date.prototype, "toISOString").mockReturnValue(createdAt),
    jest.spyOn(AvoGuid, "newGuid").mockReturnValue("generated-guid"),
    jest
      .spyOn(AvoStreamId as any, "streamId", "get")
      .mockReturnValue("stream-id")
  ];
  jest.clearAllMocks();
});

afterEach(() => {
  spies.forEach((spy) => spy.mockRestore());
  delete (globalThis as any).CompressionStream;
});

describe.each([
  [
    "full build",
    (): Handler =>
      new AvoNetworkCallsHandler("api-key-xxx", "prod", "", "1", fixedLibVersion),
    "stream-id"
  ],
  [
    "lite build",
    (): Handler =>
      new AvoNetworkCallsHandlerLite(
        "api-key-xxx",
        "prod",
        "",
        "1",
        fixedLibVersion
      ),
    // The lite build has no stream id generation.
    ""
  ]
])("v1 wire, no client (%s)", (_name, newHandler, streamId) => {
  test("an uncompressed batch: URL, headers and body bytes are 3.2.0's", () => {
    const handler = newHandler();
    const events = [
      handler.bodyForSessionStartedCall(),
      handler.bodyForEventSchemaCall("event name", eventProperties, null, null),
      handler.bodyForEventSchemaCall(
        "event name",
        eventProperties,
        "event id",
        "event hash"
      )
    ];
    jest.clearAllMocks();

    handler.callInspectorWithBatchBody(events, jest.fn());

    expect(xhrMock.open.mock.calls).toEqual([["POST", v1Endpoint, true]]);
    expect(headerCalls()).toEqual([["Content-Type", "text/plain"]]);
    expect(xhrMock.send.mock.calls).toEqual([
      [
        `[${sessionStartedJson(fixedLibVersion, streamId)},` +
          `${manualEventJson(fixedLibVersion, streamId)},` +
          `${codegenEventJson(fixedLibVersion, streamId)}]`
      ]
    ]);
  });

  test("a gzipped batch: text/plain plus Content-Encoding, and it gunzips to 3.2.0's bytes", async () => {
    (globalThis as any).CompressionStream = NodeCompressionStream;
    const handler = newHandler();
    const events = Array.from({ length: 8 }, () =>
      handler.bodyForEventSchemaCall("event name", eventProperties, null, null)
    );
    const expectedJson = `[${Array.from({ length: 8 }, () =>
      manualEventJson(fixedLibVersion, streamId)
    ).join(",")}]`;
    expect(expectedJson.length).toBeGreaterThan(1024);
    jest.clearAllMocks();

    handler.callInspectorWithBatchBody(events, jest.fn());
    await waitFor(() => xhrMock.send.mock.calls.length > 0);

    expect(xhrMock.open.mock.calls).toEqual([["POST", v1Endpoint, true]]);
    expect(headerCalls()).toEqual([
      ["Content-Type", "text/plain"],
      ["Content-Encoding", "gzip"]
    ]);
    const sent = xhrMock.send.mock.calls[0][0];
    expect(zlib.gunzipSync(Buffer.from(sent)).toString("utf-8")).toBe(
      expectedJson
    );
  });
});

describe("v1 wire, no client, through the public constructors", () => {
  test("AvoInspector (npm, full build)", () => {
    const handler: Handler = (
      new AvoInspector({ apiKey: "api-key-xxx", env: "prod", version: "1" }) as any
    ).avoNetworkCallsHandler;
    const events = [handler.bodyForSessionStartedCall()];
    jest.clearAllMocks();

    handler.callInspectorWithBatchBody(events, jest.fn());

    expect(xhrMock.open.mock.calls).toEqual([["POST", v1Endpoint, true]]);
    expect(headerCalls()).toEqual([["Content-Type", "text/plain"]]);
    expect(xhrMock.send.mock.calls).toEqual([
      [`[${sessionStartedJson(packageVersion, "stream-id")}]`]
    ]);
  });

  test("AvoInspectorLite (npm, lite build)", () => {
    const handler: Handler = (
      new AvoInspectorLite({
        apiKey: "api-key-xxx",
        env: "prod",
        version: "1"
      } as any) as any
    ).avoNetworkCallsHandler;
    const events = [handler.bodyForSessionStartedCall()];
    jest.clearAllMocks();

    handler.callInspectorWithBatchBody(events, jest.fn());

    expect(xhrMock.open.mock.calls).toEqual([["POST", v1Endpoint, true]]);
    expect(headerCalls()).toEqual([["Content-Type", "text/plain"]]);
    expect(xhrMock.send.mock.calls).toEqual([
      [`[${sessionStartedJson(packageVersion, "")}]`]
    ]);
  });

  test("a manual trackSchemaFromEvent flushed by the batcher", async () => {
    const inspector = new AvoInspector({
      apiKey: "api-key-xxx",
      env: "prod",
      version: "1"
    } as any);
    inspector.enableLogging(false);
    // The constructor sets the static from the env, so override it afterwards.
    AvoInspector.batchSize = 1;
    jest.clearAllMocks();

    await inspector.trackSchemaFromEvent("event name", { prop0: "value" });

    expect(xhrMock.open.mock.calls).toEqual([["POST", v1Endpoint, true]]);
    expect(headerCalls()).toEqual([["Content-Type", "text/plain"]]);
    expect(xhrMock.send.mock.calls).toEqual([
      [`[${manualEventJson(packageVersion, "stream-id")}]`]
    ]);
  });
});

describe("v1 wire, no client, script-tag bootstrap", () => {
  afterEach(() => {
    delete (window as any).inspector;
  });

  test("a page with no __CLIENT__ sends 3.2.0's request", () => {
    const callQueue: any[] = [];
    Object.assign(callQueue, {
      __API_KEY__: "api-key-xxx",
      __ENV__: "prod",
      __VERSION__: "1",
      __APP_NAME__: ""
    });
    (window as any).inspector = callQueue;

    jest.isolateModules(() => {
      require("../browser");
      // Same registry as the bootstrap, so these spies reach its modules.
      jest.spyOn(require("../AvoGuid").default, "newGuid").mockReturnValue(
        "generated-guid"
      );
      jest
        .spyOn(require("../AvoStreamId").AvoStreamId, "streamId", "get")
        .mockReturnValue("stream-id");
    });

    const handler: Handler = (window as any).inspector.avoNetworkCallsHandler;
    const events = [handler.bodyForSessionStartedCall()];
    jest.clearAllMocks();

    handler.callInspectorWithBatchBody(events, jest.fn());

    expect(xhrMock.open.mock.calls).toEqual([["POST", v1Endpoint, true]]);
    expect(headerCalls()).toEqual([["Content-Type", "text/plain"]]);
    expect(xhrMock.send.mock.calls).toEqual([
      [`[${sessionStartedJson(packageVersion, "stream-id")}]`]
    ]);
  });
});

/**
 * A third argument changes nothing without the web GTM template's client.
 *
 * Gateway options are internal (web GTM template only). A JS caller can still
 * pass a third argument to the public track methods, and the internal methods
 * accept one; without the client both must produce 3.2.0's bytes — the
 * appVersion in the options included.
 *
 * Still runnable against 3.2.0: the internal methods are used only where they
 * exist, and there a third argument to the public methods was always ignored.
 */
describe("v1 wire, no client, a third argument is inert", () => {
  const options = {
    outputReference: "meta-x7k2q",
    originHint: "ios",
    appVersion: "5.1.0"
  };

  const clearEventCache = (): void => {
    (global as any).__localStorageMock.clear();
  };

  async function waitForSend(): Promise<void> {
    await waitFor(() => xhrMock.send.mock.calls.length > 0);
  }

  const builds: Array<[string, () => any, string]> = [
    [
      "full build",
      () => {
        clearEventCache();
        const inspector = new AvoInspector({
          apiKey: "api-key-xxx",
          env: "prod",
          version: "1"
        } as any);
        inspector.enableLogging(false);
        AvoInspector.batchSize = 1;
        return inspector;
      },
      "stream-id"
    ],
    [
      "lite build",
      () => {
        clearEventCache();
        const inspector = new AvoInspectorLite({
          apiKey: "api-key-xxx",
          env: "prod",
          version: "1"
        } as any);
        inspector.enableLogging(false);
        AvoInspectorLite.batchSize = 1;
        return inspector;
      },
      ""
    ]
  ];

  const calls: Array<[string, (inspector: any) => Promise<unknown>]> = [
    [
      "public trackSchemaFromEvent(name, props, options)",
      (inspector) =>
        inspector.trackSchemaFromEvent("event name", { prop0: "value" }, options)
    ],
    [
      "public trackSchema(name, schema, options)",
      (inspector) =>
        inspector.trackSchema(
          "event name",
          [{ propertyName: "prop0", propertyType: "string" }],
          options
        )
    ],
    [
      "internal trackSchemaFromEvent with options, where it exists",
      (inspector) =>
        inspector._trackSchemaFromEventWithOptions
          ? inspector._trackSchemaFromEventWithOptions(
              "event name",
              { prop0: "value" },
              options
            )
          : inspector.trackSchemaFromEvent("event name", { prop0: "value" }, options)
    ],
    [
      "internal trackSchema with options, where it exists",
      (inspector) =>
        inspector._trackSchemaWithOptions
          ? inspector._trackSchemaWithOptions(
              "event name",
              [{ propertyName: "prop0", propertyType: "string" }],
              options
            )
          : inspector.trackSchema(
              "event name",
              [{ propertyName: "prop0", propertyType: "string" }],
              options
            )
    ]
  ];

  describe.each(builds)("%s", (_build, newInspector, streamId) => {
    test.each(calls)("%s sends 3.2.0's bytes", async (_call, track) => {
      const inspector = newInspector();
      jest.clearAllMocks();

      await track(inspector);
      await waitForSend();

      expect(xhrMock.open.mock.calls).toEqual([["POST", v1Endpoint, true]]);
      expect(headerCalls()).toEqual([["Content-Type", "text/plain"]]);
      expect(xhrMock.send.mock.calls).toEqual([
        [`[${manualEventJson(packageVersion, streamId)}]`]
      ]);
    });
  });

  test.each([
    ["no __CLIENT__", {}],
    ["__CLIENT__ web", { __CLIENT__: "web" }],
    ["__CLIENT__ GTM-WEB", { __CLIENT__: "GTM-WEB" }],
    ["__CLIENT__ gtm-server", { __CLIENT__: "gtm-server" }]
  ])("script tag with %s: a three-argument window call sends 3.2.0's bytes", async (_description, clientProps) => {
    clearEventCache();
    const callQueue: any[] = [];
    Object.assign(callQueue, {
      __API_KEY__: "api-key-xxx",
      __ENV__: "prod",
      __VERSION__: "1",
      __APP_NAME__: ""
    }, clientProps);
    (window as any).inspector = callQueue;

    jest.isolateModules(() => {
      require("../browser");
      jest.spyOn(require("../AvoGuid").default, "newGuid").mockReturnValue(
        "generated-guid"
      );
      jest
        .spyOn(require("../AvoStreamId").AvoStreamId, "streamId", "get")
        .mockReturnValue("stream-id");
    });

    const inspector = (window as any).inspector;
    inspector.setBatchSize(1);
    jest.clearAllMocks();

    await inspector.trackSchemaFromEvent("event name", { prop0: "value" }, options);
    await waitForSend();

    expect(xhrMock.open.mock.calls).toEqual([["POST", v1Endpoint, true]]);
    expect(headerCalls()).toEqual([["Content-Type", "text/plain"]]);
    expect(xhrMock.send.mock.calls).toEqual([
      [`[${manualEventJson(packageVersion, "stream-id")}]`]
    ]);
    delete (window as any).inspector;
  });
});
