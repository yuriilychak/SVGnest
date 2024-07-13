import path from 'path';
import TerserPlugin from 'terser-webpack-plugin';

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
        'polygon-packer': 'polygonPacker'
    },
    resolve: {
        extensions: ['.ts', '.js', '.jsx', '.tsx', '.json']
    },
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()]
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
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    }
};
