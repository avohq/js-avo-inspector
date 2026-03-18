import { AvoStreamId } from "../AvoStreamId";
import { AvoInspector } from "../AvoInspector";

import { defaultOptions } from "../__tests__/constants";

describe("InstallationId (replaced by AvoStreamId in Model A)", () => {
  beforeAll(() => {
    new AvoInspector(defaultOptions);
  });

  test("AvoStreamId provides anonymous ID as replacement for installation ID", async () => {
    const id = await AvoStreamId.initialize();
    expect(id).not.toBeNull();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });
});
