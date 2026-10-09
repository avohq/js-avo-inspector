import { AvoBatcher } from "../AvoBatcher";
import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";
import { AvoNetworkCallsHandler } from "../AvoNetworkCallsHandler";

// AVO-3946: a send in flight must not make other events wait for a later event
// or a page load, and a timed-out validated send must be retried as the same
// body rather than as a new event.

type FakeRequest = {
  body: any[];
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

  const newBatcher = (): AvoBatcher => {
    const inspector = new AvoInspector({
      apiKey: "api-key",
      env: AvoInspectorEnv.Prod,
      version: "1"
    });
    AvoInspector.batchSize = 1;
    const handler = new AvoNetworkCallsHandler(
      "api-key",
      "prod",
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

  const sentRequests: FakeRequest[] = [];
  beforeEach(() => {
    sentRequests.length = 0;
  });

  test("a timed-out batch is retried with the same messageId", async () => {
    const batcher = newBatcher();
    await flush();
    requests = [];

    batcher.handleTrackSchema("a", [], null, null);
    const first = requests.shift()!;
    first.timeOut();
    await flush();

    batcher.handleTrackSchema("b", [], null, null);
    expect(sentEventNames()).toContain("a");
    const resent = requests
      .flatMap((r) => r.body)
      .find((e: any) => e.eventName === "a");
    expect(resent.messageId).toEqual(first.body[0].messageId);
  });

  test("a timed-out validated send is retried as the same body", async () => {
    const inspector = new AvoInspector({
      apiKey: "api-key",
      env: AvoInspectorEnv.Dev,
      version: "1"
    });
    await flush();
    requests = [];

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
    expect(requests).toHaveLength(1);
    const immediate = requests.shift()!;
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
