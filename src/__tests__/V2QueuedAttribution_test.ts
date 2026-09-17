/**
 * v2 sends each queued event under the api key and env it was queued with.
 *
 * v2 reads both from the request headers and applies them to every event in the
 * request, while each body keeps the values of the instance that built it. The
 * two differ only for events persisted by an earlier page load with another
 * configuration: a published container's (prod) queue flushed by a GTM Preview
 * load (dev), or the reverse. So v2 sends one request per api key and env, in
 * order of first appearance. v1 reads both from each body, so its single request
 * is unchanged.
 */
import { AvoBatcher } from "../AvoBatcher";
import { AvoInspector } from "../AvoInspector";
import { AvoNetworkCallsHandler } from "../AvoNetworkCallsHandler";
import { AvoStreamId } from "../AvoStreamId";
import { AvoNetworkCallsHandlerLite } from "../lite/AvoNetworkCallsHandlerLite";

import xhrMock from "../__mocks__/xhr";

import { defaultOptions, trackingEndpoint, trackingEndpointV2 } from "./constants";
import { withClient } from "./helpers/internalGateway";

interface Handler {
  bodyForEventSchemaCall: (
    eventName: string,
    eventProperties: any[],
    eventId: string | null,
    eventHash: string | null
  ) => any;
  callInspectorWithBatchBody: (
    events: any[],
    onCompleted: (error: Error | null, retryEvents?: any[]) => any
  ) => void;
}

const builds: Array<
  [string, (apiKey: string, env: string, client?: string) => Handler]
> = [
  [
    "full build",
    (apiKey, env, client) =>
      new AvoNetworkCallsHandler(apiKey, env, "", "1", "9.9.9", undefined, client)
  ],
  [
    "lite build",
    (apiKey, env, client) =>
      new AvoNetworkCallsHandlerLite(apiKey, env, "", "1", "9.9.9", client)
  ]
];

interface SentRequest {
  url: string;
  headers: Record<string, string>;
  eventNames: string[];
}

/** Every request opened so far. The XHR mock is one shared object, so calls are split on open(). */
const sentRequests = (): SentRequest[] => {
  const calls = ([] as Array<{ order: number; kind: string; args: any[] }>)
    .concat(
      xhrMock.open.mock.calls.map((args: any[], i: number) => ({
        order: xhrMock.open.mock.invocationCallOrder[i],
        kind: "open",
        args
      })),
      xhrMock.setRequestHeader.mock.calls.map((args: any[], i: number) => ({
        order: xhrMock.setRequestHeader.mock.invocationCallOrder[i],
        kind: "header",
        args
      })),
      xhrMock.send.mock.calls.map((args: any[], i: number) => ({
        order: xhrMock.send.mock.invocationCallOrder[i],
        kind: "send",
        args
      }))
    )
    .sort((a, b) => a.order - b.order);

  const requests: SentRequest[] = [];
  calls.forEach(({ kind, args }) => {
    if (kind === "open") {
      requests.push({ url: args[1], headers: {}, eventNames: [] });
    } else if (kind === "header") {
      requests[requests.length - 1].headers[args[0]] = args[1];
    } else {
      requests[requests.length - 1].eventNames = JSON.parse(args[0]).map(
        (body: any) => body.eventName
      );
    }
  });
  return requests;
};

/** Answers the request in flight. */
const respond = (status: number): void => {
  xhrMock.status = status;
  xhrMock.onload();
};

const namesOf = (events: any[] | undefined): string[] | undefined =>
  events === undefined ? undefined : events.map((body) => body.eventName);

beforeAll(() => {
  jest
    .spyOn(AvoStreamId as any, "streamId", "get")
    .mockImplementation(() => "stream-id");
});

beforeEach(() => {
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  xhrMock.status = 200;
  jest.clearAllMocks();
  jest.restoreAllMocks();
  jest
    .spyOn(AvoStreamId as any, "streamId", "get")
    .mockImplementation(() => "stream-id");
});

