import { AvoInstallationId } from "../AvoInstallationId";
import { AvoStorage } from "../AvoStorage";
import { AvoInspector } from "../AvoInspector";

import { defaultOptions } from "../__tests__/constants";

describe("InstallationId", () => {
  const storage = new AvoStorage(defaultOptions.shouldLog);

  beforeAll(() => {
    new AvoInspector(defaultOptions);
  });

  test(`cacheKey equal to "AvoInstallationId"`, () => {
    expect(AvoInstallationId.cacheKey).toEqual("AvoInstallationId");
  });

  test("Sets installationId on AvoInspector init", () => {
    // Given

    // When
    let installationId = AvoInstallationId.getInstallationId();

    // Then
    expect(installationId).not.toBeNull();
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
    const newId = "test-installation-id";

    storage.setItem(AvoInstallationId.cacheKey, "test-installation-id");
    AvoInstallationId.installationId = null;

    // When
    let installationId = AvoInstallationId.getInstallationId();

    // Then
    expect(installationId).toBe(newId);
  });
});
