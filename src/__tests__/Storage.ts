import { AvoStorage } from "../AvoStorage";

describe("Avo Storage", () => {
  const storage = new AvoStorage();

  const key = "avoKey";
  const value = "avoValue";

  test("Sets and gets item", () => {
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

  test("Deletes item", () => {
    storage.removeItem(key);

    const item = storage.getItem(key);

    expect(item).toBeNull();
  });
});
