import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoEventSpecFetcher } from "../eventSpec/AvoEventSpecFetcher";
import { EventSpecCache } from "../eventSpec/AvoEventSpecCache";
import type {
  EventSpecResponse,
  EventSpecResponseWire
} from "../eventSpec/AvoEventSpecFetchTypes";
import {
  trackSchemaFromEventWithOptions,
  trackSchemaWithOptions,
  withClient
} from "./helpers/internalGateway";

// AVO-4073: the web GTM tag template's gateway coordinates (originHint /
// outputReference) select which checkpoint's spec GET /trackingPlan/eventSpec
// answers with. They are appended to the spec fetch, and are part of the spec
// cache key and the in-flight dedupe key, only when the event carries them.
// Without them the URL and keys are exactly the source-key ones.

const specWire: EventSpecResponseWire = {
  events: [
    {
      b: "main",
      id: "evt_1",
      vids: [],
      p: { status: { t: "string", r: false, v: { '["ok"]': ["evt_1"] } } }
    }
  ],
  metadata: { schemaId: "schema_1", branchId: "main", latestActionId: "a_1" }
};

const specResponse: EventSpecResponse = {
  events: [
    {
      branchId: "main",
      baseEventId: "evt_1",
      variantIds: [],
      props: {}
    }
  ],
  metadata: { schemaId: "schema_1", branchId: "main", latestActionId: "a_1" }
};

const sourceUrl =
  "https://api.avo.app/trackingPlan/eventSpec?apiKey=key1&streamId=stream1&eventName=Order+Placed";

/** Replaces the network request, recording every URL; answers per `respond`. */
const stubRequests = (
  respond: (url: string) => EventSpecResponseWire | null = () => specWire
): { urls: string[]; restore: () => void } => {
  const urls: string[] = [];
  const spy = jest
    .spyOn(AvoEventSpecFetcher.prototype as any, "makeRequest")
    .mockImplementation(async (url: unknown) => {
      urls.push(url as string);
      // Let concurrent callers find the request in flight.
      await new Promise((resolve) => setTimeout(resolve, 5));
      return respond(url as string);
    });
  return { urls, restore: () => spy.mockRestore() };
};

describe("AvoEventSpecFetcher - gateway coordinates", () => {
  let requests: ReturnType<typeof stubRequests>;
  let fetcher: AvoEventSpecFetcher;
  const base = { apiKey: "key1", streamId: "stream1", eventName: "Order Placed" };

  beforeEach(() => {
    requests = stubRequests();
    fetcher = new AvoEventSpecFetcher(2000, false, "dev");
  });

  afterEach(() => requests.restore());

  test("without coordinates the URL is exactly the source-key URL", async () => {
    await fetcher.fetch(base);
    expect(requests.urls).toEqual([sourceUrl]);
  });

  test("blank or undefined coordinates are omitted, never sent empty", async () => {
    await fetcher.fetch({ ...base, originHint: "", outputReference: undefined });
    expect(requests.urls).toEqual([sourceUrl]);
  });

  test("originHint only", async () => {
    await fetcher.fetch({ ...base, originHint: "android" });
    expect(requests.urls).toEqual([sourceUrl + "&originHint=android"]);
  });

  test("outputReference only", async () => {
    await fetcher.fetch({ ...base, outputReference: "meta-x7k2q" });
    expect(requests.urls).toEqual([sourceUrl + "&outputReference=meta-x7k2q"]);
  });

  test("both, URL-encoded", async () => {
    await fetcher.fetch({
      ...base,
      originHint: "ios app",
      outputReference: "meta&x"
    });
    expect(requests.urls).toEqual([
      sourceUrl + "&originHint=ios+app&outputReference=meta%26x"
    ]);
  });

  test("concurrent fetches for different checkpoints of one event are not deduplicated", async () => {
    await Promise.all([
      fetcher.fetch(base),
      fetcher.fetch({ ...base, originHint: "web" }),
      fetcher.fetch({ ...base, originHint: "web", outputReference: "ga4" }),
      fetcher.fetch({ ...base, outputReference: "ga4" })
    ]);
    expect(requests.urls.length).toBe(4);
  });

  test("concurrent fetches for the same checkpoint are deduplicated", async () => {
    await Promise.all([
      fetcher.fetch({ ...base, originHint: "web", outputReference: "ga4" }),
      fetcher.fetch({ ...base, originHint: "web", outputReference: "ga4" })
    ]);
    expect(requests.urls.length).toBe(1);
  });
});

