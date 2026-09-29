// LITE COPY of src/AvoNetworkCallsHandler.ts — Sync: review src/AvoNetworkCallsHandler.ts changes for applicability here
import AvoGuid from "../AvoGuid";
import { AvoInspector } from "./AvoInspectorLite";
import type { EventSpecMetadata } from "../eventSpec/AvoEventSpecFetchTypes";

/**
 * Recursive type for schema children.
 * - For object properties: array of EventProperty objects
 * - For list properties: array of strings (primitive types) or nested structures
 */
export type SchemaChild = string | EventProperty | SchemaChild[];

/**
 * Property schema with optional validation results.
 */
export interface EventProperty {
  propertyName: string;
  propertyType: string;
  encryptedPropertyValue?: string;
  children?: SchemaChild[];
  /** Event/variant IDs that FAILED validation (present if smaller or equal to passed) */
  failedEventIds?: string[];
  /** Event/variant IDs that PASSED validation (present if smaller than failed) */
  passedEventIds?: string[];
}

export interface BaseBody {
  apiKey: string;
  appName: string;
  appVersion: string;
  libVersion: string;
  env: string;
  libPlatform: "web";
  messageId: string;
  trackingId: string;
  createdAt: string;
  sessionId: string;
  streamId: string;
  samplingRate: number;
  /** Event spec metadata from EventSpecResponse (moved from EventSchemaBody) */
  eventSpecMetadata?: EventSpecMetadata;
}

export interface SessionStartedBody extends BaseBody {
  type: "sessionStarted";
}

/**
 * INTERNAL — not part of the public API, and not exported from either entry
 * point. Per-call gateway coordinates for the web GTM tag template, which passes
 * them as a third argument to `window.inspector.trackSchemaFromEvent` in the
 * script-tag build (see src/browser.js).
 *
 * They are sent as top-level siblings of `eventProperties` on the track body —
 * never nested inside the schema, and never read from event data. Every value is
 * trimmed; empty, whitespace-only and non-string values are treated as absent.
 *
 * They only apply on the v2 transport, i.e. when a client is configured.
 * `POST /inspector/v2/track` decodes both hints and accepts a literal
 * `appVersion: null` (stored as "unversioned"). Without a client the SDK is on
 * `POST /inspector/v1/track` and the options are ignored entirely, `appVersion`
 * included, so the body is exactly the one 3.2.0 built.
 *
 * Defined locally (not imported) in both AvoNetworkCallsHandler.ts and
 * AvoNetworkCallsHandlerLite.ts to keep the lite-sync diff flat.
 */
export interface TrackOptions {
  /** Reference of the gateway output this observation was bound for. Omit for a gateway-level observation. */
  outputReference?: string;
  /** Low-cardinality hint identifying the event's upstream source (e.g. "web", "ios"). Never a user identifier. */
  originHint?: string;
  /** App version of the source that produced the event. With originHint set, replaces the SDK's configured version (literal null when omitted); without originHint, overrides it only when provided. */
  appVersion?: string;
}

/**
 * Normalizes a hint value: strings are trimmed; anything else (numbers,
 * booleans, null, undefined, objects, arrays) is treated as absent.
 */
