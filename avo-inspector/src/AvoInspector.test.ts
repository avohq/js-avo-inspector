import { AvoInspector } from "./AvoInspector";
import { AvoInspectorEnv } from "./AvoInspectorEnv";
import { AvoType } from "./AvoType";

test('Parses basic types', () => {
    // Given
    let eventProperties = { "prop0": true, "prop1": 1, "prop2": "str", 
    "prop3": 0.5, "prop4": undefined, "prop5": null,
    "prop6": { "an": "object" }, "prop7": ["a", "list"] };
  
    // When
    let inspector = new AvoInspector("apiKey", AvoInspectorEnv.Dev);
    let res = inspector.extractSchema(eventProperties);
  
    expect(res["prop0"].getName()).toBe(new AvoType.Boolean().getName());
    expect(res["prop1"].getName()).toBe(new AvoType.Int().getName());
    expect(res["prop2"].getName()).toBe(new AvoType.String().getName());
    expect(res["prop3"].getName()).toBe(new AvoType.Float().getName());
    
    expect(res["prop4"].getName()).toBe(new AvoType.Null().getName());
    expect(res["prop5"].getName()).toBe(new AvoType.Null().getName());
    expect(res["prop6"].getName()).toBe(new AvoType.AvoObject().getName());
    expect(res["prop7"].getName()).toBe(new AvoType.List().getName());
  });
