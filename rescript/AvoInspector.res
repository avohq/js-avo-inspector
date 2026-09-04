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
  /**
   * Value of the `X-Avo-Client` header. Defaults to `"web"` when omitted; set it
   * only when embedding this SDK in another Avo integration that needs its own
   * attribution.
   */
  client?: string,
}

@new @module("avo-inspector")
external make: options => t = "AvoInspector"

/**
 * Per-call gateway coordinates. Omitted fields are omitted from the emitted JS
 * object, which is exactly how the SDK expects an absent option.
 *
 * `POST /inspector/v2/track`, the endpoint the SDK posts to, decodes both
 * `outputReference` and `originHint` and accepts a null `appVersion`, so no
 * field here has to be paired with another.
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