function normalizeHint(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * The only client that selects the v2 transport: the one the web GTM tag template
 * writes to `window.inspector.__CLIENT__`. It is also the only `X-Avo-Client`
 * value this SDK ever sends.
 */
const webGtmTemplateClient = "gtm-web";

/**
 * Normalizes the client, which is also what selects the transport. It returns
 * "gtm-web" — v2 — only when the client is a string that is exactly "gtm-web"
 * after trimming (a value copied out of a config keeps its trailing newline, so
 * trimming keeps that attribution). Anything else — absent, blank, non-string,
 * "web", another platform token, a different case — returns undefined: v1,
 * exactly as 3.2.0 sent it. Every caller other than the web GTM tag template
 * stays on v1.
 *
 * Returning only the constant also means no caller-supplied string ever becomes
 * a request header, so an unusable value can never make setRequestHeader throw
 * during synchronous request setup.
 */
function normalizeClient(client: unknown): string | undefined {
  return normalizeHint(client) === webGtmTemplateClient
    ? webGtmTemplateClient
    : undefined;
}

/**
 * Whether a value can be sent as a request header as it is. Browsers throw from
 * setRequestHeader for a value containing NUL, CR or LF, or any code point above
 * U+00FF. Only v2 sends the api key and env as headers.
 */
function isHeaderValue(value: unknown): value is string {
  return (
    typeof value === "string" && !/[\u0000\n\r]|[^\u0000-\u00ff]/.test(value)
  );
}

/**
 * v2 only: after this many permanent failures in a row (a request the browser
 * refuses to build, or a 4xx other than 408 and 429), the handler stops trying.
 * For this instance's own events it stops sending for the rest of the page,
 * while the batcher keeps queueing them, so a later page load can still deliver
 * them. For events queued under another api key and env it drops that group,
 * which is the only case where events are discarded: nothing on a later page can
 * change the key they carry.
 */
const maxConsecutivePermanentFailures = 3;

/** Events of a failed send that are worth queueing again; undefined means all of them. */
type RetryEvents = Array<SessionStartedBody | EventSchemaBody> | undefined;

export interface EventSchemaBody extends Omit<BaseBody, "appVersion"> {
  type: "event";

  /**
   * Nullable only here, and only on v2: with an originHint set and no per-event
   * appVersion the event is source-scoped, so a literal null is sent rather than
   * the SDK's configured version. Session-started bodies, and every v1 body,
   * always carry the string version.
   */
  appVersion: string | null;

  // Identification
  /** ID of the base event from spec (null if no spec available) */
  eventId: string | null;
  /** Name seen in code */
  eventName?: string;

  // Runtime Properties with validation results
  eventProperties: EventProperty[];

  // Legacy fields
  avoFunction: boolean;
  eventHash: string | null;

  /** Branch ID from getEventSpec response when value validation was performed */
  validatedBranchId?: string;

  /** Gateway output this observation was bound for; absent = gateway checkpoint. v2 only. */
  outputReference?: string;
  /** Low-cardinality hint identifying the event's upstream source. v2 only. */
  originHint?: string;
}

/** Bodies smaller than this are sent uncompressed — gzip overhead outweighs the gain. */
const gzipMinBodyLength = 1024;

/**
 * Gzips a string body using the browser-native CompressionStream API.
 * Returns null if compression fails for any reason.
 */
async function gzip(body: string): Promise<Uint8Array | null> {
  try {
    const stream = new CompressionStream("gzip");
    const writer = stream.writable.getWriter();
    writer.write(new TextEncoder().encode(body)).catch(() => {});
    writer.close().catch(() => {});

    const reader = stream.readable.getReader();
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      totalLength += value.length;
    }

    const result = new Uint8Array(totalLength);
    let offset = 0;
    chunks.forEach((chunk) => {
      result.set(chunk, offset);
      offset += chunk.length;
    });
    return result;
  } catch {
    return null;
  }
}

export class AvoNetworkCallsHandlerLite {
  private readonly apiKey: string;
  private readonly envName: string;
  private readonly appName: string;
  private readonly appVersion: string;
  private readonly libVersion: string;
  /**
   * "gtm-web" for the web GTM tag template, otherwise undefined. It is the
   * transport switch, decided once in the constructor: undefined keeps the v1
   * request byte for byte as 3.2.0 sent it; "gtm-web" selects v2 and is the
   * X-Avo-Client value.
   */
  private readonly client: string | undefined;
  private readonly trackingEndpoint: string;
  private samplingRate: number = 1.0;
  private sending: boolean = false;
  /** v2 only: permanent failures in a row for this instance's own events. */
  private permanentFailures: number = 0;
  /** v2 only: permanent failures in a row per other api key and env, keyed as the send groups are. */
  private readonly foreignFailures: Record<string, number> = {};
  /** v2 only: set at most once, when sending can no longer succeed on this page. */
  private sendingDisabled: boolean = false;
  /** v2 only: set when the events themselves can never be sent, so queueing them would only grow the stored queue. */
  private queueingDisabled: boolean = false;

