export class AvoStorage {
  androidMemoryDataToAvoidAsyncQueries: { [key: string]: string | null } = {};
  reactNative: any | null = null;
  Platform: any | null = null;
  AsyncStorage: any | null = null;

  shouldLog: boolean;
  storageInitialized = false;
  useFallback = false;
  fallbackStorage: { [key: string]: string | null } = {};
  onStorageInitFuncs: Array<() => void> = [];
  // onItemsFromLastSessionLoadedFuncs: Array<() => void> = [];

  constructor(shouldLog: boolean) {
    this.shouldLog = shouldLog;
    if (!process.env.BROWSER) {
      this.reactNative = require("react-native");
      this.Platform = this.reactNative.Platform;
      this.AsyncStorage = this.reactNative.AsyncStorage;

      if (this.Platform.OS === "android") {
        this.loadAndroidDataToMemoryToAvoidAsyncQueries(() => {
          this.initializeStorageAndroid();
        });
      } else {
        this.initializeStorageIos();
      }
    } else {
      this.initializeStorageWeb(this.isLocalStorageAvailable());
    }
  }

  loadAndroidDataToMemoryToAvoidAsyncQueries(onLoaded: () => void) {
    this.AsyncStorage.getAllKeys().then((keys: Array<any>) =>
      this.AsyncStorage.multiGet(keys).then((keyVals: Array<Array<string>>) => {
        keyVals.forEach((keyVal) => {
          let key = keyVal[0];
          this.androidMemoryDataToAvoidAsyncQueries[key] = keyVal[1];
        });
        onLoaded();
      })
    );
  }

  isLocalStorageAvailable(): boolean {
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

  initializeStorageAndroid() {
    this.storageInitialized = true;
    this.onStorageInitFuncs.forEach((func) => {
      func();
    });
  }

  initializeStorageIos() {
    this.storageInitialized = true;
    this.onStorageInitFuncs.forEach((func) => {
      func();
    });
  }

  initializeStorageWeb(isLocalStorageAvailable: boolean) {
    this.storageInitialized = true;
    if (isLocalStorageAvailable === false) {
      this.useFallback = true;
    }
    this.onStorageInitFuncs.forEach((func) => {
      func();
    });
  }

  runOnStorageInit(func: () => void) {
    if (this.storageInitialized === true) {
      func();
    } else {
      this.onStorageInitFuncs.push(func);
    }
  }

  getItemAsync<T>(key: string): Promise<T | null> {
    let maybeItem;
    if (this.useFallback === true) {
      maybeItem = this.fallbackStorage[key];
      if (maybeItem !== null && maybeItem !== undefined) {
        return Promise.resolve(JSON.parse(maybeItem));
      } else {
        return Promise.resolve(null);
      }
    } else if (process.env.BROWSER) {
      if (typeof window !== "undefined") {
        try {
          maybeItem = window.localStorage.getItem(key);
        } catch (error) {
          console.error("Avo Inspector Storage getItemAsync error:", error);
          return Promise.resolve(null);
        }

        if (maybeItem !== null && maybeItem !== undefined) {
          return Promise.resolve(JSON.parse(maybeItem));
        } else {
          return Promise.resolve(null);
        }
      } else {
        return Promise.resolve(null);
      }
    } else {
      if (this.Platform.OS === "ios") {
        const Settings = this.reactNative.Settings;
        maybeItem = Settings.get(key);
        if (maybeItem !== null && maybeItem !== undefined) {
          return Promise.resolve(JSON.parse(maybeItem));
        } else {
          return Promise.resolve(null);
        }
      } else if (this.Platform.OS === "android") {
        maybeItem = this.AsyncStorage.getItem(key);
        return maybeItem.then((storedItem: string | null) => {
          storedItem != null ? JSON.parse(storedItem) : null;
        });
      } else {
        return Promise.resolve(null);
      }
    }
  }

  getItem<T>(key: string): T | null {
    let maybeItem;
    if (this.storageInitialized === false) {
      maybeItem = null;
    } else if (this.useFallback === true) {
      maybeItem = this.fallbackStorage[key];
    } else if (process.env.BROWSER) {
      if (typeof window !== "undefined") {
        try {
          maybeItem = window.localStorage.getItem(key);
        } catch (error) {
          if (this.shouldLog) {
            console.error("Avo Inspector Storage getItem error:", error);
          }
        }
      }
    } else {
      if (this.Platform.OS === "ios") {
        const Settings = this.reactNative.Settings;
        maybeItem = Settings.get(key);
      } else if (this.Platform.OS === "android") {
        maybeItem = this.androidMemoryDataToAvoidAsyncQueries[key];
      }
    }

    if (maybeItem !== null && maybeItem !== undefined) {
      return JSON.parse(maybeItem);
    } else {
      return null;
    }
  }

  setItem<T>(key: string, value: T): void {
    this.runOnStorageInit(() => {
      if (this.useFallback === true) {
        this.fallbackStorage[key] = JSON.stringify(value);
      } else if (process.env.BROWSER) {
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(key, JSON.stringify(value));
          } catch (error) {
            if (this.shouldLog) {
              console.error("Avo Inspector Storage setItem error:", error);
            }
          }
        }
      } else if (this.Platform.OS === "ios") {
        const Settings = this.reactNative.Settings;
        Settings.set({ [key]: JSON.stringify(value) });
      } else if (this.Platform.OS === "android") {
        this.AsyncStorage.setItem(key, JSON.stringify(value));
        this.androidMemoryDataToAvoidAsyncQueries[key] = JSON.stringify(value);
      }
    });
  }

  removeItem(key: string): void {
    this.runOnStorageInit(() => {
      if (this.useFallback === true) {
        this.fallbackStorage[key] = null;
      } else if (process.env.BROWSER) {
        if (typeof window !== "undefined") {
          try {
            window.localStorage.removeItem(key);
          } catch (error) {
            if (this.shouldLog) {
              console.error("Avo Inspector Storage removeItem error:", error);
            }
          }
        }
      } else if (this.Platform.OS === "ios") {
        const Settings = this.reactNative.Settings;
        Settings.set({ [key]: null });
      } else if (this.Platform.OS === "android") {
        this.AsyncStorage.removeItem(key);
        this.androidMemoryDataToAvoidAsyncQueries[key] = null;
      }
    });
  }
}
