type t

type env = [
  | @as("dev") #Dev
  | @as("staging") #Staging
  | @as("prod") #Prod
]

@deriving(abstract)
type options = {
  apiKey: string,
  env: env,
  version: string,
}

@new @module("avo-inspector")
external make: options => t = "AvoInspector"

let make = (~apiKey, ~env, ~version, ()) => {
  make(options(~apiKey, ~env, ~version))
}

@send
external trackSchemaFromEvent: (t, string, Js.Json.t) => unit = "trackSchemaFromEvent"
