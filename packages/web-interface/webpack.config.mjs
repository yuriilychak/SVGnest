import path from 'path';

export default {
    mode: 'production',
    entry: './src/index.tsx',
    target: 'web',
    devtool: 'source-map',
    output: {
        filename: 'web-interface.js',
        path: path.resolve('../../dist')
    },
    externals: {
        'geometry-utils': 'geometryUtils',
        'polygon-packer': 'polygonPacker',
        'svg-parser': 'svgParser'
    },
    resolve: {
        extensions: ['.js', '.jsx', '.ts', '.tsx']
    },
    module: {
        rules: [
            {
                test: /\.(js|jsx)$/, // .js and .jsx files
                exclude: /node_modules/, // excluding the node_modules folder
                use: {
                    loader: 'babel-loader'
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
