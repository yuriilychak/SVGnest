const path = require("path");

module.exports = {
  mode: "production",
  entry: "./src/index.js",
  output: {
    filename: "svg-nest.js",
    path: path.resolve(__dirname, "dist")
  },
  module: {
    rules: [
      {
        test: /\.worker\.js$/,
        use: { loader: "worker-loader" }
      }
    ]
  }
};
