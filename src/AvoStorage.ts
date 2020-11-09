export class AvoStorage {
  data: { [key: string]: string | null } = {};
  reactNative: any | null = null;
  Platform: any | null = null;
  AsyncStorage: any | null = null;

  shouldLog: boolean;
  initialized = false;
  available = true;
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
              this.initialize();
            }
          )
        );
      } else {
        this.initialize();
      }
    } else {
      // Verify localStorage
      const uid = new Date().toISOString();
      try {
        window.localStorage.setItem(uid, uid);
        if (window.localStorage.getItem(uid) === uid) {
          window.localStorage.removeItem(uid);
          if (shouldLog) {
            console.log("Avo Inspector Storage: window.localStorage ready");
          }
          this.initialize();
        } else {
          // localStorage not available
          this.available = false;
          this.initialized = false;
          if (shouldLog) {
            console.error("Avo Inspector Storage: window.localStorage not available");
          }
        }
      } catch (error) {
        // localStorage not available
        this.available = false;
        this.initialized = false;
        if (shouldLog) {
          console.error("Avo Inspector Storage: window.localStorage not available", error);
        }
      }
    }
  }

  initialize() {
    this.available = true;
    this.initialized = true;
    this.onInitFuncs.forEach((func) => {
      func();
    });
  }
  

  runOnInit(func: () => void) {
    if (this.initialized === true) {
      func();
    } else if (this.available) {
      this.onInitFuncs.push(func);
    }
  }

  getItemAsync<T>(key: string): Promise<T | null> {
    if (!this.initialized || !this.available) {
      return Promise.resolve(null);
    }
    let maybeItem;
    if (process.env.BROWSER) {
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
        return maybeItem.then((storedItem: string | null) => { storedItem != null ? JSON.parse(storedItem) : null });
      } else {
        return Promise.resolve(null);
      }
    }
  }

  getItem<T>(key: string): T | null {
    if (!this.initialized || !this.available) {
      return null;
    }
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
    this.runOnInit(() => {
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
    })
  };

  removeItem(key: string): void {
    this.runOnInit(() => {
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
    })
  };
}
