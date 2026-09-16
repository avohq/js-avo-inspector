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
}

@new @module("avo-inspector/lite")
external make: options => t = "AvoInspector"

@send
external trackSchemaFromEvent: (t, string, Js.Json.t) => unit = "trackSchemaFromEvent"

let setNetworkTimeout = (timeout) => {
  %raw(`require("avo-inspector/lite").AvoInspector.networkTimeout = timeout`)
  ()
}
