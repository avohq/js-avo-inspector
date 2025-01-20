type t
type env = [#Dev | #Prod | #Staging]
type options

let make: (~apiKey: string, ~env: env, ~version: string, unit) => t
@send
external trackSchemaFromEvent: (t, string, Js.Json.t) => unit = "trackSchemaFromEvent"
