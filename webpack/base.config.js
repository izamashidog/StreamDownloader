const path = require('path');

module.exports = {
  entry: {
    'service-worker': './src/service-worker/index.ts',
    'popup': './src/popup/index.ts',
    'sidepanel': './src/sidepanel/index.ts',
    'content': './src/content/index.ts'
  },
  output: {
    path: path.resolve(__dirname, '../dist'),
    filename: '[name].js',
    clean: true
  },
  resolve: {
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  }
};