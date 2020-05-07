import AvoGuid from "./AvoGuid";

export class AvoInstallationId {

    static installationId: string = null;

    static getInstallationId() {
        if (AvoInstallationId.installationId != null) {
            return AvoInstallationId.installationId;
        }

        AvoInstallationId.installationId = window.localStorage.getItem(AvoInstallationId.cacheKey);
        if (AvoInstallationId.installationId === null || AvoInstallationId.installationId === undefined) {
            AvoInstallationId.installationId = AvoGuid.newGuid();
            window.localStorage.setItem(AvoInstallationId.cacheKey, AvoInstallationId.installationId);
        }
        return AvoInstallationId.installationId;
    }

    static get cacheKey(): string {
        return "AvoInstallationId";
    }
}