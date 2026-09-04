type t

type env = [
  | #dev
  | #staging
  | #prod
]

type options = {
  apiKey: string,
  env: env,
  version: string,
  publicEncryptionKey?: string,
}

@new @module("avo-inspector")
external make: options => t = "AvoInspector"

/**
 * Per-call gateway coordinates. Omitted fields are omitted from the emitted JS
 * object, which is exactly how the SDK expects an absent option.
 *
 * BACKEND NOTE (as of 3.3.0): `POST /inspector/v1/track` does not yet honor
 * `outputReference`/`originHint`, and drops any event whose `appVersion` is
 * null while still answering 200 — so pair `originHint` with `appVersion`
 * until the backend is updated.
 */
type trackOptions = {
  outputReference?: string,
  originHint?: string,
  appVersion?: string,
}

@send
external trackSchemaFromEvent: (t, string, Js.Json.t) => unit = "trackSchemaFromEvent"

/** Same JS method as `trackSchemaFromEvent`, called with the optional third argument. */
@send
external trackSchemaFromEventWithOptions: (t, string, Js.Json.t, trackOptions) => unit =
  "trackSchemaFromEvent"

@send
external trackSchema: (t, string, array<Js.Json.t>) => unit = "trackSchema"

/** Same JS method as `trackSchema`, called with the optional third argument. */
@send
external trackSchemaWithOptions: (t, string, array<Js.Json.t>, trackOptions) => unit = "trackSchema"

let setNetworkTimeout = (timeout) => {
  %raw(`require("avo-inspector").AvoInspector.networkTimeout = timeout`)
  ()
}