/**
 * Regression tests for AVO-3848: on Android the storage used to enumerate the
 * host app's whole AsyncStorage at startup and, with logging on, print every
 * key and value. It must never list or read the host app's AsyncStorage.
 */

const hostKeys: { [key: string]: string } = {
  "some-auth-lib:token": "\"secret-token\"",
  "user:email": "\"someone@example.com\"",
};
const avoKeys: { [key: string]: string } = {
  AvoInspectorEvents: "[]",
  AvoInspectorAnonymousId: "\"anon-id\"",
};
const allData: { [key: string]: string } = { ...hostKeys, ...avoKeys };

const mockAsyncStorage = {
  getAllKeys: jest.fn(() => Promise.resolve(Object.keys(allData))),
  multiGet: jest.fn((keys: Array<string>) =>
    Promise.resolve(keys.map((key) => [key, allData[key] ?? null]))
  ),
  getItem: jest.fn((key: string) => Promise.resolve(allData[key] ?? null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
};

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: mockAsyncStorage,
}));

import { AvoStorage } from "../AvoStorage";

describe("Android storage", () => {
  const originalBrowser = process.env.BROWSER;
  let logSpy: jest.SpyInstance;

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    delete process.env.BROWSER;
    jest.clearAllMocks();
    logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    if (originalBrowser === undefined) {
      delete process.env.BROWSER;
    } else {
      process.env.BROWSER = originalBrowser;
    }
  });

  test("never lists or reads the host app's AsyncStorage at startup", async () => {
    new AvoStorage(true);
    await flush();

    expect(mockAsyncStorage.getAllKeys).not.toHaveBeenCalled();
    expect(mockAsyncStorage.multiGet).not.toHaveBeenCalled();
    expect(mockAsyncStorage.getItem).not.toHaveBeenCalled();
  });

  test("logs nothing at startup even when logging is on", async () => {
    new AvoStorage(() => true);
    await flush();

    expect(logSpy).not.toHaveBeenCalled();
  });

  test("getItemAsync reads the stored Avo value (positive control: mock is wired)", async () => {
    const storage = new AvoStorage(false);

    await expect(storage.getItemAsync("AvoInspectorAnonymousId")).resolves.toBe(
      "anon-id"
    );
    expect(mockAsyncStorage.getItem).toHaveBeenCalledWith(
      "AvoInspectorAnonymousId"
    );
  });

  test("setItem and removeItem go straight to AsyncStorage", () => {
    const storage = new AvoStorage(false);

    storage.setItem("AvoInspectorEvents", [1]);
    storage.removeItem("AvoInspectorEvents");

    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      "AvoInspectorEvents",
      "[1]"
    );
    expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith(
      "AvoInspectorEvents"
    );
  });

  test("synchronous getItem throws instead of returning null", () => {
    const storage = new AvoStorage(false);

    expect(() => storage.getItem("AvoInspectorAnonymousId")).toThrow(
      /not supported on Android/
    );
  });

  test("is initialized and runAfterInit runs its callback immediately", () => {
    const storage = new AvoStorage(false);
    const callback = jest.fn();

    storage.runAfterInit(callback);

    expect(storage.isInitialized()).toBe(true);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