describe("EventSpecCache - gateway coordinates", () => {
  test("the key without coordinates is unchanged", () => {
    const cache = new EventSpecCache(false);
    cache.set("key1", "stream1", "Order Placed", specResponse);
    cache.set("key1", "stream1", "Signup", specResponse, {});
    cache.set("key1", "stream1", "Logout", specResponse, {
      originHint: "",
      outputReference: ""
    });
    expect(cache.getStats().entries.map((entry) => entry.key)).toEqual([
      "key1:stream1:Order Placed",
      "key1:stream1:Signup",
      "key1:stream1:Logout"
    ]);
  });

  test("source, gateway-input and output specs of one event never share an entry", () => {
    const cache = new EventSpecCache(false);
    const outputSpec = { ...specResponse, events: [] };
    cache.set("key1", "stream1", "Order Placed", null);
    cache.set("key1", "stream1", "Order Placed", specResponse, {
      originHint: "web"
    });
    cache.set("key1", "stream1", "Order Placed", outputSpec, {
      originHint: "web",
      outputReference: "ga4"
    });

    expect(cache.size()).toBe(3);
    expect(cache.get("key1", "stream1", "Order Placed")).toBeNull();
    expect(
      cache.get("key1", "stream1", "Order Placed", { originHint: "web" })
    ).toBe(specResponse);
    expect(
      cache.get("key1", "stream1", "Order Placed", {
        originHint: "web",
        outputReference: "ga4"
      })
    ).toBe(outputSpec);
    expect(
      cache.contains("key1", "stream1", "Order Placed", {
        outputReference: "ga4"
      })
    ).toBe(false);
  });

  test("a hint and an output reference with the same value are different keys", () => {
    const cache = new EventSpecCache(false);
    cache.set("key1", "stream1", "Order Placed", specResponse, {
      originHint: "x"
    });
    expect(
      cache.contains("key1", "stream1", "Order Placed", { outputReference: "x" })
    ).toBe(false);
  });
});

