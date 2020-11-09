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
});

describe("Avo Storage unavailable", () => {  
  test("Set and get fails silently", () => {
    Object.defineProperty(window, 'localStorage', {});
    const storage = new AvoStorage(false);

    const key = "avoKey";
    const value = "avoValue";

    storage.setItem(key, value);
    const item = storage.getItem(key);
    expect(item).toBeNull()
  });

  test("Remove and get fails silently", () => {
    Object.defineProperty(window, 'localStorage', {});
    const storage = new AvoStorage(false);

    const key = "avoKey";

    storage.removeItem(key);
    const item = storage.getItem(key);

    expect(item).toBeNull();
  });
});