describe.each(builds)("v2 (%s)", (_build, newHandler) => {
  const apiKey = defaultOptions.apiKey;

  test("events queued under another env go out under that env: one request per api key and env, in order", () => {
    const published = newHandler(apiKey, "prod", "gtm-web");
    const preview = newHandler(apiKey, "dev", "gtm-web");
    const onCompleted = jest.fn();

    preview.callInspectorWithBatchBody(
      [
        published.bodyForEventSchemaCall("Prod 1", [], null, null),
        preview.bodyForEventSchemaCall("Dev 1", [], null, null),
        published.bodyForEventSchemaCall("Prod 2", [], null, null)
      ],
      onCompleted
    );

    // Sequential: the second request is only opened once the first completes.
    expect(sentRequests()).toHaveLength(1);
    respond(200);
    respond(200);

    expect(sentRequests()).toEqual([
      {
        url: trackingEndpointV2,
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
          env: "prod",
          "X-Avo-Client": "gtm-web"
        },
        eventNames: ["Prod 1", "Prod 2"]
      },
      {
        url: trackingEndpointV2,
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
          env: "dev",
          "X-Avo-Client": "gtm-web"
        },
        eventNames: ["Dev 1"]
      }
    ]);
    expect(onCompleted.mock.calls).toEqual([[null]]);
  });

  test("events queued under another api key get their own request and api-key header", () => {
    const before = newHandler("old-key", "prod", "gtm-web");
    const now = newHandler(apiKey, "prod", "gtm-web");

    now.callInspectorWithBatchBody(
      [
        now.bodyForEventSchemaCall("New", [], null, null),
        before.bodyForEventSchemaCall("Old", [], null, null)
      ],
      jest.fn()
    );
    respond(200);

    expect(
      sentRequests().map((r) => [r.headers["api-key"], r.eventNames])
    ).toEqual([
      [apiKey, ["New"]],
      ["old-key", ["Old"]]
    ]);
  });

  test("control: a batch with one configuration is one request under this instance's headers", () => {
    const handler = newHandler(apiKey, "prod", "gtm-web");
    const onCompleted = jest.fn();

    handler.callInspectorWithBatchBody(
      [
        handler.bodyForEventSchemaCall("One", [], null, null),
        handler.bodyForEventSchemaCall("Two", [], null, null)
      ],
      onCompleted
    );
    respond(200);

    expect(sentRequests()).toEqual([
      {
        url: trackingEndpointV2,
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
          env: "prod",
          "X-Avo-Client": "gtm-web"
        },
        eventNames: ["One", "Two"]
      }
    ]);
    expect(onCompleted.mock.calls).toEqual([[null]]);
  });

  test("when one request fails transiently, only its events are handed back for retry", () => {
    const published = newHandler(apiKey, "prod", "gtm-web");
    const preview = newHandler(apiKey, "dev", "gtm-web");
    const onCompleted = jest.fn();

    preview.callInspectorWithBatchBody(
      [
        published.bodyForEventSchemaCall("Prod", [], null, null),
        preview.bodyForEventSchemaCall("Dev", [], null, null)
      ],
      onCompleted
    );
    respond(200);
    respond(500);

    expect(onCompleted).toHaveBeenCalledTimes(1);
    expect(onCompleted.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(namesOf(onCompleted.mock.calls[0][1])).toEqual(["Dev"]);
  });

  test("a 4xx for another configuration's events drops them; the same answer for this instance's events keeps them", () => {
    const before = newHandler("revoked-key", "prod", "gtm-web");
    const now = newHandler(apiKey, "prod", "gtm-web");
    const onCompleted = jest.fn();

    now.callInspectorWithBatchBody(
      [
        before.bodyForEventSchemaCall("Revoked", [], null, null),
        now.bodyForEventSchemaCall("Current", [], null, null)
      ],
      onCompleted
    );
    respond(400);
    respond(400);

    expect(sentRequests()).toHaveLength(2);
    expect(namesOf(onCompleted.mock.calls[0][1])).toEqual(["Current"]);
  });

  test("a persisted api key that cannot be a header is dropped without opening a request", () => {
    const before = newHandler("bad\r\nkey", "prod", undefined); // built on v1, where it is only a body field
    const now = newHandler(apiKey, "prod", "gtm-web");
    const onCompleted = jest.fn();

    now.callInspectorWithBatchBody(
      [
        before.bodyForEventSchemaCall("Unsendable", [], null, null),
        now.bodyForEventSchemaCall("Current", [], null, null)
      ],
      onCompleted
    );
    respond(200);

    expect(sentRequests().map((r) => r.eventNames)).toEqual([["Current"]]);
    expect(onCompleted.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onCompleted.mock.calls[0][1]).toEqual([]);
  });
});

