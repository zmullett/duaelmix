const HtmlWebpackPlugin = require('html-webpack-plugin');
const outputPath = require('path').join(__dirname, 'firebase', 'public');

const isProd = process.env.NODE_ENV === 'production';

module.exports = {
  devServer: {
    contentBase: outputPath,
    port: 9000,
  },
  devtool: isProd ? '' : 'inline-source-map',
  mode: isProd ? 'production' : 'development',
  module: {
    rules: [
      {
        test: /\.(png|TTF)$/,
        use: {
          loader: 'file-loader',
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
    ]
  },
  node: {
    fs: 'empty',
    net: 'empty',
    tls: 'empty',
  },
  output: {
    path: outputPath,
  },
  plugins: [
    new HtmlWebpackPlugin({
      title: 'duælmix'
    })
  ]
};



