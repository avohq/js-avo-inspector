type t

type env = [
  | @as("dev") #Dev
  | @as("staging") #Staging
  | @as("prod") #Prod
]

type options = {
  apiKey: string,
  env: env,
  version: string,
}

@new @module("avo-inspector")
external make: options => t = "AvoInspector"

// The unit is redundant, but is kept for backwards compatibility
let make = (~apiKey, ~env, ~version, ()) => {
  make({apiKey: apiKey, env: env, version: version})
}

@send
external trackSchemaFromEvent: (t, string, Js.Json.t) => unit = "trackSchemaFromEvent"
