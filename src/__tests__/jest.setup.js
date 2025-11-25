// Polyfill TextEncoder and TextDecoder for eciesjs and other crypto libraries
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Set process.env.BROWSER so BrowserAvoStorage uses localStorage in tests
process.env.BROWSER = "true";

// Mock localStorage for all tests
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock Platform.OS for React Native
jest.mock("react-native", () => ({
  Platform: {
    OS: "ios",
  },
}));
