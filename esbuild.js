const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const watch = process.argv.includes('--watch');

async function main() {
  // Build Extension
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: false,
    sourcemap: true,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
  });

  // Build Tests if test files exist
  let testCtx = null;
  const testDir = path.join(__dirname, 'src', 'test');
  if (fs.existsSync(testDir)) {
    const testFiles = fs.readdirSync(testDir)
      .filter(f => f.endsWith('.test.ts'))
      .map(f => path.join('src', 'test', f));

    if (testFiles.length > 0) {
      testCtx = await esbuild.context({
        entryPoints: testFiles,
        bundle: true,
        format: 'cjs',
        sourcemap: true,
        platform: 'node',
        outdir: 'dist/test',
        external: ['vscode', 'mocha'],
        logLevel: 'info',
      });
    }
  }

  if (watch) {
    await extensionCtx.watch();
    if (testCtx) await testCtx.watch();
    console.log('[esbuild] Watching for changes...');
  } else {
    await extensionCtx.rebuild();
    await extensionCtx.dispose();
    if (testCtx) {
      await testCtx.rebuild();
      await testCtx.dispose();
    }
    console.log('[esbuild] Build complete.');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});

