import { AvoInstallationId } from "../AvoInstallationId";

describe('InstallationId', () => {
    test('Creates installation id if not present', () => {
        // Given
        window.localStorage.removeItem(AvoInstallationId.cacheKey);

        // When
        let installationId = AvoInstallationId.getInstallationId()

        // Then
        expect(installationId).not.toBeNull();
    });

    test('Reuses installation id if present', () => {
        // Given
        window.localStorage.setItem(AvoInstallationId.cacheKey, "test-installation-id");
        AvoInstallationId.installationId = null;

        // When
        let installationId = AvoInstallationId.getInstallationId()

        // Then
        expect(installationId).toBe("test-installation-id");
    });
});