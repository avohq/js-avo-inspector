// NOTE: A lite copy of this file exists at src/lite/AvoNetworkCallsHandlerLite.ts — if you change this file, review the lite copy for applicability
import AvoGuid from "./AvoGuid";
import { AvoInspector } from "./AvoInspector";
import { AvoStreamId } from "./AvoStreamId";
import type { EventSpecMetadata } from "./eventSpec/AvoEventSpecFetchTypes";

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
  /** RSA public encryption key - allows Inspector to validate encrypted values against tracking plan */
  publicEncryptionKey?: string;
}

export interface SessionStartedBody extends BaseBody {
  type: "sessionStarted";
}

/**
 * Per-call gateway coordinates, sent as top-level siblings of `eventProperties`
 * on the track body — never nested inside the schema, and never read from event
 * data. Every value is trimmed; empty, whitespace-only and non-string values are
 * treated as absent.
 *
 * The endpoint this SDK posts to, `POST /inspector/v2/track`, decodes both
 * `outputReference` and `originHint` and accepts a literal `appVersion: null`
 * (stored as "unversioned"), so no field here has to be paired with another.
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

/** Shape of every X-Avo-Client token: "web", "gtm-web", "ios", "csharp", … */
const clientTokenPattern = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * Normalizes the X-Avo-Client value. Unlike the hint fields this one becomes a
 * request header, so an unusable value is not merely dropped from a body — it
 * makes setRequestHeader throw during synchronous request setup. That throw
 * would escape callInspectorWithBatchBody, which clears its `sending`
 * re-entrancy guard only from the completion callback, latching the guard and
 * silently cancelling every later batch for the lifetime of the page.
 *
 * The value arrives from a constructor option or, in the script-tag build, from
 * `window.inspector.__CLIENT__` — so a token copied out of a config with a
 * trailing newline is entirely plausible. Falling back to "web" loses one
 * attribution label; letting it through would lose all the events.
 */
function normalizeClient(client: string | undefined): string {
  if (typeof client !== "string") return "web";
  const trimmed = client.trim();
  if (trimmed === "") return "web";
  if (!clientTokenPattern.test(trimmed)) {
    if (AvoInspector.shouldLog) {
      console.warn(
        "[Avo Inspector] Unusable client value. Sending X-Avo-Client: web instead."
      );
    }
    return "web";
  }
  return trimmed;
}

export interface EventSchemaBody extends Omit<BaseBody, "appVersion"> {
  type: "event";

  /**
   * Nullable only here: with an originHint set and no per-event appVersion the
   * event is source-scoped, so a literal null is sent rather than the SDK's
   * configured version. Session-started bodies always carry the string version.
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

  /** Gateway output this observation was bound for; absent = gateway checkpoint. */
  outputReference?: string;
  /** Low-cardinality hint identifying the event's upstream source. */
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

export class AvoNetworkCallsHandler {
  private readonly apiKey: string;
  private readonly envName: string;
  private readonly appName: string;
  private readonly appVersion: string;
  private readonly libVersion: string;
  private readonly publicEncryptionKey?: string;
  private readonly client: string;
  private samplingRate: number = 1.0;
  private sending: boolean = false;

  private static readonly trackingEndpoint =
    "https://api.avo.app/inspector/v2/track";

  constructor(
    apiKey: string,
    envName: string,
    appName: string,
    appVersion: string,
    libVersion: string,
    publicEncryptionKey?: string,
    client?: string
  ) {
    this.apiKey = apiKey;
    this.envName = envName;
    this.appName = appName;
    this.appVersion = appVersion;
    this.libVersion = libVersion;
    this.publicEncryptionKey = publicEncryptionKey;
    this.client = normalizeClient(client);
  }

  callInspectorWithBatchBody(
    inEvents: Array<SessionStartedBody | EventSchemaBody>,
    onCompleted: (error: Error | null) => any
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
    this.callInspectorApi(events, (error) => {
      this.sending = false;
      onCompleted(error);
    });
  }

  private fixStreamIds(
    events: Array<SessionStartedBody | EventSchemaBody>
  ): void {
    let knownStreamId: string | null = null;
    events.forEach(function (event) {
      if (
        event.streamId !== null &&
        event.streamId !== undefined &&
        event.streamId !== "unknown"
      ) {
        knownStreamId = event.streamId;
      }
    });
    events.forEach(function (event) {
      if (event.streamId === "unknown") {
        if (knownStreamId != null) {
          event.streamId = knownStreamId;
        } else {
          event.streamId = AvoStreamId.streamId;
        }
      }
    });
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

    // Set gateway hints if provided and non-empty after normalization
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
      streamId: AvoStreamId.streamId,
      samplingRate: this.samplingRate
    };
    if (this.publicEncryptionKey) {
      body.publicEncryptionKey = this.publicEncryptionKey;
    }
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
    // Fix stream ID if needed
    if (eventBody.streamId === "unknown") {
      eventBody.streamId = AvoStreamId.streamId;
    }

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
    onCompleted: (error: Error | null) => any
  ): void {
    const body = JSON.stringify(events);

    if (
      typeof CompressionStream === "undefined" ||
      body.length < gzipMinBodyLength
    ) {
      this.sendTrackingRequest(body, false, onCompleted);
      return;
    }

    gzip(body).then((compressed) => {
      if (compressed !== null) {
        this.sendTrackingRequest(compressed, true, onCompleted);
      } else {
        this.sendTrackingRequest(body, false, onCompleted);
      }
    });
  }

  private sendTrackingRequest(
    body: string | Uint8Array,
    isGzipped: boolean,
    onCompleted: (error: Error | null) => any
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
      xmlhttp.open("POST", AvoNetworkCallsHandler.trackingEndpoint, true);
      // v2 reads the api key and env from headers (the body keeps carrying both,
      // so one body shape serves every endpoint version) and attributes traffic by
      // X-Avo-Client without decoding a body. None of the three is CORS-safelisted,
      // so a browser preflights every send — which is why the body is no longer
      // `text/plain`: that content type existed only to stay inside the safelist and
      // dodge the preflight, a saving custom headers cancel out, and v2's body reader
      // parses a text/plain body twice and throws.
      xmlhttp.setRequestHeader("Content-Type", "application/json");
      xmlhttp.setRequestHeader("api-key", this.apiKey);
      xmlhttp.setRequestHeader("env", this.envName);
      xmlhttp.setRequestHeader("X-Avo-Client", this.client);
      if (isGzipped) {
        xmlhttp.setRequestHeader("Content-Encoding", "gzip");
      }
      xmlhttp.timeout = AvoInspector.networkTimeout;
      xmlhttp.send(body as XMLHttpRequestBodyInit);
    } catch (e) {
      onCompleted(
        new Error(
          `Failed to send request: ${e instanceof Error ? e.message : String(e)}`
        )
      );
      return;
    }

    xmlhttp.onload = () => {
      if (xmlhttp.status !== 200) {
        onCompleted(new Error(`Error ${xmlhttp.status}: ${xmlhttp.statusText}`));
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
