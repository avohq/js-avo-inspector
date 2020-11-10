export class AvoStorage {
  data: { [key: string]: string | null } = {};
  reactNative: any | null = null;
  Platform: any | null = null;
  AsyncStorage: any | null = null;

  shouldLog: boolean;
  initialized = false;
  itemsFromLastSessionLoaded = false;
  useFallback = false;
  fallbackStorage: any = {};
  onInitFuncs: Array<() => void> = [];
  onItemsFromLastSessionLoadedFuncs: Array<() => void> = [];

  constructor(shouldLog: boolean) {
    this.shouldLog = shouldLog;
    if (!process.env.BROWSER) {
      this.reactNative = require("react-native");
      this.Platform = this.reactNative.Platform;
      this.AsyncStorage = this.reactNative.AsyncStorage;

      if (this.Platform.OS === "android") {
        // Android is the only platform that requires async loading of items from the prev session
        this.initializeAndroid();
        this.AsyncStorage.getAllKeys().then((keys: Array<any>) =>
          this.AsyncStorage.multiGet(keys).then(
            (keyVals: Array<Array<string>>) => {
              keyVals.forEach((keyVal) => {
                let key = keyVal[0];
                this.data[key] = keyVal[1];
              });
              this.itemsLoadedAndroid();
            }
          )
        );
      } else {
        this.initializeAndItemsLoadedIos();
      }
    } else {
      // Verify localStorage
      const uid = new Date().toISOString();
      try {
        window.localStorage.setItem(uid, uid);
        if (window.localStorage.getItem(uid) === uid) {
          window.localStorage.removeItem(uid);
          this.initializeAndItemsLoadedWeb(true);
        } else {
          this.initializeAndItemsLoadedWeb(false);
        }
      } catch (error) {
        this.initializeAndItemsLoadedWeb(false);
      }
    }
  }

  initializeAndroid() {
    this.initialized = true;
    this.onInitFuncs.forEach((func) => {
      func();
    });
  }

  itemsLoadedAndroid() {
    this.itemsFromLastSessionLoaded = true;
    this.onItemsFromLastSessionLoadedFuncs.forEach((func) => {
      func();
    });
  }

  initializeAndItemsLoadedIos() {
    this.initialized = true;
    this.itemsFromLastSessionLoaded = true;
    this.onInitFuncs.forEach((func) => {
      func();
    });
    this.onItemsFromLastSessionLoadedFuncs.forEach((func) => {
      func();
    });
  }

  initializeAndItemsLoadedWeb(localStorageAvailable: boolean) {
    this.initialized = true;
    this.itemsFromLastSessionLoaded = true;
    if (localStorageAvailable === false) {
      this.useFallback = true;
    }
    this.onInitFuncs.forEach((func) => {
      func();
    });
    this.onItemsFromLastSessionLoadedFuncs.forEach((func) => {
      func();
    });
  }

  runOnInit(func: () => void) {
    if (this.initialized === true) {
      func();
    } else {
      this.onInitFuncs.push(func);
    }
  }

  runOnItemsFromPreviousSessionLoaded(func: () => void) {
    if (this.itemsFromLastSessionLoaded === true) {
      func();
    } else {
      this.onItemsFromLastSessionLoadedFuncs.push(func);
    }
  }

  getItemAsync<T>(key: string): Promise<T | null> {
    let maybeItem;
    if (this.initialized === false) {
      return Promise.resolve(null);
    } else if (this.useFallback === true) {
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
    if (this.initialized === false) {
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
        maybeItem = this.data[key];
      }
    }

    if (maybeItem !== null && maybeItem !== undefined) {
      return JSON.parse(maybeItem);
    } else {
      return null;
    }
  }

  setItem<T>(key: string, value: T): void {
    this.runOnInit(() => {
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
        this.data[key] = JSON.stringify(value);
      }
    });
  }

  removeItem(key: string): void {
    this.runOnInit(() => {
      if (this.useFallback === true) {
        this.fallbackStorage[key] = undefined;
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
        this.data[key] = null;
      }
    });
  }
}
