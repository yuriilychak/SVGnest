import path from 'path';

export default {
    mode: 'production',
    entry: './src/index.ts',
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
        'geometry-utils': 'geometryUtils',
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
                    filename: '[name].js'
                }
            },
            {
                test: /\.tsx?$/,
                use: [
                    {
                        loader: 'ts-loader',
                        options: {
                            transpileOnly: true // Use options here
                        }
                    }
                ],
                exclude: /node_modules/
            }
        ]
    }
};
