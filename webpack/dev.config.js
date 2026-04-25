const { merge } = require('webpack-merge');
const base = require('./base.config.js');
const path = require('path');

module.exports = merge(base, {
  mode: 'development',
  devtool: 'inline-source-map',
  devServer: {
    static: {
      directory: path.resolve(__dirname, '../dist')
    },
    port: 3000,
    hot: true,
    open: false
  },
  output: {
    path: path.resolve(__dirname, '../dist'),
    filename: '[name].js'
  }
});