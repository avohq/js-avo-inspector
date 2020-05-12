type t;

[@bs.deriving jsConverter]
type env = [
  | [@bs.as "dev"] `Dev
  | [@bs.as "staging"] `Staging
  | [@bs.as "prod"] `Prod
];

[@bs.deriving abstract]
type options = {
  apiKey: string,
  env: string,
  version: string
};

[@bs.new] [@bs.module "avo-inspector"]
external make: options => t = "AvoInspector";

let make = (~apiKey, ~env, ~version, ()) => {
  make(options(~apiKey, ~env=envToJs(env), ~version))
};

[@bs.send]
external trackSchemaFromEvent: t => string => Js.Json.t => unit = "trackSchemaFromEvent";

