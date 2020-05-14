"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
class AvoStorage {
    constructor() {
        this.data = {};
        this.reactNative = null;
        this.Platform = null;
        this.AsyncStorage = null;
        this.initialized = false;
        this.onInitFuncs = [];
        this.getItem = (key) => {
            let maybeItem;
            if (process.env.BROWSER) {
                maybeItem = window.localStorage.getItem(key);
            }
            else {
                if (this.Platform.OS === 'ios') {
                    const Settings = this.reactNative.Settings;
                    maybeItem = Settings.get(key);
                }
                else if (this.Platform.OS === 'android') {
                    maybeItem = this.data[key];
                }
            }
            if (maybeItem !== null && maybeItem !== undefined) {
                return JSON.parse(maybeItem);
            }
            else {
                return null;
            }
        };
        this.setItem = (key, value) => {
            if (process.env.BROWSER) {
                window.localStorage.setItem(key, JSON.stringify(value));
            }
            else {
                if (this.Platform.OS === 'ios') {
                    const Settings = this.reactNative.Settings;
                    Settings.set({ [key]: JSON.stringify(value) });
                }
                else if (this.Platform.OS === 'android') {
                    this.AsyncStorage.setItem(key, JSON.stringify(value));
                    this.data[key] = JSON.stringify(value);
                }
            }
        };
        this.removeItem = (key) => {
            if (process.env.BROWSER) {
                window.localStorage.removeItem(key);
            }
            else {
                if (this.Platform.OS === 'ios') {
                    const Settings = this.reactNative.Settings;
                    Settings.set({ [key]: null });
                }
                else if (this.Platform.OS === 'android') {
                    this.AsyncStorage.removeItem(key);
                    this.data[key] = null;
                }
            }
        };
        if (!process.env.BROWSER) {
            this.reactNative = require("react-native");
            this.Platform = this.reactNative.Platform;
            this.AsyncStorage = this.reactNative.AsyncStorage;
            if (this.Platform.OS === 'android') {
                this.AsyncStorage.getAllKeys().then((keys) => this.AsyncStorage.multiGet(keys).then((keyVals) => {
                    keyVals.forEach(keyVal => {
                        let key = keyVal[0];
                        this.data[key] = keyVal[1];
                    });
                    this.initialized = true;
                    this.onInitFuncs.forEach((func) => {
                        func();
                    });
                }));
            }
            else {
                this.initialized = true;
            }
        }
        else {
            this.initialized = true;
        }
    }
    runOnInit(func) {
        if (this.initialized === true) {
            func();
        }
        else {
            this.onInitFuncs.push(func);
        }
    }
    getItemAsync(key) {
        return __awaiter(this, void 0, void 0, function* () {
            let maybeItem;
            if (process.env.BROWSER) {
                maybeItem = window.localStorage.getItem(key);
            }
            else {
                if (this.Platform.OS === 'ios') {
                    const Settings = this.reactNative.Settings;
                    maybeItem = Settings.get(key);
                }
                else if (this.Platform.OS === 'android') {
                    maybeItem = yield this.AsyncStorage.getItem(key);
                }
            }
            if (maybeItem !== null && maybeItem !== undefined) {
                return JSON.parse(maybeItem);
            }
            else {
                return null;
            }
        });
    }
}
exports.AvoStorage = AvoStorage;
