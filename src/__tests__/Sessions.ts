import { AvoInspector } from "../AvoInspector";

import { defaultOptions } from "../__tests__/constants";

describe("Sessions (Model A - no session tracking)", () => {
  test("AvoInspector does not have a sessionTracker property", () => {
    const inspector = new AvoInspector(defaultOptions);
    expect((inspector as any).sessionTracker).toBeUndefined();
  });
});
