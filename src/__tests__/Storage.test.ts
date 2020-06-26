import { AvoStorage } from "../AvoStorage";

describe("Avo Storage", () => {
  process.env.BROWSER = "1";

  const storage = new AvoStorage();

  const key = "avoKey";
  const value = "avoValue";

  test("Set and get item", () => {
    storage.setItem(key, value);

    const item = storage.getItem(key);

    expect(item).toBe(value);
  });

  test("Delete item", () => {
    storage.removeItem(key);

    const item = storage.getItem(key);

    expect(item).toBeNull();
  });
});
