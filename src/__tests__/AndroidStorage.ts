/**
 * Regression tests for AVO-3848: on Android, the storage loads AsyncStorage
 * into memory at startup. It used to load every key of the host app and, with
 * logging on, print each key and value. It must only read Avo Inspector keys
 * and never print stored values.
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

  const initStorage = (shouldLog: boolean): Promise<AvoStorage> => {
    const storage = new AvoStorage(shouldLog);
    return new Promise((resolve) =>
      storage.runAfterInit(() => resolve(storage))
    );
  };

  const loggedText = (): string =>
    JSON.stringify(logSpy.mock.calls.map((call) => call.map(String)));

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

  test("only reads Avo Inspector keys from AsyncStorage", async () => {
    await initStorage(true);

    expect(mockAsyncStorage.multiGet).toHaveBeenCalledTimes(1);
    const requestedKeys = mockAsyncStorage.multiGet.mock.calls[0][0];
    expect([...requestedKeys].sort()).toEqual(Object.keys(avoKeys).sort());
  });

  test("keeps only Avo Inspector data in memory", async () => {
    const storage = await initStorage(true);
    const memory = (storage.storageImpl as any)
      .androidMemoryDataToAvoidAsyncQueries;

    expect(Object.keys(memory).sort()).toEqual(Object.keys(avoKeys).sort());
    expect(storage.getItem("AvoInspectorAnonymousId")).toBe("anon-id");
    expect(storage.getItem("some-auth-lib:token")).toBeNull();
  });

  test("never logs stored keys or values, but logs a summary when logging is on", async () => {
    await initStorage(true);

    const text = loggedText();
    expect(text).toContain("loaded 2 cached items");
    [...Object.keys(allData), ...Object.values(allData)].forEach((s) => {
      expect(text).not.toContain(s);
    });
  });

  test("logs nothing when logging is off", async () => {
    await initStorage(false);

    expect(logSpy).not.toHaveBeenCalled();
  });

  test("setShouldLog(false) before the load finishes silences the summary", async () => {
    const storage = new AvoStorage(true);
    storage.setShouldLog(false);
    await new Promise<void>((resolve) => storage.runAfterInit(resolve));

    expect(logSpy).not.toHaveBeenCalled();
  });

  test("skips multiGet when there are no Avo Inspector keys", async () => {
    mockAsyncStorage.getAllKeys.mockImplementationOnce(() =>
      Promise.resolve(Object.keys(hostKeys))
    );

    const storage = await initStorage(false);

    expect(mockAsyncStorage.multiGet).not.toHaveBeenCalled();
    expect(storage.isInitialized()).toBeTruthy();
  });
});
