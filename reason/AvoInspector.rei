type t; 

type env = [
  | `Dev
  | `Staging
  | `Prod
];

let make: (~apiKey: string, ~env: env, ~version: string, unit) => t;

let trackSchemaFromEvent: t => string => Js.Json.t => unit;
