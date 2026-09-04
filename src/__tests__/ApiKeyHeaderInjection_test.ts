/**
 * CR/LF in the `api-key` header value.
 *
 * Until v2 the api key travelled only inside the JSON body, where a newline is
 * just an escaped character and cannot break framing. Moving it into a request
 * header creates, in principle, a header-injection vector: a key containing
 * CR/LF could terminate the header and append attacker-chosen ones. Every Avo
 * sender that moved the key into a header inherits that question.
 *
 * In a browser the platform closes it — `setRequestHeader` validates the value
 * and throws rather than serializing it, so nothing can be injected. This file
 * pins that, and pins what happens to the send once it faults.
 *
 * Two separate protections are involved, and it is worth not confusing them.
 * The caller never sees the fault, but that is the outer `try`/`catch` in
 * `trackSchemaFromEvent` and `trackSchema` doing it, which predates the header
 * migration: it logs and returns an empty schema. What the migration did break
 * is recovery. The throw escaped `sendTrackingRequest`, and since the `sending`
 * re-entrancy guard is cleared only from the completion callback, it latched
 * and every later batch was cancelled for the lifetime of the page. The outer
 * catch hid the exception from the app but could not clear that guard, so one
 * mistyped api key silently ended all telemetry rather than failing one send.
 * The last test here is the one that covers that.
 *
 * Deliberately no import of `../__mocks__/xhr`: these tests run against jsdom's
 * real XMLHttpRequest, so the validation being relied on is the platform's own
 * rather than an emulation of it. Only `send` is stubbed, to keep the suite off
 * the network.
 */
import { AvoInspector } from "../AvoInspector";
import { AvoInspectorLite } from "../lite/AvoInspectorLite";

import { defaultOptions } from "./constants";

/** A key that would inject a header if the value were serialized verbatim. */
const crlfKey = "api-key-xxx\r\nX-Injected: yes";

/**
 * Builds an inspector that flushes on every event.
 *
 * The batch size has to be set AFTER construction: the constructor assigns the
 * static from the environment (30 in prod), so setting it first is silently
 * undone. Getting that wrong makes every assertion below vacuous, since nothing
 * ever reaches the network — which is what the control test at the end exists
 * to catch.
 */
const flushingInspector = (apiKey: string): AvoInspector => {
  const inspector = new AvoInspector({ ...defaultOptions, apiKey });
  inspector.enableLogging(false);
  AvoInspector.batchSize = 1;
  return inspector;
};

const flushingLiteInspector = (apiKey: string): AvoInspectorLite => {
  const inspector = new AvoInspectorLite({ ...defaultOptions, apiKey });
  inspector.enableLogging(false);
  AvoInspectorLite.batchSize = 1;
  return inspector;
};

let sendSpy: jest.SpyInstance;

beforeEach(() => {
  // Stub only send: open() and setRequestHeader() stay real, which is the whole
  // point — the validation under test is theirs.
  sendSpy = jest
    .spyOn(XMLHttpRequest.prototype, "send")
    .mockImplementation(() => {});
});

afterEach(() => {
  sendSpy.mockRestore();
  jest.clearAllMocks();
});

describe("the platform rejects a header value that could inject", () => {
  const setHeader = (value: string): (() => void) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "https://api.avo.app/inspector/v2/track", true);
    return () => {
      xhr.setRequestHeader("api-key", value);
    };
  };

  test("CR, LF, CRLF and NUL are all refused", () => {
    expect(setHeader(crlfKey)).toThrow();
    expect(setHeader("api-key-xxx\nX-Injected: yes")).toThrow();
    expect(setHeader("api-key-xxx\rX-Injected: yes")).toThrow();
    expect(setHeader("api-key-xxx\u0000")).toThrow();
  });

  test("a plain key is accepted", () => {
    expect(setHeader("api-key-xxx")).not.toThrow();
  });

  test("a trailing newline is trimmed, not injected", () => {
    // Worth pinning because it is the realistic typo — a key pasted out of a
    // file or an env var. The header algorithm strips surrounding HTTP
    // whitespace before validating, so this is accepted and sent as the trimmed
    // key. It is not a fault, and it needs no SDK-side validation.
    expect(setHeader("api-key-xxx\n")).not.toThrow();
  });
});

describe("an unusable api key does not throw at the caller", () => {
  test("full build: trackSchemaFromEvent resolves instead of rejecting", async () => {
    const inspector = flushingInspector(crlfKey);

    // The assertion is the absence of a rejection. If the DOMException escaped
    // sendTrackingRequest it would surface here, in the host app's await.
    await expect(
      inspector.trackSchemaFromEvent("Ev", { a: 1 })
    ).resolves.toBeDefined();

    // And nothing was put on the wire, so there was nothing to inject into.
    expect(sendSpy).not.toHaveBeenCalled();
  });

  test("lite build: trackSchemaFromEvent resolves instead of rejecting", async () => {
    const inspector = flushingLiteInspector(crlfKey);

    await expect(
      inspector.trackSchemaFromEvent("Ev", { a: 1 })
    ).resolves.toBeDefined();

    expect(sendSpy).not.toHaveBeenCalled();
  });

  test("full build: trackSchema resolves instead of rejecting", async () => {
    const inspector = flushingInspector(crlfKey);

    await expect(
      inspector.trackSchema("Ev", [
        { propertyName: "a", propertyType: "int" }
      ])
    ).resolves.not.toThrow();

    expect(sendSpy).not.toHaveBeenCalled();
  });

  test("the failed send does not wedge the SDK for later events", async () => {
    // The property the outer catch cannot provide, and the reason the handler
    // needs its own. If `sending` latches, the second event never reaches the
    // request setup at all and the SDK is silently finished for this page.
    const headerSpy = jest.spyOn(XMLHttpRequest.prototype, "setRequestHeader");
    const inspector = flushingInspector(crlfKey);

    await inspector.trackSchemaFromEvent("Ev one", { a: 1 });
    const attemptsAfterFirst = headerSpy.mock.calls.length;

    await inspector.trackSchemaFromEvent("Ev two", { b: 2 });

    expect(attemptsAfterFirst).toBeGreaterThan(0);
    expect(headerSpy.mock.calls.length).toBeGreaterThan(attemptsAfterFirst);
    headerSpy.mockRestore();
  });

  test("a usable key on the same path does reach send", async () => {
    // Control: without this the tests above would pass even if tracking had
    // silently stopped working for every key.
    const inspector = flushingInspector(defaultOptions.apiKey);

    await inspector.trackSchemaFromEvent("Ev", { a: 1 });

    expect(sendSpy).toHaveBeenCalled();
  });
});
