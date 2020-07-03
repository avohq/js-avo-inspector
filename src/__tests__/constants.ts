import { AvoInspectorEnv } from "../AvoInspectorEnv";

const defaultOptions = {
  apiKey: "apiKey",
  env: AvoInspectorEnv.Dev,
  version: "1",
};

const mockedReturns = {
  INSTALLATION_ID: "avo-instalation-id",
  GUID: "generated-guid",
  SESSION_ID: "session-id",
};

const networkCallTypes = {
  EVENT: "event",
  SESSION_STARTED: "sessionStarted",
};

const requestMsg = {
  ERROR: "Request failed",
  TIMEOUT: "Request timed out",
};

const trackingEndpoint = "https://api.avo.app/inspector/v1/track";

export {
  defaultOptions,
  mockedReturns,
  networkCallTypes,
  requestMsg,
  trackingEndpoint,
};
