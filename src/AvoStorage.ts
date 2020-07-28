export class AvoStorage {
  data: { [key: string]: string | null } = {};
  reactNative: any | null = null;
  Platform: any | null = null;
  AsyncStorage: any | null = null;

  initialized = false;
  onInitFuncs: Array<() => void> = [];

  constructor() {
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

  getItem = <T>(key: string): T | null => {
    let maybeItem;
    if (process.env.BROWSER) {
      if (typeof window !== "undefined") {
        maybeItem = window.localStorage.getItem(key);
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

  setItem = <T>(key: string, value: T): void => {
    if (process.env.BROWSER) {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(key, JSON.stringify(value));
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

  removeItem = (key: string): void => {
    if (process.env.BROWSER) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(key);
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
