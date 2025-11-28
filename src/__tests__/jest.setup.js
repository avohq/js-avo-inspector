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

// Suppress console output during tests (keeps test output clean)
// Tests that need to verify console calls can use (console.log as jest.Mock).mockClear() 
// and then check calls
jest.spyOn(console, 'log').mockImplementation();
jest.spyOn(console, 'warn').mockImplementation();
jest.spyOn(console, 'error').mockImplementation();

// Track active XHR requests for cleanup - exported for setupFilesAfterEnv
global.__activeXHRRequests = new Set();
global.__localStorageMock = localStorageMock;

const OriginalXMLHttpRequest = global.XMLHttpRequest;

// Wrap XMLHttpRequest to track active requests
class TrackedXMLHttpRequest extends OriginalXMLHttpRequest {
  constructor() {
    super();
    global.__activeXHRRequests.add(this);
    this.addEventListener('loadend', () => {
      global.__activeXHRRequests.delete(this);
    });
  }
  
  abort() {
    global.__activeXHRRequests.delete(this);
    super.abort();
  }
}

global.XMLHttpRequest = TrackedXMLHttpRequest;
