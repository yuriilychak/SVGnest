const path = require('path')
const TerserPlugin = require('terser-webpack-plugin')

module.exports = {
    mode: 'production',
    entry: './src/index.tsx',
    target: 'web',
    output: {
        filename: 'web-interface.js',
        path: path.resolve(__dirname, '../../dist')
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
}
