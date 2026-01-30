/**
 * Bundle the extension with esbuild so runtime dependencies (e.g. exceljs)
 * are included in the output. Keeps node_modules out of the VSIX.
 */
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'out');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function main() {
  await esbuild.build({
    entryPoints: [path.join(root, 'src', 'extension.ts')],
    bundle: true,
    outfile: path.join(outDir, 'extension.js'),
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    sourcemap: true,
    minify: false,
    target: 'node18',
    tsconfig: path.join(root, 'tsconfig.json'),
    // Resolve .ts so we don't need a separate tsc step for the bundle
    loader: { '.ts': 'ts' },
  }).catch(() => process.exit(1));
}

main();
