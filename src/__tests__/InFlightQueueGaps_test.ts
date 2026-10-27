import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoBatcher as AvoBatcherLite } from "../lite/AvoBatcherLite";
import { AvoInspectorLite } from "../lite/AvoInspectorLite";
import { AvoNetworkCallsHandlerLite } from "../lite/AvoNetworkCallsHandlerLite";

// AVO-3946: pins the paths InFlightQueue_test leaves open: the gtm-web (v2)
// and gzipped validated sends, and the lite queue fix.

type FakeRequest = {
  body: any[];
  timeout: number;
  gzipped: boolean;
  respond: (status?: number) => void;
  fail: () => void;
};

let requests: FakeRequest[] = [];
const OriginalXHR = (global as any).XMLHttpRequest;
const zlib = require("zlib");

class FakeXHR {
  status = 0;
  statusText = "";
  response = "";
  timeout = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  open(): void {}
  setRequestHeader(): void {}
  send(body: string | Uint8Array): void {
    const gzipped = typeof body !== "string";
    const text = gzipped ? zlib.gunzipSync(Buffer.from(body)).toString() : body;
    requests.push({
      body: JSON.parse(text),
      timeout: this.timeout,
      gzipped,
      respond: (status = 200) => {
        this.status = status;
        this.response = JSON.stringify({ samplingRate: 1 });
        this.onload?.();
      },
      fail: () => this.onerror?.()
    });
  }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const validationResult = {
  metadata: {
    schemaId: "s",
    branchId: "branch-1",
    latestActionId: "a",
    sourceId: "src"
  },
  propertyResults: {}
};

beforeEach(() => {
  requests = [];
  (global as any).XMLHttpRequest = FakeXHR;
  window.localStorage.clear();
});

afterEach(() => {
  (global as any).XMLHttpRequest = OriginalXHR;
  AvoInspector.batchSize = 30;
  AvoInspectorLite.batchSize = 30;
});

describe("AVO-3946 validated send timeout on every transport", () => {
  test("a gtm-web (v2) validated send waits at least 10 s", async () => {
    const inspector = new AvoInspector({
      apiKey: "api-key",
      env: AvoInspectorEnv.Dev,
      version: "1",
      _client: "gtm-web"
    } as any);
    await flush();
    requests = [];
    (inspector as any).sendEventWithValidation(
      "validated",
      [{ propertyName: "p", propertyType: "string" }],
      null,
      null,
      validationResult,
      { originHint: "web" }
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].timeout).toEqual(10000);
  });

  test("a gzipped validated send waits at least 10 s", async () => {
    const { CompressionStream } = require("node:stream/web");
    const hadCompressionStream = "CompressionStream" in globalThis;
    const originalCompressionStream = (globalThis as any).CompressionStream;
    (globalThis as any).CompressionStream = CompressionStream;
    try {
      const inspector = new AvoInspector({
        apiKey: "api-key",
        env: AvoInspectorEnv.Dev,
        version: "1"
      });
      await flush();
      requests = [];
      const schema = Array.from({ length: 40 }, (_, i) => ({
        propertyName: "property_number_" + i,
        propertyType: "string"
      }));
      (inspector as any).sendEventWithValidation(
        "validated",
        schema,
        null,
        null,
        validationResult
      );
      for (let i = 0; i < 100 && requests.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      expect(requests).toHaveLength(1);
      expect(requests[0].gzipped).toBe(true);
      expect(requests[0].timeout).toEqual(10000);
    } finally {
      if (hadCompressionStream) {
        (globalThis as any).CompressionStream = originalCompressionStream;
      } else {
        delete (globalThis as any).CompressionStream;
      }
    }
  });
});

describe("AVO-3946 queue fix in avo-inspector/lite", () => {
  const newLiteBatcher = (env: string = "prod"): AvoBatcherLite => {
    const inspector = new AvoInspectorLite({
      apiKey: "api-key",
      env: AvoInspectorEnv.Prod,
      version: "1"
    });
    void inspector;
    const handler = new AvoNetworkCallsHandlerLite(
      "api-key",
      env,
      "",
      "1",
      "test"
    );
    return new AvoBatcherLite(handler as any);
  };

  test("dev and staging batches wait at least 10 s, a prod batch keeps the network timeout", async () => {
    AvoInspectorLite.batchSize = 1;
    const timeouts: Record<string, number> = {};
    for (const env of ["dev", "staging", "prod"]) {
      // Each batcher replays the stored queue on construction; start empty.
      window.localStorage.clear();
      const batcher = newLiteBatcher(env);
      AvoInspectorLite.batchSize = 1;
      await flush();
      requests = [];
      batcher.handleTrackSchema("batched", [], null, null);
      expect(requests).toHaveLength(1);
      timeouts[env] = requests[0].timeout;
    }
    expect(timeouts).toEqual({
      dev: 10000,
      staging: 10000,
      prod: AvoInspectorLite.networkTimeout
    });
  });

  test("4 rapid events send 4 events on the same page", async () => {
    const batcher = newLiteBatcher();
    AvoInspectorLite.batchSize = 1;
    await flush();
    requests = [];
    ["a", "b", "c", "d"].forEach((name) =>
      batcher.handleTrackSchema(name, [], null, null)
    );
    const sent: string[] = [];
    for (let i = 0; i < 10 && requests.length > 0; i++) {
      const pending = requests.splice(0);
      pending.forEach((r) => {
        sent.push(...r.body.map((e: any) => e.eventName));
        r.respond(200);
      });
      await flush();
    }
    expect(sent).toEqual(["a", "b", "c", "d"]);
  });

  test("after a failed batch, later events do not resend the queue", async () => {
    const batcher = newLiteBatcher();
    AvoInspectorLite.batchSize = 1;
    await flush();
    requests = [];
    batcher.handleTrackSchema("first", [], null, null);
    expect(requests).toHaveLength(1);
    const inFlight = requests.shift();
    batcher.handleTrackSchema("during", [], null, null);
    expect(requests).toHaveLength(0);
    inFlight?.fail();
    await flush();
    // No retry loop after a failure: the queue waits for the next event.
    expect(requests).toHaveLength(0);
  });
});
