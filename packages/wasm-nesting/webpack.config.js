const path = require('path');

module.exports = {
  entry: path.resolve(__dirname, './scripts/init-wasm.js'),
  output: {
    path: path.resolve(__dirname, '../../dist'),
    filename: 'wasm-nesting.js',
    library: 'WasmNesting',
    libraryTarget: 'umd',
    globalObject: 'self', // Use 'self' for Web Worker compatibility
  },
  target: 'webworker', // Ensure compatibility with Web Workers
  mode: 'production',
  resolve: {
    extensions: ['.js', '.wasm'],
  },
  module: {
    rules: [
      {
        test: /\.wasm$/,
        type: 'asset/resource',
      },
    ],
  },
  experiments: {
    asyncWebAssembly: true,
  },
};
