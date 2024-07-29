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
            },
            {
                test: /node_modules\/js-clipper\/.*\.js$/,
                use: [
                    {
                        loader: 'string-replace-loader',
                        options: {
                            search: 'alert',
                            replace: 'console.log',
                            flags: 'g'
                        }
                    }
                ]
            }
        ]
    }
};