  constructor(
    apiKey: string,
    envName: string,
    appName: string,
    appVersion: string,
    libVersion: string,
    client?: string
  ) {
    this.apiKey = apiKey;
    this.envName = envName;
    this.appName = appName;
    this.appVersion = appVersion;
    this.libVersion = libVersion;
    this.client = normalizeClient(client);
    this.trackingEndpoint =
      this.client === undefined
        ? "https://api.avo.app/inspector/v1/track"
        : "https://api.avo.app/inspector/v2/track";
    // v2 sends the api key and env as headers. One the browser refuses would fail
    // every send, so v2 stops before queueing anything instead of retrying.
    if (
      this.client !== undefined &&
      !(isHeaderValue(apiKey) && isHeaderValue(envName))
    ) {
      this.disableSending("the api key cannot be sent as a request header");
      // Every event this instance builds would carry that key, so queueing is pointless too.
      this.queueingDisabled = true;
    }
  }

  /**
   * v2 only: true once sending has stopped for this page (see
   * maxConsecutivePermanentFailures). Always false on v1.
   */
  isSendingDisabled(): boolean {
    return this.sendingDisabled;
  }

  /**
   * v2 only: true when queueing events would only grow the stored queue, because
   * they could never be sent under any configuration. Always false on v1.
   */
  isQueueingDisabled(): boolean {
    return this.queueingDisabled;
  }

  private disableSending(reason: string): void {
    this.sendingDisabled = true;
    console.error(
      "[Avo Inspector] Stopped sending events on this page: " + reason + "."
    );
  }

  callInspectorWithBatchBody(
    inEvents: Array<SessionStartedBody | EventSchemaBody>,
    onCompleted: (error: Error | null, retryEvents?: RetryEvents) => any
  ): void {
    if (this.sending) {
      onCompleted(
        new Error(
          "Batch sending cancelled because another batch sending is in progress. Your events will be sent with next batch."
        )
      );
      return;
    }

    const events = inEvents.filter((x) => x != null);
    this.fixStreamIds(events);

    if (events.length === 0) {
      return;
    }

    if (this.shouldDropBySampling()) {
      if (AvoInspector.shouldLog) {
        console.log(
          "Avo Inspector: last event schema dropped due to sampling rate."
        );
      }
      return;
    }

    if (AvoInspector.shouldLog) {
      console.log("Avo Inspector: events", events);
      events.forEach((event) => {
        if (event.type === "sessionStarted") {
          console.log("Avo Inspector: sending session started event.");
        } else if (event.type === "event") {
          console.log(
            "Avo Inspector: sending event " +
              event.eventName +
              " with schema " +
              JSON.stringify(event.eventProperties)
          );
        }
      });
    }

    this.sending = true;
    this.callInspectorApi(events, (error, retryEvents) => {
      this.sending = false;
      if (retryEvents === undefined) {
        onCompleted(error);
      } else {
        onCompleted(error, retryEvents);
      }
    });
  }

  private fixStreamIds(
    _events: Array<SessionStartedBody | EventSchemaBody>
  ): void {
    // No-op in lite build: streamId is a dev/staging debugger feature
  }

  bodyForSessionStartedCall(): SessionStartedBody {
    const sessionBody = this.createBaseCallBody() as SessionStartedBody;
    sessionBody.type = "sessionStarted";
    return sessionBody;
  }