describe("AvoInspector - spec fetch for the event's gateway checkpoint", () => {
  const devOptions = { apiKey: "key1", env: AvoInspectorEnv.Dev, version: "1" };
  let requests: ReturnType<typeof stubRequests>;

  const newInspector = (client: string | undefined) => {
    const inspector = new AvoInspector(
      client === undefined ? devOptions : withClient(devOptions, client)
    );
    inspector.enableLogging(false);
    // Keep the tests off the network: neither send path makes a request.
    const handleTrackSchema = jest
      .spyOn(inspector.avoBatcher, "handleTrackSchema")
      .mockImplementation(() => {});
    const callInspectorImmediately = jest
      .spyOn(
        (inspector as any).avoNetworkCallsHandler,
        "callInspectorImmediately"
      )
      .mockImplementation(() => {});
    const streamId: string = (inspector as any).streamId;
    const specUrl = (query: string) =>
      "https://api.avo.app/trackingPlan/eventSpec?apiKey=key1&streamId=" +
      encodeURIComponent(streamId) +
      "&eventName=Order+Placed" +
      query;
    return { inspector, handleTrackSchema, callInspectorImmediately, specUrl };
  };

  beforeEach(() => {
    requests = stubRequests();
  });

  afterEach(() => requests.restore());

  test("the public trackSchemaFromEvent fetches exactly the source-key URL", async () => {
    const { inspector, specUrl } = newInspector(undefined);
    await inspector.trackSchemaFromEvent("Order Placed", { status: "ok" });
    expect(requests.urls).toEqual([specUrl("")]);
  });

  test("with the web GTM client, the normalized hints are sent with the fetch", async () => {
    const { inspector, specUrl, callInspectorImmediately } =
      newInspector("gtm-web");
    await trackSchemaFromEventWithOptions(
      inspector,
      "Order Placed",
      { status: "ok" },
      { originHint: "  web ", outputReference: "\tga4-abc\n", appVersion: "2" }
    );
    expect(requests.urls).toEqual([
      specUrl("&originHint=web&outputReference=ga4-abc")
    ]);
    // Validated against that checkpoint's spec and sent with the same hints.
    const body = callInspectorImmediately.mock.calls[0][0] as any;
    expect(body.eventSpecMetadata.schemaId).toBe("schema_1");
    expect(body.originHint).toBe("web");
    expect(body.outputReference).toBe("ga4-abc");
  });

  test("blank and non-string hints are omitted", async () => {
    const { inspector, specUrl } = newInspector("gtm-web");
    await trackSchemaFromEventWithOptions(
      inspector,
      "Order Placed",
      { status: "ok" },
      { originHint: "   ", outputReference: 42 }
    );
    expect(requests.urls).toEqual([specUrl("")]);
  });

  test("without the web GTM client the hints are ignored, as on the track body", async () => {
    const { inspector, specUrl } = newInspector(undefined);
    await trackSchemaFromEventWithOptions(
      inspector,
      "Order Placed",
      { status: "ok" },
      { originHint: "web", outputReference: "ga4" }
    );
    expect(requests.urls).toEqual([specUrl("")]);
  });

  test("trackSchema prefetches the spec for its checkpoint too", async () => {
    const { inspector, specUrl } = newInspector("gtm-web");
    await trackSchemaWithOptions(
      inspector,
      "Order Placed",
      [{ propertyName: "status", propertyType: "string" }],
      { originHint: "ios" }
    );
    expect(requests.urls).toEqual([specUrl("&originHint=ios")]);
  });

  test("each checkpoint is fetched and cached on its own", async () => {
    const { inspector, specUrl } = newInspector("gtm-web");
    const track = (options: object | undefined) =>
      trackSchemaFromEventWithOptions(
        inspector,
        "Order Placed",
        { status: "ok" },
        options
      );

    await track(undefined);
    await track({ originHint: "web" });
    await track({ originHint: "web", outputReference: "ga4" });
    // Cache hits: no further requests.
    await track({ originHint: "web", outputReference: "ga4" });
    await track({ originHint: " web " });
    await track(undefined);

    expect(requests.urls).toEqual([
      specUrl(""),
      specUrl("&originHint=web"),
      specUrl("&originHint=web&outputReference=ga4")
    ]);
  });

  test("a 404 for a gateway call without a hint still sends the event, unvalidated", async () => {
    requests.restore();
    requests = stubRequests(() => null); // what makeRequest returns for a 404
    const { inspector, specUrl, handleTrackSchema, callInspectorImmediately } =
      newInspector("gtm-web");

    await trackSchemaFromEventWithOptions(
      inspector,
      "Order Placed",
      { status: "ok" },
      { outputReference: "ga4" }
    );

    expect(requests.urls).toEqual([specUrl("&outputReference=ga4")]);
    expect(callInspectorImmediately).not.toHaveBeenCalled();
    expect(handleTrackSchema).toHaveBeenCalledTimes(1);
    const [eventName, , , , eventSpecMetadata, options] =
      handleTrackSchema.mock.calls[0] as any[];
    expect(eventName).toBe("Order Placed");
    expect(eventSpecMetadata).toBeUndefined();
    expect(options).toEqual({ outputReference: "ga4" });
  });
});
