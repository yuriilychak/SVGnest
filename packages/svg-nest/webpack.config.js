const path = require("path");

module.exports = {
  mode: "production",
  entry: "./src/index.js",
  target: 'web',
  externals: {
    'polygon-packer': 'polygonPacker'
  },
  output: {
    filename: "svg-nest.js",
    path: path.resolve(__dirname, "dist")
  }
};