  bodyForEventSchemaCall(
    eventName: string,
    eventProperties: EventProperty[],
    eventId: string | null,
    eventHash: string | null,
    eventSpecMetadata?: EventSpecMetadata,
    validatedBranchId?: string,
    options?: TrackOptions
  ): EventSchemaBody {
    const eventSchemaBody = this.createBaseCallBody() as EventSchemaBody;
    eventSchemaBody.type = "event";
    eventSchemaBody.eventName = eventName;
    eventSchemaBody.eventProperties = eventProperties;

    if (eventId != null) {
      eventSchemaBody.avoFunction = true;
      eventSchemaBody.eventId = eventId;
      eventSchemaBody.eventHash = eventHash;
    } else {
      eventSchemaBody.avoFunction = false;
      eventSchemaBody.eventId = null;
      eventSchemaBody.eventHash = null;
    }

    // Set metadata on base body if provided
    if (eventSpecMetadata) {
      eventSchemaBody.eventSpecMetadata = eventSpecMetadata;
    }

    // Set validated branch ID if value validation was performed
    if (validatedBranchId) {
      eventSchemaBody.validatedBranchId = validatedBranchId;
    }

    // Gateway options belong to the v2 transport. Without a client they are
    // ignored entirely — the appVersion override included — so the body is
    // exactly the one 3.2.0 built for the same call.
    if (this.client !== undefined) {
      const outputReference = normalizeHint(options?.outputReference);
      const originHint = normalizeHint(options?.originHint);
      const appVersion = normalizeHint(options?.appVersion);
      if (outputReference !== undefined) {
        eventSchemaBody.outputReference = outputReference;
      }
      if (originHint !== undefined) {
        eventSchemaBody.originHint = originHint;
        // An origin hint marks an event from another source, whose app version is
        // unrelated to this SDK instance's configured version.
        eventSchemaBody.appVersion = appVersion !== undefined ? appVersion : null;
      } else if (appVersion !== undefined) {
        eventSchemaBody.appVersion = appVersion;
      }
    }

    return eventSchemaBody;
  }

  private createBaseCallBody(): BaseBody {
    const body: BaseBody = {
      apiKey: this.apiKey,
      appName: this.appName,
      appVersion: this.appVersion,
      libVersion: this.libVersion,
      env: this.envName,
      libPlatform: "web",
      messageId: AvoGuid.newGuid(),
      trackingId: "",
      createdAt: new Date().toISOString(),
      sessionId: "",
      streamId: "",
      samplingRate: this.samplingRate
    };
    return body;
  }

  /**
   * Calls Inspector API immediately with a single event (bypasses batching).
   * Used when event spec validation is available.
   * Note: Does not drop due to sampling - validated events are always sent.
   */
  callInspectorImmediately(
    eventBody: EventSchemaBody,
    onCompleted: (error: Error | null) => any
  ): void {
    if (AvoInspector.shouldLog) {
      console.log(
        "Avo Inspector: calling inspector immediately (with validation)",
        eventBody.eventName
      );
      console.log("Avo Inspector: event body", eventBody);
    }

    this.callInspectorApi([eventBody], onCompleted);
  }

  /**
   * Check if event should be dropped based on sampling rate.
   */
  private shouldDropBySampling(): boolean {
    return Math.random() > this.samplingRate;
  }

