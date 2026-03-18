import { AvoInspector, AvoInspectorEnv } from "avo-inspector/lite";

const inspector = new AvoInspector({
  apiKey: "demo-key",
  env: AvoInspectorEnv.Prod,
  version: "1.0.0",
});

inspector.trackSchemaFromEvent("Demo Event", { property: "value" });
