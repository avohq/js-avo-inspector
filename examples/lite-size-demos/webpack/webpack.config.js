const path = require("path");
module.exports = {
  mode: "production",
  entry: "./entry.js",
  output: {
    filename: "bundle.min.js",
    path: path.resolve(__dirname, "build"),
    libraryTarget: "umd",
  },
};