  /**
   * Core Inspector API call logic shared by batch and immediate calls.
   *
   * Bodies large enough to be worth it are gzipped (with Content-Encoding: gzip)
   * to cut network volume ~10x. When CompressionStream is unavailable or
   * compression fails, the body is sent uncompressed exactly as before —
   * synchronously in the unavailable case, so legacy timing is preserved.
   */
  private callInspectorApi(
    events: Array<SessionStartedBody | EventSchemaBody>,
    onCompleted: (error: Error | null, retryEvents?: RetryEvents) => any
  ): void {
    if (this.client === undefined) {
      this.sendEvents(events, this.apiKey, this.envName, (error) => {
        onCompleted(error);
      });
      return;
    }

    // v2 takes the api key and env from the headers, for every event in the
    // request, so each event is sent under the ones it was queued with. They
    // differ from this instance's only for events persisted by an earlier page
    // with another configuration — a GTM Preview load flushing a published
    // container's queue, or the reverse. One request per pair, in order.
    const groups: Array<Array<SessionStartedBody | EventSchemaBody>> = [];
    const groupKeys: string[] = [];
    events.forEach((event) => {
      const key = JSON.stringify([event.apiKey, event.env]);
      let index = groupKeys.indexOf(key);
      if (index === -1) {
        index = groupKeys.push(key) - 1;
        groups.push([]);
      }
      groups[index].push(event);
    });

    const retryEvents: Array<SessionStartedBody | EventSchemaBody> = [];
    let firstError: Error | null = null;
    const sendGroup = (index: number): void => {
      if (index === groups.length) {
        if (firstError === null) {
          onCompleted(null);
        } else {
          onCompleted(firstError, retryEvents);
        }
        return;
      }
      const group = groups[index];
      const groupKey = groupKeys[index];
      const apiKey = group[0].apiKey;
      const env = group[0].env;
      const own = apiKey === this.apiKey && env === this.envName;
      const completed = (error: Error | null, permanent?: boolean): void => {
        if (error === null) {
          if (own) {
            this.permanentFailures = 0;
          } else {
            delete this.foreignFailures[groupKey];
          }
        } else {
          firstError = firstError || error;
          if (!permanent) {
            Array.prototype.push.apply(retryEvents, group);
          } else if (own) {
            // Kept: the api key and env are this page's, and a later page load —
            // or the server catching up on a key it has not seen yet — can still
            // deliver them. Sending stops, queueing does not.
            Array.prototype.push.apply(retryEvents, group);
            this.permanentFailures += 1;
            if (
              !this.sendingDisabled &&
              this.permanentFailures >= maxConsecutivePermanentFailures
            ) {
              this.disableSending(
                "the Avo Inspector API refused its events " +
                  maxConsecutivePermanentFailures +
                  " times in a row"
              );
            }
          } else {
            // Queued under another api key and env, which a retry cannot change.
            // Retried a few times anyway, in case the refusal was about the
            // moment rather than the key, then dropped.
            const failures = (this.foreignFailures[groupKey] || 0) + 1;
            this.foreignFailures[groupKey] = failures;
            if (failures < maxConsecutivePermanentFailures) {
              Array.prototype.push.apply(retryEvents, group);
            }
          }
        }
        sendGroup(index + 1);
      };
      if (this.sendingDisabled) {
        completed(new Error("Sending events is stopped on this page"));
      } else if (!isHeaderValue(apiKey) || !isHeaderValue(env)) {
        completed(
          new Error(
            "Failed to send request: the api key or env cannot be sent as a request header"
          ),
          true
        );
      } else {
        this.sendEvents(group, apiKey, env, completed);
      }
    };
    sendGroup(0);
  }

  private sendEvents(
    events: Array<SessionStartedBody | EventSchemaBody>,
    apiKey: string,
    env: string,
    onCompleted: (error: Error | null, permanent?: boolean) => any
  ): void {
    const body = JSON.stringify(events);

    if (
      typeof CompressionStream === "undefined" ||
      body.length < gzipMinBodyLength
    ) {
      this.sendTrackingRequest(body, false, apiKey, env, onCompleted);
      return;
    }

    gzip(body).then((compressed) => {
      if (compressed !== null) {
        this.sendTrackingRequest(compressed, true, apiKey, env, onCompleted);
      } else {
        this.sendTrackingRequest(body, false, apiKey, env, onCompleted);
      }
    });
  }

