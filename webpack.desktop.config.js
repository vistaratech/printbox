const path = require('path');

module.exports = {
  entry: './dist/desktop/desktopAgent.js',
  output: {
    filename: 'agent.js',
    path: path.resolve(__dirname, 'release', 'PrintBox-Setup'),
  },
  target: 'node',
  mode: 'production',
  resolve: {
    extensions: ['.js', '.json'],
  },
  externals: {
    // better-sqlite3 has native bindings - NOT used in desktop agent
    // pdf-to-printer needs to remain external (spawns SumatraPDF process)
  },
  module: {
    rules: [
      {
        test: /\.node$/,
        use: 'node-loader',
      },
    ],
  },
  optimization: {
    minimize: true,
  },
  // Ignore optional/problematic deps
  plugins: [
    {
      apply(compiler) {
        compiler.hooks.normalModuleFactory.tap('IgnorePlugin', (nmf) => {
          nmf.hooks.beforeResolve.tap('IgnorePlugin', (result) => {
            if (!result) return;
            // Ignore native modules not needed
            if (result.request === 'better-sqlite3') {
              return false;
            }
          });
        });
      },
    },
  ],
};
