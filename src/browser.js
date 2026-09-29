import { AvoInspector } from "./AvoInspector";

// INTERNAL web GTM tag template support — not public API.
//
// The template calls `inspector.trackSchemaFromEvent(event, props, hints)` with
// gateway options (outputReference, originHint, appVersion) as a third argument,
// both on the live instance and on the loader stub whose queue is replayed
// below. The public methods take two arguments, so this wraps the instance's
// methods: a third argument routes to the internal method; without one the
// public method runs unchanged. The instance is captured rather than read from
// `this`, so the wrapper works however the caller invokes it.
function routeGatewayOptions(inspector) {
  const trackSchemaFromEvent = inspector.trackSchemaFromEvent;
  const trackSchema = inspector.trackSchema;
  inspector.trackSchemaFromEvent = function (eventName, eventProperties, options) {
    return options === undefined
      ? trackSchemaFromEvent.call(inspector, eventName, eventProperties)
      : inspector._trackSchemaFromEventWithOptions(eventName, eventProperties, options);
  };
  inspector.trackSchema = function (eventName, eventSchema, options) {
    return options === undefined
      ? trackSchema.call(inspector, eventName, eventSchema)
      : inspector._trackSchemaWithOptions(eventName, eventSchema, options);
  };
}

if (typeof window !== "undefined") {
  if (console !== "undefined" && window.inspector.__ENV__ === "dev") {
    console.log("Avo Inspector: Loaded. Starting initialization...");
  }
  if (console !== "undefined" && window.inspector.__API_KEY__ === "MY-API-KEY") {
    console.error("Avo Inspector: API key not provided");
  }

  const callQueue = window.inspector;
  const options = {
    apiKey: window.inspector.__API_KEY__,
    env: window.inspector.__ENV__,
    version: window.inspector.__VERSION__,
    appName: window.inspector.__APP_NAME__
  };
  if (window.inspector.__PUBLIC_ENCRYPTION_KEY__) {
    options.publicEncryptionKey = window.inspector.__PUBLIC_ENCRYPTION_KEY__;
  }
  // INTERNAL: the web GTM tag template writes `__CLIENT__ = "gtm-web"` before
  // loading this script. It reaches the SDK through the untyped `_client`
  // option, selects the v2 transport, and enables the gateway options above. A
  // page that does not set it — every direct script-tag install — gets exactly
  // 3.2.0's behaviour. A blank value is treated as absent by the handler, so it
  // never selects v2 (and the options stay inert).
  const webGtmTemplateClient = window.inspector.__CLIENT__;
  if (webGtmTemplateClient) {
    options._client = webGtmTemplateClient;
  }
  const inspector = new AvoInspector(options);
  if (webGtmTemplateClient) {
    routeGatewayOptions(inspector);
  }
  window.inspector = inspector;

  callQueue.forEach((call) => {
    const method = call[0];
    call.shift();
    window.inspector[method](...call);
  });
} else if (console !== "undefined") {
  console.log("Avo Inspector: Window not available. Aborting.");
}
