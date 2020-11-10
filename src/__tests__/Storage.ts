import { AvoStorage } from "../AvoStorage";
import { defaultOptions } from "../__tests__/constants";

const originalWindow = { ...window };

beforeEach(() => {
  window = originalWindow;
});

describe("Avo Storage", () => {
  const storage = new AvoStorage(defaultOptions.shouldLog);

  const key = "avoKey";
  const value = "avoValue";

  test("Sets and gets item with shouldLog on", () => {
    const storage = new AvoStorage(true);

    storage.setItem(key, value);

    const item = storage.getItem(key);

    expect(item).toBe(value);
  });

  test("Sets and gets item with shouldLog off", () => {
    const storage = new AvoStorage(false);

    storage.setItem(key, value);

    const item = storage.getItem(key);

    expect(item).toBe(value);
  });

  test("Gets item asynchronously", async () => {
    storage.removeItem(key);
    storage.setItem(key, value);

    const item = await storage.getItemAsync(key);

    expect(item).toBe(value);
  });

  test("Returns null if key does not exist", () => {
    storage.removeItem(key);

    const item = storage.getItem(key);

    expect(item).toBeNull();
  });

  test("Deletes item with shouldLog on", () => {
    const storage = new AvoStorage(true);

    storage.removeItem(key);

    const item = storage.getItem(key);

    expect(item).toBeNull();
  });

  test("Deletes item with shouldLog off", () => {
    const storage = new AvoStorage(false);

    storage.removeItem(key);

    const item = storage.getItem(key);

    expect(item).toBeNull();
  });

  test("storage writes are delayed until the storage is initialized on web", () => {
    storage.storageInitialized = false;

    storage.setItem(key, "OnStorageInitFuncs on web");

    const itemBeforeInit = storage.getItem(key);

    expect(itemBeforeInit).toBeNull();

    storage.initializeStorageWeb(true);

    const itemAfterInit = storage.getItem(key);

    expect(itemAfterInit).toEqual("OnStorageInitFuncs on web");
  });

  test("storage writes are delayed until the storage is initialized on android", () => {
    storage.storageInitialized = false;

    storage.setItem(key, "OnStorageInitFuncs on android");

    const itemBeforeInit = storage.getItem(key);

    expect(itemBeforeInit).toBeNull();

    storage.initializeStorageIos();

    const itemAfterInit = storage.getItem(key);

    expect(itemAfterInit).toEqual("OnStorageInitFuncs on android");
  });

  test("storage writes are delayed until the storage is initialized on ios", () => {
    storage.storageInitialized = false;

    storage.setItem(key, "OnStorageInitFuncs on ios");

    const itemBeforeInit = storage.getItem(key);

    expect(itemBeforeInit).toBeNull();

    storage.initializeStorageWeb(true);

    const itemAfterInit = storage.getItem(key);

    expect(itemAfterInit).toEqual("OnStorageInitFuncs on ios");
  });
});

describe("Avo Storage unavailable", () => {
  const key = "avoKey";
  const value = "avoValue";

  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {});
  });

  test("Fallback mode enabled", () => {
    const storage = new AvoStorage(false);
    expect(storage.useFallback).toBe(true);
    expect(storage.storageInitialized).toBe(true);
  });

  test("Sets and gets item with shouldLog on", () => {
    const storage = new AvoStorage(true);

    storage.setItem(key, value);

    const item = storage.getItem(key);

    expect(item).toBe(value);
  });

  test("Sets and gets item with shouldLog off", () => {
    const storage = new AvoStorage(false);

    storage.setItem(key, value);

    const item = storage.getItem(key);

    expect(item).toBe(value);
  });

  test("Gets item asynchronously", async () => {
    const storage = new AvoStorage(false);

    storage.removeItem(key);
    storage.setItem(key, value);

    const item = await storage.getItemAsync(key);

    expect(item).toBe(value);
  });

  test("Returns null if key does not exist", () => {
    const storage = new AvoStorage(false);

    storage.removeItem(key);

    const item = storage.getItem(key);

    expect(item).toBeNull();
  });

  test("Deletes item with shouldLog on", () => {
    const storage = new AvoStorage(true);

    storage.removeItem(key);

    const item = storage.getItem(key);

    expect(item).toBeNull();
  });

  test("Deletes item with shouldLog off", () => {
    const storage = new AvoStorage(false);

    storage.removeItem(key);

    const item = storage.getItem(key);

    expect(item).toBeNull();
  });
});
