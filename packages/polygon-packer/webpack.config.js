const path = require("path");

module.exports = {
  mode: "production",
  entry: "./src/index.js",
  target: 'web',
  output: {
    library: "polygonPacker",
    libraryTarget: 'umd',
    umdNamedDefine: true,
    filename: "polygon-packer.js",
    path: path.resolve(__dirname, "../../dist")
  },
  externals: {
    'svg-parser': 'svgParser'
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
