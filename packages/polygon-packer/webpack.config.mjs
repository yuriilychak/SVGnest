import path from 'path';

export default {
    mode: 'production',
    entry: './src/index.js',
    target: 'web',
    devtool: 'source-map',
    output: {
        library: 'polygonPacker',
        libraryTarget: 'umd',
        umdNamedDefine: true,
        filename: 'polygon-packer.js',
        path: path.resolve('../../dist')
    },
    externals: {
        'svg-parser': 'svgParser'
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.worker\.ts$/,
                loader: 'worker-loader',
                options: {
                    filename: '[name].worker.js'
                }
            },
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    }
};
