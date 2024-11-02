import webpack from 'webpack';
import path from 'path';

export default {
    mode: 'production',
    entry: './src/index.ts',
    target: 'web',
    devtool: 'source-map',
    output: {
        library: 'geometryUtils',
        libraryTarget: 'umd',
        umdNamedDefine: true,
        filename: 'geometry-utils.js',
        path: path.resolve('../../dist')
    },
    resolve: { extensions: ['.ts'] },
    devServer: { contentBase: '../../dist', hot: true },
    plugins: [new webpack.HotModuleReplacementPlugin()],
    module: {
        rules: [{ test: /\.tsx?$/, use: 'ts-loader', exclude: /node_modules/ }]
    }
};
