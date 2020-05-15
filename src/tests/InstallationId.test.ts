import { AvoInstallationId } from "../AvoInstallationId";
import { AvoStorage } from "../AvoStorage";
import { AvoInspector } from "../AvoInspector";
import { AvoInspectorEnv } from "../AvoInspectorEnv";

describe("InstallationId", () => {

  process.env.BROWSER = "1";
  let storage = new AvoStorage();
  
  beforeAll(() => {
    storage.removeItem(AvoInstallationId.cacheKey);

    new AvoInspector({apiKey: "test", env: AvoInspectorEnv.Dev, version: "0"});
  });

  test("Creates installation id if not present", () => {
    // Given
    storage.removeItem(AvoInstallationId.cacheKey);

    // When
    let installationId = AvoInstallationId.getInstallationId();

    // Then
    expect(installationId).not.toBeNull();
  });

  test("Reuses installation id if present", () => {
    // Given
    storage.setItem(AvoInstallationId.cacheKey, "test-installation-id");
    AvoInstallationId.installationId = null;

    // When
    let installationId = AvoInstallationId.getInstallationId();

    // Then
    expect(installationId).toBe("test-installation-id");
  });
});
