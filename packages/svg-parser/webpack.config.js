const path = require('path');

module.exports = {
    mode: 'production',
    entry: './src/index.ts',
    target: 'web',
    output: {
        library: 'svgParser',
        libraryTarget: 'umd',
        umdNamedDefine: true,
        filename: 'svg-parser.js',
        path: path.resolve(__dirname, '../../dist')
    },
    resolve: {
        extensions: ['.ts', '.js']
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/
            }
        ]
    }
};
