export const getItem = <T>(key: string): T | null => {
  let maybeItem = window.localStorage.getItem(key);
  if (maybeItem !== null) {
    return JSON.parse(maybeItem);
  } else {
    return null;
  }
};

export const setItem = <T>(key: string, value: T): void => {
  window.localStorage.setItem(key, JSON.stringify(value));
};

export const removeItem = (key: string): void => {
  window.localStorage.removeItem(key);
};

export const clear = () => {
  window.localStorage.clear();
};

export default {
  getItem,
  setItem,
  removeItem,
  clear,
};
