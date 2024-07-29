import path from 'path';
import webpack from 'webpack';

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
    externals: {
        'geometry-utils': 'geometryUtils'
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
    },
    plugins: [
        new webpack.NormalModuleReplacementPlugin(/js-clipper/, resource => {
            resource.request = resource.request.replace(/alert\((.*?)\)/g, 'console.log($1)');
        })
    ]
};
