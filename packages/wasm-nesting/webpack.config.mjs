import path from 'path';

export default {
    entry: path.resolve('./scripts/init-wasm.js'),
    output: {
        path: path.resolve('../../dist'),
        filename: 'wasm-nesting.js',
        library: {
            name: 'WasmNesting',
            type: 'umd',
        },
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
