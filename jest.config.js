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
  // src/browser.js is the script-tag bootstrap and is ES-module source, so a
  // test cannot require it untransformed. The .js rule is scoped to that one
  // file on purpose: a blanket .js pattern would also catch jest.setup.js,
  // whose native class extending XMLHttpRequest breaks once downleveled to the
  // ES5 target. Both entries carry the same options because Jest keys its
  // transformer cache on the transformer path alone — a second ts-jest entry
  // with different options would silently reuse the first one's config.
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", {
      tsconfig: {
        allowJs: true,
        checkJs: false,
        types: ["jest", "node"]
      }
    }],
    "browser\\.js$": ["ts-jest", {
      tsconfig: {
        allowJs: true,
        checkJs: false,
        types: ["jest", "node"]
      }
    }],
  },
  transformIgnorePatterns: ["/node_modules/", "\\.d\\.ts$"],
};
