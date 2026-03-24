const path = require("path");

module.exports = {
  mode: "production",
  entry: path.resolve(__dirname, "..", "dist", "lite", "index.js"),
  output: {
    filename: "bundle-lite.js",
    path: path.resolve(__dirname, "..", "test-bundle-size", "output"),
    libraryTarget: "umd",
  },
  optimization: {
    splitChunks: false,
  },
};
