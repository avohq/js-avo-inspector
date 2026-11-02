import { ShouldLogFlag, toShouldLogGetter } from "./utils";

abstract class PlatformAvoStorage {
  abstract init(shouldLog: ShouldLogFlag): void;
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

class AndroidAvoStorage extends PlatformAvoStorage {
  storageLib: any | null = null;
  AsyncStorage: any | null = null;

  // Android storage has nothing to log, so it ignores shouldLog (like iOS).
  // It never enumerates or reads the host app's AsyncStorage at startup.
  init(_shouldLog: ShouldLogFlag) {
    if (!process.env.BROWSER) {
      this.storageLib = require("@react-native-async-storage/async-storage");

      this.AsyncStorage = this.storageLib.default;
    }
  }

  isInitialized() {
    return this.storageLib != null;
  }

  getItemAsync<T>(key: string): Promise<T | null> {
    let maybeItem = this.AsyncStorage.getItem(key);
    return maybeItem.then((storedItem: string | null): T | null => {
      return storedItem != null ? JSON.parse(storedItem) : null;
    });
  }

  // AsyncStorage has no synchronous API, so a synchronous read can't be
  // answered. Fail loudly instead of returning null, which would silently
  // mean "not stored".
  getItem<T>(_key: string): T | null {
    throw new Error(
      "[Avo Inspector] Synchronous getItem is not supported on Android; use getItemAsync."
    );
  }

  setItem<T>(key: string, value: T): void {
    this.AsyncStorage.setItem(key, JSON.stringify(value));
  }

  removeItem(key: string): void {
    this.AsyncStorage.removeItem(key);
  }

  runAfterInit(func: () => void) {
    func();
  }
}

class IosAvoStorage extends PlatformAvoStorage {
  reactNative: any | null = null;

  init(_shouldLog: ShouldLogFlag) {
    if (!process.env.BROWSER) {
      this.reactNative = require("react-native");
    }
  }

  isInitialized() {
    return this.reactNative != null;
  }

  getItemAsync<T>(key: string): Promise<T | null> {
    const Settings = this.reactNative.Settings;
    let maybeItem = Settings.get(key);
    return Promise.resolve(this.parseJson(maybeItem));
  }

  getItem<T>(key: string): T | null {
    const Settings = this.reactNative.Settings;
    let maybeItem = Settings.get(key);
    return this.parseJson(maybeItem);
  }

  setItem<T>(key: string, value: T): void {
    const Settings = this.reactNative.Settings;
    Settings.set({ [key]: JSON.stringify(value) });
  }

  removeItem(key: string): void {
    const Settings = this.reactNative.Settings;
    Settings.set({ [key]: null });
  }

  runAfterInit(func: () => void): void {
    func();
  }
}

class BrowserAvoStorage extends PlatformAvoStorage {
  useFallbackStorage = false;
  fallbackStorage: { [key: string]: string | null } = {};
  storageInitialized = false;
  onStorageInitFuncs: Array<() => void> = [];
  shouldLog: () => boolean = () => false;

  init(shouldLog: ShouldLogFlag) {
    this.shouldLog = toShouldLogGetter(shouldLog);
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
          let maybeItem = thisStorage.fallbackStorage[key];
          resolve(thisStorage.parseJson(maybeItem));
        } else {
          if (typeof window !== "undefined") {
            let maybeItem;
            try {
              maybeItem = window.localStorage.getItem(key);
            } catch (error) {
              if (thisStorage.shouldLog()) {
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
      maybeItem = this.fallbackStorage[key];
    } else if (process.env.BROWSER) {
      if (typeof window !== "undefined") {
        try {
          maybeItem = window.localStorage.getItem(key);
        } catch (error) {
          if (this.shouldLog()) {
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
        this.fallbackStorage[key] = JSON.stringify(value);
      } else {
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(key, JSON.stringify(value));
          } catch (error) {
            if (this.shouldLog()) {
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
        this.fallbackStorage[key] = null;
      } else {
        if (typeof window !== "undefined") {
          try {
            window.localStorage.removeItem(key);
          } catch (error) {
            if (this.shouldLog()) {
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

  constructor(shouldLog: ShouldLogFlag) {
    if (!process.env.BROWSER) {
      let reactNative = require("react-native");
      this.Platform = reactNative.Platform.OS;
      if (this.Platform === "android") {
        this.storageImpl = new AndroidAvoStorage();
      } else if (this.Platform === "ios") {
        this.storageImpl = new IosAvoStorage();
      } else {
        throw new Error("Avo Inpector is not supported on " + this.Platform);
      }
    } else {
      this.Platform = "browser";
      this.storageImpl = new BrowserAvoStorage();
    }
    this.storageImpl.init(shouldLog);
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
