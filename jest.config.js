module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/src/__tests__/jest.setup.js"],
  moduleNameMapper: {
    "^react-native$": "<rootDir>/src/__tests__/jest.setup.js",
  },
  testMatch: [
    "**/src/__tests__/**/*.ts",
    "!**/src/__tests__/setup.ts",
    "!**/src/__tests__/constants.ts",
    "!**/src/__tests__/helpers/**",
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    "/dist/",
    "/examples/",
    "/constants/",
  ],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  transformIgnorePatterns: ["/node_modules/", "\\.d\\.ts$"],
};
