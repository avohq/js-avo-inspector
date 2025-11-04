import AvoGuid from "./AvoGuid";
import { AvoInspector } from "./AvoInspector";

/**
 * AvoAnonymousId manages a persistent anonymous user identifier.
 *
 * The anonymous ID is generated once and stored persistently across sessions.
 * It remains the same until the storage is cleared or the user uninstalls the app.
 *
 * This class is designed to be standalone and reusable across different SDK platforms
 * (Web, Node, React Native). Each platform should provide its own AvoStorage implementation.
 */
export class AvoAnonymousId {
  private static _anonymousId: string | null = null;
  
  /**
   * Get the anonymous ID. If it doesn't exist, generates and persists a new one.
   * Returns "unknown" if storage is not initialized.
   */
  static get anonymousId(): string {
    if (AvoAnonymousId._anonymousId !== null) {
      return AvoAnonymousId._anonymousId;
    }
    if (!AvoInspector.avoStorage.isInitialized()) {
      return "unknown";
    }
    let maybeAnonymousId: string | null = null;
    try {
      maybeAnonymousId = AvoInspector.avoStorage.getItem<string>(AvoAnonymousId.storageKey);
    } catch (e) {
      console.error("Avo Inspector: Error reading anonymous ID from storage. Please report to support@avo.app.", e);
    }
    if ((maybeAnonymousId === null) || (maybeAnonymousId === undefined)) {
      AvoAnonymousId._anonymousId = AvoGuid.newGuid();
      try {
        AvoInspector.avoStorage.setItem(AvoAnonymousId.storageKey, AvoAnonymousId._anonymousId);
      } catch (e) {
        console.error("Avo Inspector: Error saving anonymous ID to storage. Please report to support@avo.app.", e);
      }
    } else {
      AvoAnonymousId._anonymousId = maybeAnonymousId;
    }
    return AvoAnonymousId._anonymousId;
  }
  
  /**
   * The storage key used to persist the anonymous ID.
   */
  static get storageKey(): string {
    return "AvoInspectorAnonymousId";
  }
  
  /**
   * Clear the cached anonymous ID. The next access will reload from storage.
   * This is primarily useful for testing.
   */
  static clearCache(): void {
    AvoAnonymousId._anonymousId = null;
  }
}
