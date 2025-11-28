module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFiles: ["<rootDir>/src/__tests__/jest.setup.js"],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/jest.setupAfterEnv.js"],
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
  modulePathIgnorePatterns: [
    "<rootDir>/dist/",
    "<rootDir>/dist-native/",
  ],
  transform: {
    "^.+\\.(ts|tsx)$": "ts-jest",
  },
  transformIgnorePatterns: ["/node_modules/", "\\.d\\.ts$"],
};
