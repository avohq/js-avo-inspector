const webpack = require('webpack');

module.exports = {
  mode: 'production',
  entry: './src/index.ts',
  resolve: {
    extensions: [".ts", ".js"],
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
    filename: "index.js",
    libraryTarget: "umd",
  },
};
