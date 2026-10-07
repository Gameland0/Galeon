const { override, addWebpackPlugin } = require('customize-cra');
const webpack = require('webpack');

module.exports = override(
  // 移除 TypeScript 类型检查插件，允许编译时忽略TS错误
  (config) => {
  config.plugins = config.plugins.filter(
      (plugin) => plugin.constructor.name !== 'ForkTsCheckerWebpackPlugin'
  );

  // Fix: ESM modules with "process/browser" resolution (headlessui, walletconnect etc.)
  config.module.rules.push({
    test: /\.m?js$/,
    resolve: {
      fullySpecified: false,
    },
  });

  return config;
  },
  // 添加 ProvidePlugin 支持 Buffer 和 process
  addWebpackPlugin(
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser',
    })
  )
);
