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

@send
external trackSchemaFromEvent: (t, string, Js.Json.t) => unit = "trackSchemaFromEvent"

let setNetworkTimeout = (timeout) => {
  %raw(`require("avo-inspector").AvoInspector.networkTimeout = timeout`)
  ()
}