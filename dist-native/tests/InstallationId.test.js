"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AvoInstallationId_1 = require("../AvoInstallationId");
const AvoStorage_1 = require("../AvoStorage");
const AvoInspector_1 = require("../AvoInspector");
const AvoInspectorEnv_1 = require("../AvoInspectorEnv");
describe("InstallationId", () => {
    process.env.BROWSER = "1";
    let storage = new AvoStorage_1.AvoStorage();
    beforeAll(() => {
        storage.removeItem(AvoInstallationId_1.AvoInstallationId.cacheKey);
        new AvoInspector_1.AvoInspector({ apiKey: "test", env: AvoInspectorEnv_1.AvoInspectorEnv.Dev, version: "0" });
    });
    test("Creates installation id if not present", () => {
        // Given
        storage.removeItem(AvoInstallationId_1.AvoInstallationId.cacheKey);
        // When
        let installationId = AvoInstallationId_1.AvoInstallationId.getInstallationId();
        // Then
        expect(installationId).not.toBeNull();
    });
    test("Reuses installation id if present", () => {
        // Given
        storage.setItem(AvoInstallationId_1.AvoInstallationId.cacheKey, "test-installation-id");
        AvoInstallationId_1.AvoInstallationId.installationId = null;
        // When
        let installationId = AvoInstallationId_1.AvoInstallationId.getInstallationId();
        // Then
        expect(installationId).toBe("test-installation-id");
    });
});
