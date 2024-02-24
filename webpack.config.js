import path from "path";
import { URL } from "url";

const __dirname = new URL(".", import.meta.url).pathname;

export default {
  mode: "production",
  entry: "./src/index.ts",
  output: {
    filename: "main.js",
    path: path.resolve(__dirname, "dist")
  },
  devtool: "source-map",
  resolve: {
    extensions: [".ts", ".js"]
  },
  module: {
    rules: [
      {
        test: /\.worker\.ts$/,
        loader: "worker-loader",
        options: {
          filename: "[name].js"
        }
      },
      {
        test: /\.ts$/,
        loader: "ts-loader"
      }
    ]
  }
};
