export class AvoStorage {
  data: { [key: string]: string | null } = {};
  reactNative: any | null = null;
  Platform: any | null = null;
  AsyncStorage: any | null = null;

  shouldLog: boolean;
  initialized = false;
  onInitFuncs: Array<() => void> = [];

  constructor(shouldLog: boolean) {
    this.shouldLog = shouldLog;
    if (!process.env.BROWSER) {
      this.reactNative = require("react-native");
      this.Platform = this.reactNative.Platform;
      this.AsyncStorage = this.reactNative.AsyncStorage;
      

      if (this.Platform.OS === "android") {
        this.AsyncStorage.getAllKeys().then((keys: Array<any>) =>
          this.AsyncStorage.multiGet(keys).then(
            (keyVals: Array<Array<string>>) => {
              keyVals.forEach((keyVal) => {
                let key = keyVal[0];
                this.data[key] = keyVal[1];
              });
              this.initialized = true;
              this.onInitFuncs.forEach((func) => {
                func();
              });
            }
          )
        );
      } else {
        this.initialized = true;
      }
    } else {
      this.initialized = true;
    }
  }

  runOnInit(func: () => void) {
    if (this.initialized === true) {
      func();
    } else {
      this.onInitFuncs.push(func);
    }
  }

  getItemAsync<T>(key: string): Promise<T | null> {
    let maybeItem;
    if (process.env.BROWSER) {
      if (typeof window !== "undefined") {
        maybeItem = window.localStorage.getItem(key);
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
        return maybeItem.then((storedItem: string | null) => { storedItem != null ? JSON.parse(storedItem) : null });
      } else {
        return Promise.resolve(null);
      }
    }
  }

  getItem<T>(key: string): T | null {
    let maybeItem;
    if (process.env.BROWSER) {
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
  };

  setItem<T>(key: string, value: T): void {
    console.log("1. setting item...");
    if (process.env.BROWSER) {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(key, JSON.stringify(value));
        } catch (error) {
          if (this.shouldLog) {
            console.error("Avo Inspector Storage setItem error:", error);
          }
        }
      }
    } else {
      if (this.Platform.OS === "ios") {
        const Settings = this.reactNative.Settings;
        Settings.set({ [key]: JSON.stringify(value) });
      } else if (this.Platform.OS === "android") {
        this.AsyncStorage.setItem(key, JSON.stringify(value));
        this.data[key] = JSON.stringify(value);
      }
    }
  };

  removeItem(key: string): void {
    if (process.env.BROWSER) {
      if (typeof window !== "undefined") {
        try {
          window.localStorage.removeItem(key);
        } catch (error) {
          if (this.shouldLog) {
            console.error("Avo Inspector Storage removeItem error:", error);
          }
        }
      }
    } else {
      if (this.Platform.OS === "ios") {
        const Settings = this.reactNative.Settings;
        Settings.set({ [key]: null });
      } else if (this.Platform.OS === "android") {
        this.AsyncStorage.removeItem(key);
        this.data[key] = null;
      }
    }
  };
}
