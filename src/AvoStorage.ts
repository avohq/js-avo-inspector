abstract class PlatformAvoStorage {
  abstract init(shouldLog: boolean, suffix: string): void;
  abstract getItemAsync<T>(key: string): Promise<T | null>;
  abstract getItem<T>(key: string): T | null;
  abstract setItem<T>(key: string, value: T): void;
  abstract removeItem(key: string): void;
  abstract runAfterInit(func: () => void): void;
  abstract isInitialized(): boolean;

  parseJson<T>(maybeItem: string | null | undefined): T | null {
    if (maybeItem !== null && maybeItem !== undefined) {
      return JSON.parse(maybeItem);
    } else {
      return null;
    }
  }
}

class BrowserAvoStorage extends PlatformAvoStorage {
  useFallbackStorage = false;
  fallbackStorage: { [key: string]: string | null } = {};
  storageInitialized = false;
  onStorageInitFuncs: Array<() => void> = [];
  shouldLog: boolean = false;
  suffix: string = "";

  init(shouldLog: boolean, suffix: string) {
    this.shouldLog = shouldLog;
    this.suffix = suffix;
    this.initializeStorageWeb(this.isLocalStorageAvailable());
  }

  private initializeStorageWeb(isLocalStorageAvailable: boolean) {
    this.storageInitialized = true;
    if (isLocalStorageAvailable === false) {
      this.useFallbackStorage = true;
    }
    this.onStorageInitFuncs.forEach((func) => {
      func();
    });
  }

  private isLocalStorageAvailable(): boolean {
    const uid = new Date().toISOString();
    try {
      window.localStorage.setItem(uid, uid);
      if (window.localStorage.getItem(uid) === uid) {
        window.localStorage.removeItem(uid);
        return true;
      } else {
        return false;
      }
    } catch (error) {
      return false;
    }
  }

  isInitialized() {
    return this.storageInitialized;
  }

  getItemAsync<T>(key: string): Promise<T | null> {
    let thisStorage = this;
    return new Promise(function (resolve, _reject) {
      thisStorage.runAfterInit(() => {
        if (thisStorage.useFallbackStorage === true) {
          let maybeItem = thisStorage.fallbackStorage[key + thisStorage.suffix];
          resolve(thisStorage.parseJson(maybeItem));
        } else {
          if (typeof window !== "undefined") {
            let maybeItem;
            try {
              maybeItem = window.localStorage.getItem(key + thisStorage.suffix);
            } catch (error) {
              if (thisStorage.shouldLog) {
                console.error(
                  "Avo Inspector Storage getItemAsync error:",
                  error
                );
              }
              resolve(null);
            }

            resolve(thisStorage.parseJson(maybeItem));
          } else {
            resolve(null);
          }
        }
      });
    });
  }

  getItem<T>(key: string): T | null {
    let maybeItem;
    if (this.storageInitialized === false) {
      maybeItem = null;
    } else if (this.useFallbackStorage === true) {
      maybeItem = this.fallbackStorage[key + this.suffix];
    } else if (process.env.BROWSER) {
      if (typeof window !== "undefined") {
        try {
          maybeItem = window.localStorage.getItem(key + this.suffix);
        } catch (error) {
          if (this.shouldLog) {
            console.error("Avo Inspector Storage getItem error:", error);
          }
        }
      }
    }

    return this.parseJson(maybeItem);
  }

  setItem<T>(key: string, value: T): void {
    this.runAfterInit(() => {
      if (this.useFallbackStorage === true) {
        this.fallbackStorage[key + this.suffix] = JSON.stringify(value);
      } else {
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(key + this.suffix, JSON.stringify(value));
          } catch (error) {
            if (this.shouldLog) {
              console.error("Avo Inspector Storage setItem error:", error);
            }
          }
        }
      }
    });
  }

  removeItem(key: string): void {
    this.runAfterInit(() => {
      if (this.useFallbackStorage === true) {
        this.fallbackStorage[key + this.suffix] = null;
      } else {
        if (typeof window !== "undefined") {
          try {
            window.localStorage.removeItem(key + this.suffix);
          } catch (error) {
            if (this.shouldLog) {
              console.error("Avo Inspector Storage removeItem error:", error);
            }
          }
        }
      }
    });
  }

  runAfterInit(func: () => void): void {
    if (this.storageInitialized === true) {
      func();
    } else {
      this.onStorageInitFuncs.push(func);
    }
  }
}

export class AvoStorage {
  Platform: string | null = null;

  storageImpl: PlatformAvoStorage;

  constructor(shouldLog: boolean, suffix: string = "") {
    this.Platform = "browser";
    this.storageImpl = new BrowserAvoStorage();
    this.storageImpl.init(shouldLog, suffix);
  }

  isInitialized() {
    return this.storageImpl.isInitialized();
  }

  getItemAsync<T>(key: string): Promise<T | null> {
    return this.storageImpl.getItemAsync(key);
  }

  getItem<T>(key: string): T | null {
    return this.storageImpl.getItem(key);
  }

  setItem<T>(key: string, value: T): void {
    this.storageImpl.setItem(key, value);
  }

  removeItem(key: string): void {
    this.storageImpl.removeItem(key);
  }

  runAfterInit(func: () => void): void {
    this.storageImpl.runAfterInit(func);
  }
}
