import { AvoInspector } from "./AvoInspector";

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
  window.inspector = new AvoInspector(options);

  callQueue.forEach((call) => {
    const method = call[0];
    call.shift();
    window.inspector[method](...call);
  });
} else if (console !== "undefined") {
  console.log("Avo Inspector: Window not available. Aborting.");
}
