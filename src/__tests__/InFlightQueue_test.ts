import { AvoBatcher } from "../AvoBatcher";
import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoNetworkCallsHandler } from "../AvoNetworkCallsHandler";

// AVO-3946: a send in flight must not make other events wait for a later event
// or a page load, and a timed-out validated send must be retried as the same
// body rather than as a new event.

type FakeRequest = {
  body: any[];
  timeout: number;
  respond: (status?: number) => void;
  timeOut: () => void;
};

let requests: FakeRequest[] = [];
const OriginalXHR = (global as any).XMLHttpRequest;

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
  send(body: string): void {
    requests.push({
      body: JSON.parse(body),
      timeout: this.timeout,
      respond: (status = 200) => {
        this.status = status;
        this.response = JSON.stringify({ samplingRate: 1 });
        this.onload?.();
      },
      timeOut: () => {
        this.ontimeout?.();
      }
    });
  }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

const sentEventNames = (): string[] =>
  requests.flatMap((r) => r.body.map((e: any) => e.eventName ?? e.type));

describe("AVO-3946 in-flight sends", () => {
  beforeEach(() => {
    requests = [];
    (global as any).XMLHttpRequest = FakeXHR;
    window.localStorage.clear();
    AvoInspector.batchSize = 1;
  });

  afterEach(() => {
    (global as any).XMLHttpRequest = OriginalXHR;
    AvoInspector.batchSize = 30;
  });

  const newBatcher = (env: string = "prod"): AvoBatcher => {
    const inspector = new AvoInspector({
      apiKey: "api-key",
      env: AvoInspectorEnv.Prod,
      version: "1"
    });
    AvoInspector.batchSize = 1;
    const handler = new AvoNetworkCallsHandler(
      "api-key",
      env,
      "",
      "1",
      "test"
    );
    void inspector;
    return new AvoBatcher(handler);
  };

  test("4 rapid events send 4 events on the same page", async () => {
    const batcher = newBatcher();
    await flush();
    requests = [];

    ["a", "b", "c", "d"].forEach((name) => {
      batcher.handleTrackSchema(name, [], null, null);
    });

    // Answer every request as it arrives, as a server would.
    for (let i = 0; i < 10 && requests.some((r) => r !== undefined); i++) {
      const pending = requests.splice(0);
      pending.forEach((r) => {
        r.respond(200);
        sentRequests.push(r);
      });
      await flush();
    }

    expect(sentRequests.flatMap((r) => r.body.map((e: any) => e.eventName)))
      .toEqual(["a", "b", "c", "d"]);
  });

  test("after a failed batch, later events wait for the next batch or the flush window", async () => {
    const batcher = newBatcher();
    AvoInspector.batchSize = 30;
    await flush();
    requests = [];

    for (let i = 0; i < 30; i++) {
      batcher.handleTrackSchema("before-" + i, [], null, null);
    }
    expect(requests).toHaveLength(1);
    expect(requests[0].body).toHaveLength(30);
    const failed = requests.shift();
    expect(failed).toBeDefined();
    failed?.timeOut();
    await flush();

    // The failed 30 are queued again. Each later event must not resend the
    // whole queue while the network is failing.
    for (let i = 0; i < 10; i++) {
      batcher.handleTrackSchema("after-" + i, [], null, null);
    }
    await flush();
    expect(requests).toHaveLength(0);

    // Once the flush window has passed, the next event sends the whole queue.
    const now = Date.now();
    const dateNow = jest
      .spyOn(Date, "now")
      .mockReturnValue(now + AvoInspector.batchFlushSeconds * 1000);
    try {
      batcher.handleTrackSchema("flush", [], null, null);
      await flush();
      expect(requests).toHaveLength(1);
      expect(requests[0].body).toHaveLength(41);
    } finally {
      dateNow.mockRestore();
    }
  });

  const sentRequests: FakeRequest[] = [];
  beforeEach(() => {
    sentRequests.length = 0;
  });

  test("a timed-out batch is retried with the same messageId", async () => {
    const batcher = newBatcher();
    await flush();
    requests = [];

    batcher.handleTrackSchema("a", [], null, null);
    const first = requests.shift() as FakeRequest;
    first.timeOut();
    await flush();

    batcher.handleTrackSchema("b", [], null, null);
    expect(sentEventNames()).toContain("a");
    const resent = requests
      .flatMap((r) => r.body)
      .find((e: any) => e.eventName === "a");
    expect(resent.messageId).toEqual(first.body[0].messageId);
  });

  const sendValidated = (inspector: AvoInspector): void => {
    (inspector as any).sendEventWithValidation(
      "validated",
      [{ propertyName: "p", propertyType: "string" }],
      null,
      null,
      {
        metadata: {
          schemaId: "s",
          branchId: "branch-1",
          latestActionId: "a",
          sourceId: "src"
        },
        propertyResults: {}
      }
    );
  };

  const newDevInspector = async (): Promise<AvoInspector> => {
    const inspector = new AvoInspector({
      apiKey: "api-key",
      env: AvoInspectorEnv.Dev,
      version: "1"
    });
    await flush();
    requests = [];
    return inspector;
  };

  test("a validated send waits at least 10 s, a prod batch keeps the network timeout", async () => {
    const inspector = await newDevInspector();
    sendValidated(inspector);
    expect(requests).toHaveLength(1);
    expect(requests[0].timeout).toEqual(10000);

    const batcher = newBatcher();
    await flush();
    requests = [];
    batcher.handleTrackSchema("batched", [], null, null);
    expect(requests).toHaveLength(1);
    expect(requests[0].timeout).toEqual(AvoInspector.networkTimeout);
  });

  test("a validated send keeps a network timeout raised above 10 s", async () => {
    const original = AvoInspector.networkTimeout;
    AvoInspector.networkTimeout = 15000;
    try {
      const inspector = await newDevInspector();
      sendValidated(inspector);
      expect(requests[0].timeout).toEqual(15000);
    } finally {
      AvoInspector.networkTimeout = original;
    }
  });

  test("a validated send keeps a network timeout of 0 (no timeout)", async () => {
    const original = AvoInspector.networkTimeout;
    AvoInspector.networkTimeout = 0;
    try {
      const inspector = await newDevInspector();
      sendValidated(inspector);
      expect(requests[0].timeout).toEqual(0);
    } finally {
      AvoInspector.networkTimeout = original;
    }
  });

  test("a dev or staging batch waits at least 10 s, a prod batch keeps the network timeout", async () => {
    const timeouts: Record<string, number> = {};
    for (const env of ["dev", "staging", "prod"]) {
      // Each batcher replays the stored queue on construction; start empty.
      window.localStorage.clear();
      const batcher = newBatcher(env);
      await flush();
      requests = [];
      batcher.handleTrackSchema("batched", [], null, null);
      expect(requests).toHaveLength(1);
      timeouts[env] = requests[0].timeout;
    }
    expect(timeouts).toEqual({
      dev: 10000,
      staging: 10000,
      prod: AvoInspector.networkTimeout
    });
  });

  test("a dev batch keeps a network timeout of 0 (no timeout)", async () => {
    const original = AvoInspector.networkTimeout;
    AvoInspector.networkTimeout = 0;
    try {
      const batcher = newBatcher("dev");
      await flush();
      requests = [];
      batcher.handleTrackSchema("batched", [], null, null);
      expect(requests[0].timeout).toEqual(0);
    } finally {
      AvoInspector.networkTimeout = original;
    }
  });

  test("a timed-out validated send is retried as the same body", async () => {
    const inspector = await newDevInspector();
    sendValidated(inspector);
    expect(requests).toHaveLength(1);
    const immediate = requests.shift() as FakeRequest;
    const original = immediate.body[0];
    expect(original.validatedBranchId).toEqual("branch-1");

    // The request reached the server, but its response came after the timeout.
    immediate.timeOut();
    await flush();

    const retried = requests.flatMap((r) => r.body);
    expect(retried).toHaveLength(1);
    expect(retried[0].messageId).toEqual(original.messageId);
    expect(retried[0].createdAt).toEqual(original.createdAt);
    expect(retried[0].validatedBranchId).toEqual("branch-1");
  });
});
