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
  /**
   * Identifies the Avo integration embedding this SDK (e.g. `"gtm-web"`). Setting
   * it selects the v2 transport and becomes the `X-Avo-Client` header; leave it
   * unset to stay on `/inspector/v1/track` exactly as 3.2.0 did.
   */
  client?: string,
}

@new @module("avo-inspector/lite")
external make: options => t = "AvoInspector"

/**
 * Per-call gateway coordinates. Omitted fields are omitted from the emitted JS
 * object, which is exactly how the SDK expects an absent option.
 *
 * `outputReference` and `originHint` are sent only when `client` is set (the v2
 * transport). There, `originHint` without `appVersion` sends a null
 * `appVersion`, recorded as "unversioned". Without a client the SDK is on v1,
 * which has no such fields: both are left out and the event keeps the
 * configured version unless `appVersion` is given.
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
  %raw(`require("avo-inspector/lite").AvoInspector.networkTimeout = timeout`)
  ()
}
