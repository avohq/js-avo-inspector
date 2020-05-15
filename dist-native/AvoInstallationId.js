"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const AvoGuid_1 = require("./AvoGuid");
const AvoInspector_1 = require("./AvoInspector");
class AvoInstallationId {
    static getInstallationId() {
        if (AvoInstallationId.installationId !== null) {
            return AvoInstallationId.installationId;
        }
        if (!AvoInspector_1.AvoInspector.avoStorage.initialized) {
            return "unknown";
        }
        let maybeInstallationId = AvoInspector_1.AvoInspector.avoStorage.getItem(AvoInstallationId.cacheKey);
        if (maybeInstallationId === null || maybeInstallationId === undefined) {
            AvoInstallationId.installationId = AvoGuid_1.default.newGuid();
            AvoInspector_1.AvoInspector.avoStorage.setItem(AvoInstallationId.cacheKey, AvoInstallationId.installationId);
        }
        else {
            AvoInstallationId.installationId = maybeInstallationId;
        }
        return AvoInstallationId.installationId;
    }
    static get cacheKey() {
        return "AvoInstallationId";
    }
}
exports.AvoInstallationId = AvoInstallationId;
AvoInstallationId.installationId = null;
