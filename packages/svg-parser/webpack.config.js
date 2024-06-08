const path = require('path');

module.exports = {
    mode: 'production',
    entry: './src/index.js',
    target: 'web',
    output: {
        library: 'svgParser',
        libraryTarget: 'umd',
        umdNamedDefine: true,
        filename: 'svg-parser.js',
        path: path.resolve(__dirname, '../../dist')
    }
};
