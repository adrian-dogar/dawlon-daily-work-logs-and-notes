const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['extension.js'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node'
}).catch(() => process.exit(1));