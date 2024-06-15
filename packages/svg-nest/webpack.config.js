const path = require('path');

module.exports = {
    mode: 'production',
    entry: './src/index.tsx',
    target: 'web',
    output: {
        filename: 'svg-nest.js',
        path: path.resolve(__dirname, '../../dist')
    },
    externals: {
        'polygon-packer': 'polygonPacker'
    },
    resolve: {
        extensions: ['.ts', '.js', '.jsx', '.tsx']
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
