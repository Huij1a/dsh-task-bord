import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['client.jsx'],
  bundle: true,
  format: 'esm',
  external: ['react', 'react/jsx-runtime', 'react-dom'],
  outfile: 'client.js',
  jsx: 'automatic',
  target: 'es2020',
  minify: false,
  sourcemap: true,
});

console.log('[authoring-board] client.js built');
