import webpack from 'webpack';
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
        'geometry-utils': 'geometryUtils'
    },
    resolve: { extensions: ['.ts'] },
    devServer: { contentBase: '../../dist', hot: true },
    plugins: [new webpack.HotModuleReplacementPlugin()],
    module: {
        rules: [
            {
                test: /\.ts?$/,
                use: [{ loader: 'ts-loader', options: { transpileOnly: true } }],
                exclude: /node_modules/
            }
        ]
    }
};
