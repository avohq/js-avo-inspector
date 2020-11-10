import AvoGuid from "./AvoGuid";
import { AvoInspector } from "./AvoInspector";

export class AvoInstallationId {
  static installationId: null | string = null;

  static getInstallationId(): string {
    if (AvoInstallationId.installationId !== null) {
      return AvoInstallationId.installationId;
    }

    if (!AvoInspector.avoStorage.isInitialized()) {
      return "unknown";
    }

    let maybeInstallationId = AvoInspector.avoStorage.getItem<string>(
      AvoInstallationId.cacheKey
    );
    if (maybeInstallationId === null || maybeInstallationId === undefined) {
      AvoInstallationId.installationId = AvoGuid.newGuid();
      AvoInspector.avoStorage.setItem(
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
