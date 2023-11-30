const webpack = require('webpack');

module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  resolve: {
    extensions: [".ts"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
      },
    ],
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.BROWSER': JSON.stringify(1),
    }),
  ],
  output: {
    filename: "browser.js",
    libraryTarget: "umd",
  },
};