  /**
   * Reports a failure as permanent (second argument true) when retrying the same
   * request cannot succeed: the browser refused to build it, or the API answered
   * a 4xx other than 408 and 429.
   */
  private sendTrackingRequest(
    body: string | Uint8Array,
    isGzipped: boolean,
    apiKey: string,
    env: string,
    onCompleted: (error: Error | null, permanent?: boolean) => any
  ): void {
    // Everything from construction up to and including send() runs synchronously,
    // and any of it can throw: a header value the browser rejects, or a send() the
    // environment refuses. callInspectorWithBatchBody clears its `sending`
    // re-entrancy guard only from onCompleted, so an exception escaping this method
    // would latch the guard and silently cancel every later batch for the lifetime
    // of the page. Reporting through onCompleted keeps that path recoverable — the
    // batcher puts the events back and retries with the next batch.
    //
    // The XMLHttpRequest construction is inside the try for the same reason. What
    // that buys is a precise guarantee, worth stating exactly: no synchronous XHR
    // setup step can throw out of this method, on either the direct or the gzipped
    // path. It is NOT a claim that the method never throws — onCompleted is the
    // caller's own callback, typed to return any, and a throw from it propagates.
    // That case is harmless here: callInspectorWithBatchBody clears `sending`
    // before forwarding to its caller's callback, so a throwing callback cannot
    // latch the guard; on the gzipped path it surfaces as an unhandled rejection.
    // The event handlers below are assigned after the try deliberately — they run
    // in a later task, which no try/catch here could cover.
    let xmlhttp: XMLHttpRequest;
    try {
      xmlhttp = new XMLHttpRequest();
      xmlhttp.open("POST", this.trackingEndpoint, true);
      if (this.client === undefined) {
        // v1, byte for byte the 3.2.0 request: the api key and env travel only in
        // the body, and text/plain keeps an uncompressed send inside the CORS
        // safelist, so it is not preflighted.
        xmlhttp.setRequestHeader("Content-Type", "text/plain");
      } else {
        // v2 reads the api key and env from headers (the body keeps carrying both,
        // so one body shape serves every endpoint version) and attributes traffic
        // by X-Avo-Client without decoding a body. None of the three is
        // CORS-safelisted, so a browser preflights every v2 send — which is why the
        // body is not `text/plain` here: that content type existed only to stay
        // inside the safelist and dodge the preflight, a saving custom headers
        // cancel out, and v2's body reader parses a text/plain body twice and throws.
        xmlhttp.setRequestHeader("Content-Type", "application/json");
        xmlhttp.setRequestHeader("api-key", apiKey);
        xmlhttp.setRequestHeader("env", env);
        xmlhttp.setRequestHeader("X-Avo-Client", this.client);
      }
      if (isGzipped) {
        xmlhttp.setRequestHeader("Content-Encoding", "gzip");
      }
      xmlhttp.timeout = AvoInspector.networkTimeout;
      xmlhttp.send(body as XMLHttpRequestBodyInit);
    } catch (e) {
      onCompleted(
        new Error(
          `Failed to send request: ${e instanceof Error ? e.message : String(e)}`
        ),
        true
      );
      return;
    }

    xmlhttp.onload = () => {
      if (xmlhttp.status !== 200) {
        onCompleted(
          new Error(`Error ${xmlhttp.status}: ${xmlhttp.statusText}`),
          xmlhttp.status >= 400 &&
            xmlhttp.status < 500 &&
            xmlhttp.status !== 408 &&
            xmlhttp.status !== 429
        );
      } else {
        let response: any;
        try {
          response = JSON.parse(xmlhttp.response);
        } catch (e) {
          onCompleted(
            new Error(
              `Failed to parse response: ${e instanceof Error ? e.message : String(e)}`
            )
          );
          return;
        }

        if (
          response != null &&
          typeof response.samplingRate === "number" &&
          !isNaN(response.samplingRate)
        ) {
          this.samplingRate = response.samplingRate;
        }
        onCompleted(null);
      }
    };

    xmlhttp.onerror = () => {
      onCompleted(new Error("Request failed"));
    };

    xmlhttp.ontimeout = () => {
      onCompleted(new Error("Request timed out"));
    };
  }
}

// Alias export so sibling lite modules can import { AvoNetworkCallsHandler } from "./AvoNetworkCallsHandlerLite"
export { AvoNetworkCallsHandlerLite as AvoNetworkCallsHandler };
