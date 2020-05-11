import AvoGuid from "./AvoGuid";

export class AvoInstallationId {
  static installationId: null | string = null;

  static getInstallationId() {
    if (AvoInstallationId.installationId !== null) {
      return AvoInstallationId.installationId;
    }

    let maybeInstallationId = window.localStorage.getItem(
      AvoInstallationId.cacheKey
    );
    if (maybeInstallationId === null || maybeInstallationId === undefined) {
      AvoInstallationId.installationId = AvoGuid.newGuid();
      window.localStorage.setItem(
        AvoInstallationId.cacheKey,
        JSON.stringify(AvoInstallationId.installationId)
      );
    } else {
      AvoInstallationId.installationId = JSON.parse(maybeInstallationId);
    }
    return AvoInstallationId.installationId;
  }

  static get cacheKey(): string {
    return "AvoInstallationId";
  }
}
