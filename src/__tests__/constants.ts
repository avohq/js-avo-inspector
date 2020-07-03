import { AvoInspectorEnv } from "../AvoInspectorEnv";

const defaultOptions = {
  apiKey: "apiKey",
  env: AvoInspectorEnv.Dev,
  version: "1",
};

const networkCallTypes = {
  EVENT: "event",
  SESSION_STARTED: "sessionStarted",
};

export { defaultOptions, networkCallTypes };
