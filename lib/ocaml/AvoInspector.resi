type t
type env = [#dev | #prod | #staging]
type options = {apiKey: string, env: env, version: string, publicEncryptionKey?: string}
@new @module("avo-inspector")
external make: options => t = "AvoInspector"
@send
external trackSchemaFromEvent: (t, string, Js.Json.t) => unit = "trackSchemaFromEvent"

let setNetworkTimeout: int => unit
