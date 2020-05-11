import { AvoInstallationId } from "../AvoInstallationId";
import LocalStorage from "../LocalStorage";

describe("InstallationId", () => {
  beforeAll(() => {
    LocalStorage.clear();
  });

  test("Creates installation id if not present", () => {
    // Given
    LocalStorage.removeItem(AvoInstallationId.cacheKey);

    // When
    let installationId = AvoInstallationId.getInstallationId();

    // Then
    expect(installationId).not.toBeNull();
  });

  test("Reuses installation id if present", () => {
    // Given
    LocalStorage.setItem(AvoInstallationId.cacheKey, "test-installation-id");
    AvoInstallationId.installationId = null;

    // When
    let installationId = AvoInstallationId.getInstallationId();

    // Then
    expect(installationId).toBe("test-installation-id");
  });
});