describe.each(builds)("v1 (%s)", (_build, newHandler) => {
  test("a batch mixing envs and api keys is still one request, with no key or env headers, as in 3.2.0", () => {
    const published = newHandler("key-a", "prod");
    const preview = newHandler("key-b", "dev");
    const onCompleted = jest.fn();

    preview.callInspectorWithBatchBody(
      [
        published.bodyForEventSchemaCall("A", [], null, null),
        preview.bodyForEventSchemaCall("B", [], null, null),
        published.bodyForEventSchemaCall("C", [], null, null)
      ],
      onCompleted
    );
    respond(400);

    expect(sentRequests()).toEqual([
      {
        url: trackingEndpoint,
        headers: { "Content-Type": "text/plain" },
        eventNames: ["A", "B", "C"]
      }
    ]);
    // v1 hands nothing back: the batcher requeues the whole batch, as before.
    expect(onCompleted.mock.calls).toHaveLength(1);
    expect(onCompleted.mock.calls[0]).toHaveLength(1);
  });
});

describe("through the batcher (full build)", () => {
  const waitFor = async (condition: () => boolean): Promise<void> => {
    const start = Date.now();
    while (!condition()) {
      if (Date.now() - start > 1000) {
        throw new Error("Timed out waiting for condition");
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  /** A published container's queue, persisted and then loaded by a GTM Preview page. */
  const previewLoadingPublishedQueue = async (): Promise<AvoInspector> => {
    const published = new AvoNetworkCallsHandler(
      defaultOptions.apiKey, "prod", "", "1", "9.9.9", undefined, "gtm-web"
    );
    const inspector = new AvoInspector(
      withClient({ ...defaultOptions, env: "dev" as any }, "gtm-web")
    );
    inspector.enableLogging(false);
    AvoInspector.avoStorage.setItem(AvoBatcher.cacheKey, [
      published.bodyForEventSchemaCall("Published", [], null, null)
    ]);
    // A fresh batcher reads the stored queue, as on a new page load.
    inspector.avoBatcher = new AvoBatcher((inspector as any).avoNetworkCallsHandler);
    await waitFor(() => xhrMock.open.mock.calls.length === 1);
    return inspector;
  };

  const storedNames = (): string[] =>
    (AvoInspector.avoStorage.getItem<any[]>(AvoBatcher.cacheKey) || []).map(
      (body) => body.eventName
    );

  test("the persisted prod event is sent under env: prod from the dev page", async () => {
    await previewLoadingPublishedQueue();

    expect(sentRequests()[0].headers.env).toBe("prod");
    respond(200);
    expect(storedNames()).toEqual([]);
  });

  test("a transient failure keeps it queued; a 4xx for it drops it", async () => {
    await previewLoadingPublishedQueue();
    respond(500);
    expect(storedNames()).toEqual(["Published"]);

    jest.clearAllMocks();
    await previewLoadingPublishedQueue();
    respond(400);
    expect(storedNames()).toEqual([]);
  });
});
