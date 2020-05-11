import AvoGuid from "./AvoGuid";
import LocalStorage from "./LocalStorage";

export class AvoInstallationId {
  static installationId: null | string = null;

  static getInstallationId(): string {
    if (AvoInstallationId.installationId !== null) {
      return AvoInstallationId.installationId;
    }

    let maybeInstallationId = LocalStorage.getItem<string>(
      AvoInstallationId.cacheKey
    );
    if (maybeInstallationId === null || maybeInstallationId === undefined) {
      AvoInstallationId.installationId = AvoGuid.newGuid();
      LocalStorage.setItem(
        AvoInstallationId.cacheKey,
        AvoInstallationId.installationId
      );
    } else {
      AvoInstallationId.installationId = maybeInstallationId;
    }
    return AvoInstallationId.installationId;
  }

  static get cacheKey(): string {
    return "AvoInstallationId";
  }
}
