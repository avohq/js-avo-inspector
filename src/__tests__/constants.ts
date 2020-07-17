import { AvoInspectorEnv } from "../AvoInspectorEnv";

const defaultOptions = {
  apiKey: "api-key-xxx",
  env: AvoInspectorEnv.Dev,
  version: "1",
};

const error = {
  API_KEY:
    "[Avo Inspector] No API key provided. Inspector can't operate without API key.",
  VERSION:
    "[Avo Inspector] No version provided. Many features of Inspector rely on versioning. Please provide comparable string version, i.e. integer or semantic.",
};

const networkCallType = {
  EVENT: "event",
  SESSION_STARTED: "sessionStarted",
};

const sessionTimeMs = 5 * 60 * 1000;

const type = {
  STRING: "string",
  INT: "int",
  OBJECT: "object",
  FLOAT: "float",
  LIST: "list",
  BOOL: "boolean",
  NULL: "null",
  UNKNOWN: "unknown",
};

export { defaultOptions, error, networkCallType, sessionTimeMs, type };
