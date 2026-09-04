type t
type env = [#dev | #prod | #staging]
type options = {apiKey: string, env: env, version: string}
@new @module("avo-inspector/lite")
external make: options => t = "AvoInspector"
type trackOptions = {outputReference?: string, originHint?: string, appVersion?: string}
@send
external trackSchemaFromEvent: (t, string, Js.Json.t) => unit = "trackSchemaFromEvent"
@send
external trackSchemaFromEventWithOptions: (t, string, Js.Json.t, trackOptions) => unit =
  "trackSchemaFromEvent"
@send
external trackSchema: (t, string, array<Js.Json.t>) => unit = "trackSchema"
@send
external trackSchemaWithOptions: (t, string, array<Js.Json.t>, trackOptions) => unit = "trackSchema"

let setNetworkTimeout: int => unit
